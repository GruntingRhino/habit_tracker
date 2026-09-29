/** Brain pieces that need no database: storage, pruning, claim checking, grading, stats. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BrainStore, dayKey, type Evidence, type Observation } from "../storage";
import { effectiveConfidence, enforceCaps, staleDataPass } from "../prune";
import { grounding, mergeClaim, nextChunk, validateClaims, worthExtracting } from "../extract";
import { buildContent, MAX_PROFILE_BYTES, renderMarkdown } from "../consolidate";
import { QUIZ, quizClaim } from "../quiz";
import { baseline, renderGrade, type Fact, type Option } from "../scores";
import { focusWindow, median } from "../stats";
import { isQuietHour, streakBefore } from "../jobs";
import { ev } from "../ingest";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "brain-"));
const DAY = 86_400_000;

function evidence(t: Date, text: string, src: Evidence["src"] = "said"): Evidence {
  return ev(`${t.toISOString()}:${text}`, t, "said", text, src);
}

describe("storage", () => {
  it("appends evidence per day, dedupes by id, reads back through gzip", () => {
    const s = new BrainStore(tmp());
    const t = new Date(2026, 5, 1, 10);
    const e = evidence(t, 'He said: "I study best at night"');
    expect(s.appendEvidence([e, e])).toHaveLength(1);
    expect(s.appendEvidence([e])).toHaveLength(0);
    expect(s.readEvidence("2026-06-01")).toEqual([e]);
    s.gzipDay("2026-06-01");
    expect(fs.existsSync(s.p("evidence/2026/06/01.jsonl.gz"))).toBe(true);
    expect(s.readEvidence("2026-06-01")).toEqual([e]);
    // Appending to a compressed day unpacks it first, and still dedupes.
    const e2 = evidence(new Date(2026, 5, 1, 11), 'He said: "phone distracts me"');
    expect(s.appendEvidence([e, e2])).toHaveLength(1);
    expect(s.readEvidence("2026-06-01")).toHaveLength(2);
    expect(s.evidenceDays()).toEqual(["2026-06-01"]);
  });

  it("manifest counts every byte on disk by area", () => {
    const s = new BrainStore(tmp());
    s.appendEvidence([1, 2, 3].map((i) => evidence(new Date(), `${i}${"x".repeat(400)}`)));
    s.writeProfile("goals", "# Goals\n");
    const m = s.manifest();
    expect(m.areas.evidence).toBeGreaterThan(1000);
    expect(m.areas.profile).toBe(8);
    expect(m.total).toBe(Object.values(m.areas).reduce((a, b) => a + b, 0));
  });
});

describe("pruning", () => {
  const now = new Date(2026, 8, 29, 3);
  const fill = (s: BrainStore, daysAgo: number, bytes: number) => {
    const t = new Date(now.getTime() - daysAgo * DAY);
    // Evidence lines are capped at 500 chars, so a day's size comes from many lines.
    s.appendEvidence(Array.from({ length: Math.ceil(bytes / 560) }, (_, i) => evidence(t, `${daysAgo}-${i} ${"y".repeat(450)}`)));
    return dayKey(t);
  };

  it("does nothing destructive under the soft cap, but compresses evidence older than 30 days", () => {
    const s = new BrainStore(tmp(), { soft: 10 * 1024 ** 2, hard: 12 * 1024 ** 2 });
    const old = fill(s, 40, 5000);
    const recent = fill(s, 2, 5000);
    const r = enforceCaps(s, { now, learnedThrough: dayKey(now) });
    expect(r.actions).toEqual([`gzip ${old}`]);
    expect(s.readEvidence(old).length).toBeGreaterThan(0);
    expect(s.readEvidence(recent).length).toBeGreaterThan(0);
  });

  it("over the soft cap: prunes oldest learned evidence first and never crosses the hard cap", () => {
    const s = new BrainStore(tmp(), { soft: 60_000, hard: 80_000 });
    const days = [200, 190, 100, 50, 20, 10, 5, 1].map((d) => fill(s, d, 12_000));
    for (let i = 0; i < 3; i++) {
      s.snapshot(dayKey(new Date(now.getTime() - (40 + i) * DAY)));
    }
    const learnedThrough = days[5]; // 10 days ago; the last 5 and 1-day-old are not learned yet
    const r = enforceCaps(s, { now, learnedThrough });
    expect(r.after).toBeLessThanOrEqual(80_000);
    expect(r.after).toBeLessThanOrEqual(60_000);
    // The 180+-day-old days went first, and unlearned evidence was kept.
    expect(r.actions.findIndex((a) => a.includes(days[0]))).toBeLessThan(r.actions.findIndex((a) => a.includes(days[2])) === -1 ? Infinity : r.actions.findIndex((a) => a.includes(days[2])));
    expect(s.readEvidence(days[6]).length).toBeGreaterThan(0);
    expect(s.readEvidence(days[7]).length).toBeGreaterThan(0);
    expect(s.manifest().lastPrune).toBe(now.toISOString());
  });

  it("hard cap: drops even unlearned evidence (oldest first) rather than exceed it", () => {
    const s = new BrainStore(tmp(), { soft: 20_000, hard: 30_000 });
    const days = [9, 8, 7, 6, 5].map((d) => fill(s, d, 12_000));
    const r = enforceCaps(s, { now, learnedThrough: null });
    expect(r.after).toBeLessThanOrEqual(30_000);
    expect(r.overHard).toBe(false);
    expect(s.readEvidence(days[4]).length).toBeGreaterThan(0);
    expect(s.readEvidence(days[0])).toHaveLength(0);
  });

  it("stale data: decays after 60 days, deletes weak beliefs unseen for 120, drops old tombstones", () => {
    const s = new BrainStore(tmp());
    const obs = (id: string, lastSeenDaysAgo: number, confidence: number, status: Observation["status"] = "active"): Observation => ({
      id,
      category: "focus",
      claim: `He focuses ${id}.`,
      source: "said",
      evidence: [],
      snippets: [],
      firstSeen: new Date(now.getTime() - lastSeenDaysAgo * DAY).toISOString(),
      lastSeen: new Date(now.getTime() - lastSeenDaysAgo * DAY).toISOString(),
      count: 1,
      confidence,
      status,
    });
    s.writeObservations("focus", [obs("fresh", 5, 0.5), obs("old-strong", 130, 0.95), obs("old-weak", 130, 0.35), obs("tomb", 100, 0.5, "rejected")]);
    expect(effectiveConfidence(obs("x", 30, 0.5), now)).toBe(0.5);
    expect(effectiveConfidence(obs("x", 90, 0.5), now)).toBeCloseTo(0.45, 2);
    const r = staleDataPass(s, now);
    expect(r.deleted).toBe(1);
    expect(r.archivedDropped).toBe(1);
    expect(s.readObservations("focus").map((o) => o.id)).toEqual(["fresh", "old-strong"]);
  });
});

describe("claims must be grounded in what he said", () => {
  const lines = [
    evidence(new Date(), 'He said (evening): "honestly i keep scrolling instagram when i should be doing homework"'),
    evidence(new Date(), 'He said (morning): "I had a pineapple for breakfast"'),
    evidence(new Date(), 'He said (night): "I learn way better from youtube videos than from reading the textbook"'),
  ];

  it("keeps grounded claims", () => {
    const ok = validateClaims(
      [
        { n: 1, category: "distractions", claim: "He gets distracted by social media when studying" },
        { n: 3, category: "learning", claim: "He learns better from YouTube videos than reading" },
      ],
      lines
    );
    expect(ok.map((c) => c.category)).toEqual(["distractions", "learning"]);
    expect(ok[0].evidence).toBe(lines[0]);
  });

  it("rejects invented details, wrong line numbers, unknown categories and non-claims", () => {
    const bad = validateClaims(
      [
        { n: 2, category: "food", claim: "He stuffs pineapples with hot sauce for extra points" },
        { n: 7, category: "food", claim: "He eats pineapple for breakfast" },
        { n: 2, category: "cooking", claim: "He eats pineapple for breakfast" },
        { n: 1, category: "focus", claim: "Studying" },
        { n: 1, category: "focus", claim: "You scroll instagram during homework" },
        { n: 1, category: "focus", claim: "He had a rough homework day scrolling instagram" },
      ],
      lines
    );
    expect(bad).toEqual([]);
    expect(grounding("He stuffs pineapples with hot sauce", lines[1].text).score).toBeLessThan(0.5);
  });

  it("rejects claims that flip a negation or read a distraction into a neutral line", () => {
    const run = evidence(new Date(), 'He said: "i hate running but i love sparring"');
    const music = evidence(new Date(), 'He said: "i work best with music on, lofi or drill"');
    const mornings = evidence(new Date(), `He said: "mornings are rough for me, i don't really wake up until like 11"`);
    const kept = validateClaims(
      [
        { n: 1, category: "interests", claim: "He likes running and sparring" },
        { n: 1, category: "training", claim: "He hates running but loves sparring" },
        { n: 2, category: "distractions", claim: "He gets distracted by music on while working" },
        { n: 2, category: "focus", claim: "He works best with music on" },
        { n: 3, category: "energy", claim: "He has rough mornings and doesn't wake until around 11" },
      ],
      [run, music, mornings]
    );
    expect(kept.map((k) => k.claim)).toEqual(["He hates running but loves sparring.", "He works best with music on.", "He has rough mornings and doesn't wake until around 11."]);
  });

  it("rejects claims about other people and claims filed in the wrong category", () => {
    const bro = evidence(new Date(), 'He said: "my brother is always on his phone lol"');
    const bag = evidence(new Date(), 'He said: "when i\'m stressed i just go hit the bag for a bit"');
    const kept = validateClaims(
      [
        { n: 1, category: "distractions", claim: "He is distracted by his brother's phone" },
        { n: 2, category: "faith", claim: "He hits the bag when stressed" },
        { n: 2, category: "stress", claim: "He hits the bag when stressed" },
      ],
      [bro, bag]
    );
    expect(kept.map((k) => `${k.category}: ${k.claim}`)).toEqual(["stress: He hits the bag when stressed."]);
  });

  it("merges: duplicates reinforce, reversals archive the old claim, rejected claims stay out", () => {
    const list: Observation[] = [];
    const at = (h: number, text: string) => evidence(new Date(2026, 8, 1, h), text);
    expect(mergeClaim(list, { category: "distractions", claim: "He gets distracted by his phone.", source: "said", evidence: at(9, "phone distracts me") })).toBe("added");
    expect(mergeClaim(list, { category: "distractions", claim: "He gets distracted by his phone a lot.", source: "said", evidence: at(10, "my phone distracts me again") })).toBe("reinforced");
    expect(list).toHaveLength(1);
    expect(list[0].count).toBe(2);
    expect(list[0].confidence).toBeCloseTo(0.6);

    expect(mergeClaim(list, { category: "distractions", claim: "He does not get distracted by his phone anymore.", source: "said", evidence: at(11, "phone doesn't distract me anymore") })).toBe("replaced");
    expect(list.map((o) => o.status)).toEqual(["archived", "active"]);

    list[1].status = "rejected";
    list[1].lastSeen = new Date(2026, 8, 1, 12).toISOString();
    expect(mergeClaim(list, { category: "distractions", claim: "He does not get distracted by his phone.", source: "said", evidence: at(11, "old line") })).toBe("blocked");
    // Newer evidence than his correction can bring it back.
    expect(mergeClaim(list, { category: "distractions", claim: "He does not get distracted by his phone.", source: "said", evidence: at(13, "new line") })).not.toBe("blocked");
  });

  it("only sends his own words of 4+ words to the model, in small chunks", () => {
    expect(worthExtracting(evidence(new Date(), 'He said: "ok"'))).toBe(false);
    expect(worthExtracting(evidence(new Date(), 'He said: "I study best late at night"'))).toBe(true);
    expect(worthExtracting(evidence(new Date(), "Finished to-do task", "data"))).toBe(false);
    expect(worthExtracting(evidence(new Date(), 'He said: "remind me to call grandma at 6"'))).toBe(false);
    expect(worthExtracting(evidence(new Date(), 'He said: "is it bad that i skip breakfast a lot?"'))).toBe(false);
    // "(evening)" in the label can't ground "tired in the evening".
    const m = evidence(new Date(), `He said (evening): "mornings are rough for me, i don't really wake up until like 11"`);
    expect(validateClaims([{ n: 1, category: "energy", claim: "He has rough mornings and gets tired in the evening" }], [m])).toEqual([]);
    const q = Array.from({ length: 20 }, (_, i) => evidence(new Date(), `He said: "${"word ".repeat(60)}${i}"`));
    const c = nextChunk(q);
    expect(c.length).toBeGreaterThan(1);
    expect(c.reduce((s, e) => s + e.text.length, 0)).toBeLessThanOrEqual(1500);
  });
});

describe("profile files", () => {
  it("ranks beliefs by confidence and stays under the size limit", () => {
    const now = new Date();
    const obs: Observation[] = Array.from({ length: 60 }, (_, i) => ({
      id: `o${i}`,
      category: "goals",
      claim: `He wants to reach goal number ${i} ${"and more detail ".repeat(20)}`,
      source: "said",
      evidence: [],
      snippets: [{ t: now.toISOString(), text: "x".repeat(200) }],
      firstSeen: now.toISOString(),
      lastSeen: now.toISOString(),
      count: i % 5,
      confidence: 0.3 + (i % 7) / 10,
      status: i === 3 ? "rejected" : "active",
    }));
    const c = buildContent(obs, ["To-dos usually get done 2 days after you add them."], now);
    expect(renderMarkdown("goals", c).length).toBeLessThanOrEqual(MAX_PROFILE_BYTES);
    expect(c.beliefs.some((b) => b.id === "o3")).toBe(false);
    const confs = c.beliefs.map((b) => ["low", "medium", "high"].indexOf(b.level));
    expect([...confs].sort((a, b) => b - a)).toEqual(confs);
  });

  it("turns quiz answers into readable beliefs", () => {
    const q = QUIZ.find((x) => x.id === "learn-how")!;
    expect(quizClaim(q, ["Watching videos", "Doing it hands-on"])).toBe("He learns best by: watching videos, doing it hands-on.");
    expect(quizClaim(QUIZ.find((x) => x.id === "interests")!, ["MMA / combat sports", "Tech / coding / AI"])).toBe("He is into: MMA / combat sports, tech / coding / AI.");
    expect(quizClaim(q, [])).toBeNull();
    expect(new Set(QUIZ.map((x) => x.id)).size).toBe(QUIZ.length);
  });
});

describe("live grading can't invent anything", () => {
  const facts: Fact[] = [
    { n: 1, area: "physical", text: "✓ Workout logged: “Push day”", polarity: 1 },
    { n: 2, area: "physical", text: "✗ Habit not done yet: “Stretch”", polarity: -1 },
    { n: 3, area: "physical", text: "• Slept 6.5 h (under 7)", polarity: 0 },
    { n: 4, area: "mental", text: "✓ Done: “Math homework”", polarity: 1 },
  ];
  const options: Option[] = [
    { code: "A", area: "physical", text: "Do your habit “Stretch”" },
    { code: "B", area: "mental", text: "Write a few lines in your Journal" },
  ];

  it("baseline: 5 with no signal, up for good facts, down for bad ones, null with no data", () => {
    expect(baseline([])).toBeNull();
    expect(baseline([facts[2]])).toBe(5);
    expect(baseline([facts[0], facts[3]])).toBe(8);
    expect(baseline([facts[1]])).toBe(3);
  });

  it("uses only cited facts from the same area, clamps the score, validates the option", () => {
    const g = renderGrade("physical", facts, options, { score: 10, why: [1, 4, 99, 1], improve: "a" });
    expect(g.score).toBe(7); // baseline 5, clamped to +2
    expect(g.rationale.why).toEqual(["✓ Workout logged: “Push day”"]);
    expect(g.rationale.improve).toBe("Do your habit “Stretch”");
    // An option from another area, or a made-up one, falls back to this area's first option.
    expect(renderGrade("physical", facts, options, { score: 5, why: [], improve: "B" }).rationale.improve).toBe("Do your habit “Stretch”");
  });

  it("with no model output it still explains from real facts", () => {
    const g = renderGrade("physical", facts, options, null);
    expect(g.score).toBe(5);
    expect(g.rationale.why).toEqual(["✗ Habit not done yet: “Stretch”", "✓ Workout logged: “Push day”"]);
    for (const w of g.rationale.why) expect(facts.map((f) => f.text)).toContain(w);
  });

  it("an area with no facts has no score, and says so", () => {
    const g = renderGrade("spiritual", facts, options, { score: 9, why: [1], improve: "A" });
    expect(g.score).toBeNull();
    expect(g.rationale.noData).toBe(true);
    expect(g.rationale.why).toEqual([]);
  });
});

describe("stats and jobs helpers", () => {
  it("median", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("focus window needs enough data and finds the busiest 90 minutes", () => {
    const at = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m);
    expect(focusWindow([at(1, 19), at(2, 19)])).toBeNull();
    const times = [at(1, 19, 10), at(2, 19, 40), at(3, 20, 5), at(4, 19, 20), at(5, 20, 15), at(6, 9), at(7, 13), at(8, 19, 35)];
    const w = focusWindow(times)!;
    expect(w.label).toBe("7pm–8:30pm");
    expect(w.share).toBeCloseTo(6 / 8);
  });

  it("streak counts only scheduled days before today", () => {
    const today = new Date(2026, 8, 30); // Wednesday
    const logs = [1, 2, 3, 4].map((i) => ({ date: new Date(today.getTime() - i * DAY), completed: true }));
    expect(streakBefore(logs, ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], today)).toBe(4);
    expect(streakBefore(logs.slice(1), ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], today)).toBe(0);
  });

  it("quiet hours are 10pm to 7am", () => {
    expect(isQuietHour(new Date(2026, 8, 1, 22))).toBe(true);
    expect(isQuietHour(new Date(2026, 8, 1, 6, 59))).toBe(true);
    expect(isQuietHour(new Date(2026, 8, 1, 7))).toBe(false);
    expect(isQuietHour(new Date(2026, 8, 1, 21, 59))).toBe(false);
  });
});
