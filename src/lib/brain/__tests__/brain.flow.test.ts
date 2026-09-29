/**
 * The brain's loop against a real Postgres, with the model scripted and the clock faked.
 * Run: DATABASE_URL=postgresql://test@127.0.0.1:55432/li_test npx vitest run brain.flow
 * (the database name must contain "test"; every run makes its own user).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ChatOptions } from "@/lib/ai/llm";

const DB = process.env.DATABASE_URL ?? "";
const enabled = /test/.test(DB);

// ── Scripted model ───────────────────────────────────────────────────────────
const calls: string[] = [];
let gradeReply: unknown = null;
let hangGrade = false;
let extractReply: unknown = { claims: [] };
let summaryReply = "";

vi.mock("@/lib/ai/llm", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/ai/llm")>();
  const reply = (content: string) => ({ content, evalCount: 0, promptEvalCount: 0, durationMs: 0 });
  return {
    ...real,
    chat: vi.fn(async (opts: ChatOptions) => {
      const sys = opts.messages[0].content;
      if (sys.startsWith("You grade Abhay's day")) {
        calls.push("grade");
        if (hangGrade) {
          await new Promise((_, reject) => opts.signal?.addEventListener("abort", () => reject(new real.LlmAborted("Cancelled"))));
        }
        return reply(JSON.stringify(gradeReply ?? {}));
      }
      if (sys.startsWith("You learn about Abhay")) {
        calls.push("extract");
        return reply(JSON.stringify(extractReply));
      }
      if (sys.startsWith("Summarise what is known")) {
        calls.push("summary");
        return reply(summaryReply);
      }
      if (sys.startsWith("You are Abhay's honest life coach reading his journal")) {
        calls.push("journal");
        return reply(JSON.stringify({ journalScore: 7, journalFeedback: "Honest entry." }));
      }
      calls.push(`other:${sys.slice(0, 20)}`);
      return reply("ok");
    }),
  };
});

const { default: prisma } = await import("@/lib/prisma");
const { Brain } = await import("../loop");
const { BrainStore } = await import("../storage");
const { readLiveState } = await import("../scores");
const { saveNudges, tidyUp } = await import("../jobs");
const { judgeDay } = await import("@/lib/ai/judge");
const { readRationale } = await import("@/lib/score-rationale");
const { getStartOfDay } = await import("@/lib/utils");

describe.skipIf(!enabled)("brain loop", () => {
  let userId = "";
  let clock = new Date();
  let activity = { inflight: 0, last: 0 };
  let changedAt = 0;
  let dir = "";
  let brain: InstanceType<typeof Brain>;
  const at = (h: number, m = 0, s = 0) => {
    const d = new Date();
    d.setHours(h, m, s, 0);
    return d;
  };
  const advance = (ms: number) => (clock = new Date(clock.getTime() + ms));
  const make = () =>
    new Brain({
      store: new BrainStore(dir),
      userId,
      now: () => clock,
      activity: () => activity,
      changedAt: () => changedAt,
      log: () => undefined,
    });

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `brain-${Date.now()}@test.local`, name: "Abhay" } });
    userId = user.id;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "brain-flow-"));
    clock = at(14);
    brain = make();
  });

  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.brainState.deleteMany({ where: { key: { in: ["live-scores", "quiz"] } } });
  });

  // Let the startup work (fingerprint check, ingest, corrections) happen with nothing going on.
  async function settle() {
    for (let i = 0; i < 6; i++) await brain.tick();
  }

  it("re-grades once, 10 s after a burst of changes, citing only real facts", async () => {
    await settle();
    await prisma.todo.create({ data: { userId, title: "Pay rent", area: "financial", status: "done", completedAt: clock } });
    await prisma.habit.create({ data: { userId, name: "Stretch", area: "physical" } });
    gradeReply = {
      financial: { score: 10, why: [1, 42], improve: "Z" },
      physical: { score: 0, why: [2], improve: "" },
      mental: { score: 6, why: [], improve: "" },
    };
    calls.length = 0;

    for (const gap of [0, 3000, 3000]) {
      advance(gap);
      changedAt = clock.getTime();
      expect(await brain.tick()).toBe("change-seen");
    }
    expect((await readLiveState()).pending).toBe(true);
    advance(5000); // 5 s after the last change: still waiting
    expect(await brain.tick()).not.toBe("regrade");
    expect(calls).not.toContain("grade");
    advance(6000);
    expect(await brain.tick()).toBe("regrade");
    expect(calls.filter((c) => c === "grade")).toHaveLength(1);
    expect((await readLiveState()).pending).toBe(false);

    const row = await prisma.categoryScore.findUniqueOrThrow({ where: { userId_date: { userId, date: getStartOfDay(clock) } } });
    const r = readRationale(row.rationale);
    // Financial: baseline 8 for one good fact; the model's 10 is within 2, its bogus fact 42 and option Z are dropped.
    expect(row.financial).toBe(10);
    expect(r.financial.why).toEqual(["✓ Done: “Pay rent”"]);
    expect(r.financial.improve).toBe("Log what you spent or saved today (Journal → Quick log)");
    // Physical: the model's 0 is clamped to baseline 3 - 2 = 1; the "why" is the real missed habit.
    expect(row.physical).toBe(1);
    expect(r.physical.why).toEqual(["✗ Habit not done yet: “Stretch”"]);
    expect(r.physical.improve).toBe("Do your habit “Stretch”");
    // No data for spiritual: no score, not a guess.
    expect(r.spiritual.noData).toBe(true);
    expect(row.finalized).toBe(false);

    // Nothing changed since: another change signal doesn't call the model again.
    advance(1000);
    changedAt = clock.getTime();
    await brain.tick();
    advance(11_000);
    expect(await brain.tick()).toBe("regrade-unchanged");
    expect(calls.filter((c) => c === "grade")).toHaveLength(1);
  });

  it("waits while he's chatting, and cancels a background call the moment he starts", async () => {
    await prisma.todo.create({ data: { userId, title: "Budget review", area: "financial", status: "done", completedAt: clock } });
    gradeReply = { financial: { score: 9, why: [], improve: "" } };
    advance(1000);
    changedAt = clock.getTime();
    await brain.tick();
    activity = { inflight: 1, last: clock.getTime() };
    advance(15_000);
    calls.length = 0;
    expect(await brain.tick()).toBe(null);
    expect(calls).toEqual([]);

    // Chat ends; 10 s later the grade starts, then he sends another message mid-call.
    activity = { inflight: 0, last: clock.getTime() };
    advance(11_000);
    hangGrade = true;
    const pending = brain.tick();
    await new Promise((r) => setTimeout(r, 50));
    activity = { inflight: 1, last: clock.getTime() };
    brain.checkInterrupt();
    expect(await pending).toBe("regrade-yielded");
    hangGrade = false;

    activity = { inflight: 0, last: clock.getTime() };
    advance(11_000);
    expect(await brain.tick()).toBe("regrade");
    const row = await prisma.categoryScore.findUniqueOrThrow({ where: { userId_date: { userId, date: getStartOfDay(clock) } } });
    expect(readRationale(row.rationale).financial.why.join(" ")).toContain("Budget review");
  });

  it("learns from what he says, keeps only grounded claims, and syncs the profile", async () => {
    await prisma.chatMessage.create({ data: { userId, role: "user", content: "honestly i keep scrolling instagram when i should be doing homework", createdAt: clock } });
    await prisma.chatMessage.create({ data: { userId, role: "user", content: "i had a pineapple for breakfast today", createdAt: clock } });
    extractReply = {
      claims: [
        { n: 1, category: "distractions", claim: "He gets distracted by social media during homework" },
        { n: 2, category: "food", claim: "He stuffs pineapples with hot sauce for 10000 points" },
      ],
    };
    advance(61_000);
    activity = { inflight: 0, last: clock.getTime() - 120_000 };
    calls.length = 0;
    const did: string[] = [];
    for (let i = 0; i < 8 && !did.includes("extract"); i++) did.push(String(await brain.tick()));
    expect(did).toContain("ingest");
    expect(did).toContain("extract");
    expect(calls).toContain("extract");
    const distractions = new BrainStore(dir).readObservations("distractions");
    expect(distractions.map((o) => o.claim)).toEqual(["He gets distracted by social media during homework."]);
    expect(new BrainStore(dir).readObservations("food")).toEqual([]);

    for (let i = 0; i < 4; i++) await brain.tick();
    const doc = await prisma.profileDoc.findUniqueOrThrow({ where: { userId_category: { userId, category: "distractions" } } });
    const content = doc.content as { beliefs: { id: string; text: string; evidence: { text: string }[] }[] };
    expect(content.beliefs[0].text).toBe("He gets distracted by social media during homework.");
    expect(content.beliefs[0].evidence[0].text).toContain("instagram");
    expect(fs.readFileSync(path.join(dir, "profile/distractions.md"), "utf8")).toContain("social media");

    // "That's wrong": the belief is rejected in the files and the doc.
    await prisma.profileCorrection.create({ data: { userId, category: "distractions", beliefId: content.beliefs[0].id, text: content.beliefs[0].text } });
    advance(61_000);
    for (let i = 0; i < 4; i++) await brain.tick();
    expect(new BrainStore(dir).readObservations("distractions")[0].status).toBe("rejected");
    const after = await prisma.profileDoc.findUniqueOrThrow({ where: { userId_category: { userId, category: "distractions" } } });
    expect((after.content as { beliefs: unknown[] }).beliefs).toEqual([]);
  });

  it("loads quiz answers into the profile without the model", async () => {
    await prisma.brainState.upsert({
      where: { key: "quiz" },
      update: { value: { answers: { "learn-how": ["Watching videos", "Doing it hands-on"], "learn-stick": ["Practice problems"], "focus-span": "About 30 minutes" } } },
      create: { key: "quiz", value: { answers: { "learn-how": ["Watching videos", "Doing it hands-on"], "learn-stick": ["Practice problems"], "focus-span": "About 30 minutes" } } },
    });
    advance(61_000);
    calls.length = 0;
    for (let i = 0; i < 6; i++) await brain.tick();
    const doc = await prisma.profileDoc.findUniqueOrThrow({ where: { userId_category: { userId, category: "learning" } } });
    const beliefs = (doc.content as { beliefs: { text: string; source: string; level: string }[] }).beliefs;
    expect(beliefs).toContainEqual(expect.objectContaining({ text: "He learns best by: watching videos, doing it hands-on.", source: "quiz", level: "high" }));
    expect(beliefs).toHaveLength(2);
    expect(calls.filter((c) => c === "extract" || c === "summary")).toEqual([]);
  });

  it("nudges: tidy-up finds duplicates, and a dismissed nudge stays dismissed", async () => {
    await prisma.todo.createMany({ data: [{ userId, title: "Call the dentist" }, { userId, title: "call the dentist!" }] });
    const first = await saveNudges(userId, await tidyUp(userId, clock), clock);
    const dup = first.find((n) => n.key.startsWith("dup:"));
    expect(dup?.title).toMatch(/Duplicate to-do/);
    expect(await saveNudges(userId, await tidyUp(userId, clock), clock)).toEqual([]);
    await prisma.brainNudge.updateMany({ where: { userId, key: dup!.key }, data: { status: "dismissed" } });
    const tomorrow = new Date(clock.getTime() + 86_400_000);
    expect((await saveNudges(userId, await tidyUp(userId, tomorrow), tomorrow)).find((n) => n.key === dup!.key)).toBeUndefined();
  });

  it("night shift: consolidates every category, keeps only grounded summaries, snapshots", async () => {
    summaryReply = "You learn best by watching videos, doing it hands-on and practice problems.";
    clock = new Date(clock.getTime() + 86_400_000);
    clock.setHours(1, 0, 0, 0);
    activity = { inflight: 0, last: clock.getTime() - 3_600_000 };
    const did: string[] = [];
    for (let i = 0; i < 80 && !did.includes("night done"); i++) did.push(String(await brain.tick()));
    expect(did).toContain("night stats");
    expect(did).toContain("night done");
    expect(did.filter((d) => d.startsWith("night consolidate"))).toHaveLength(24);
    const learning = await prisma.profileDoc.findUniqueOrThrow({ where: { userId_category: { userId, category: "learning" } } });
    expect((learning.content as { summary: string | null }).summary).toBe(summaryReply);
    const day = `${clock.getFullYear()}-${String(clock.getMonth() + 1).padStart(2, "0")}-${String(clock.getDate()).padStart(2, "0")}`;
    expect(fs.existsSync(path.join(dir, "snapshots", day, "learning.md"))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")).total).toBeGreaterThan(0);

    // A summary that adds things not in the facts is dropped.
    summaryReply = "You are a world champion chess player who loves pineapple.";
    const { consolidateCategory } = await import("../consolidate");
    const r = await consolidateCategory(new BrainStore(dir), userId, "learning", ["New stat line."], {}, { useModel: true });
    expect(r.content.summary).toBeNull();
  });

  it("nightly judge finalizes the day with 'missed' wording and journal feedback", async () => {
    const day = getStartOfDay(new Date(clock.getTime() - 86_400_000));
    await prisma.dailyEntry.upsert({ where: { userId_date: { userId, date: day } }, update: { notes: "Good day, trained hard." }, create: { userId, date: day, notes: "Good day, trained hard." } });
    gradeReply = { physical: { score: 3, why: [1], improve: "A" }, mental: { score: 7, why: [], improve: "" }, financial: { score: 8, why: [], improve: "" } };
    await judgeDay(userId, day);
    const row = await prisma.categoryScore.findUniqueOrThrow({ where: { userId_date: { userId, date: day } } });
    expect(row.finalized).toBe(true);
    expect(row.journalFeedback).toBe("Honest entry.");
    const r = readRationale(row.rationale);
    expect([...r.physical.why, ...r.mental.why].join(" ")).toMatch(/missed|Journal written/);
    expect(r.physical.why.join(" ")).not.toMatch(/not done yet/);
  });
});
