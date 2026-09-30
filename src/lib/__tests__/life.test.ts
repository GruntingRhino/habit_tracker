/**
 * Schedule, training coach, study plans, measurements, health checks.
 * Pure parts always run; the DB parts need DATABASE_URL pointing at a test database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { gaps, parseScheduleBlock, parseSleepTimes, place, toMin } from "../schedule";
import { increment, needsDeload, parseReps, parseTarget, suggest, type SetLog } from "../training";
import { detectAssessment, headsUpTime } from "../study";
import { parseMeasurements, parseBodyUpdate } from "../body";
import { foldChecks } from "../health";
import { weekFromRows } from "../weekly";
import { parseEventStatement, prepDue } from "../calendar";
import { parseRss, rankNews } from "../news";
import { partialRatio } from "../brain/scores";
import { classifyHabit, timeOfDayFor } from "../ai/habitarea";

const DB = process.env.DATABASE_URL ?? "";

describe("schedule: reading his week from chat", () => {
  it.each([
    ["i have school 7:40 to 2:20 on weekdays", { title: "School", days: ["mon", "tue", "wed", "thu", "fri"], start: "07:40", end: "14:20" }],
    ["practice tuesdays and thursdays 5-7pm", { title: "Practice", days: ["tue", "thu"], start: "17:00", end: "19:00" }],
    ["mma class every monday and wednesday from 6:30pm to 8pm", { title: "Mma class", days: ["mon", "wed"], start: "18:30", end: "20:00" }],
    ["work at the store saturdays 9am-1pm", { title: "Work store", days: ["sat"], start: "09:00", end: "13:00" }],
    ["tutoring weekends 10 to 12", { title: "Tutoring", days: ["sat", "sun"], start: "10:00", end: "12:00" }],
  ])("%s", (text, want) => expect(parseScheduleBlock(text)).toEqual(want));

  it.each(["remind me to call mom at 5-6", "i ate 2-3 eggs", "what's on today?", "meeting friday 3-4pm", "i ran 5 to 6 miles"])("ignores %s", (text) =>
    expect(parseScheduleBlock(text)).toBeNull()
  );

  it("sleep times", () => {
    expect(parseSleepTimes("i wake up at 6:30")).toEqual({ wake: "06:30" });
    expect(parseSleepTimes("bedtime 10:30")).toEqual({ bedtime: "22:30" });
    expect(parseSleepTimes("i go to bed at 11 on weekends")).toEqual({ weekendBedtime: "23:00" });
    expect(parseSleepTimes("i sleep at 12:30am")).toEqual({ bedtime: "00:30" });
  });

  it("free gaps and placement", () => {
    const busy: [number, number][] = [[toMin("07:40"), toMin("14:20")], [toMin("17:00"), toMin("19:00")]];
    expect(gaps(busy, toMin("07:00"), toMin("22:00"))).toEqual([[420, 460], [860, 1020], [1140, 1320]]);
    // 75-min workout after school, with a 10-min buffer after it ends.
    expect(place(busy, 75, toMin("15:00"), toMin("20:00"))).toEqual([900, 975]);
    expect(place(busy, 200, toMin("15:00"), toMin("20:00"))).toBeNull();
  });
});

describe("training coach (double progression)", () => {
  const log = (weight: number | null, reps: string, sets = 3, daysAgo = 3): SetLog => ({ date: new Date(Date.now() - daysAgo * 86_400_000), weight, sets, reps });

  it("parses targets and reps", () => {
    expect(parseTarget("3x6-10")).toMatchObject({ sets: 3, lo: 6, hi: 10, seconds: false });
    expect(parseTarget("3x8-12/side")).toMatchObject({ sets: 3, lo: 8, hi: 12, perSide: true });
    expect(parseTarget("3x20-40s")).toMatchObject({ lo: 20, hi: 40, seconds: true });
    expect(parseTarget("2-3x30-60s/side")).toMatchObject({ sets: 3, lo: 30, hi: 60, seconds: true });
    expect(parseReps("9,9,8", 3)).toEqual([9, 9, 8]);
    expect(parseReps("10", 3)).toEqual([10, 10, 10]);
  });

  it("adds a rep until every set hits the top, then adds load", () => {
    const hold = suggest("Incline dumbbell press", "3x6-10", [log(55, "9,9,8")]);
    expect(hold).toMatchObject({ status: "progress", last: "55 × 9,9,8", next: "55 × 10,10,9", nextWeight: 55 });
    const up = suggest("Incline dumbbell press", "3x6-10", [log(55, "10,10,10")]);
    expect(up).toMatchObject({ status: "increase", next: "60 × 6+", nextWeight: 60 });
    expect(suggest("Smith-machine squat", "3x6-10", [log(135, "10")]).nextWeight).toBe(145);
    expect(increment("Dumbbell Romanian deadlift")).toBe(5);
  });

  it("flags a stall after 3 sessions with no progress", () => {
    const s = suggest("Seated cable row", "3x8-12", [log(100, "10,9,9", 3, 2), log(100, "10,10,9", 3, 5), log(100, "10,10,9", 3, 9)]);
    expect(s.status).toBe("stalled");
    expect(s.why).toMatch(/sleep and calories/);
  });

  it("bodyweight and timed holds", () => {
    expect(suggest("Push-ups", "4x8-20", [log(null, "15,14,12,10", 4)]).next).toBe("16,15,13,11 reps");
    expect(suggest("Push-ups", "4x8-20", [log(null, "20", 4)]).status).toBe("harder");
    expect(suggest("Hollow-body hold", "3x20-40s", [log(null, "30,25,25")]).next).toBe("3 × 35 s");
    expect(suggest("Dips", "3x6-12", []).status).toBe("new");
    expect(suggest("Chin tucks", "2x10", []).next).toBe("2 × 10");
  });

  it("deload after two sessions of drops on 2+ lifts", () => {
    const s = (bench: number, row: number) => ({ logs: [{ ...log(bench, "8,8,8"), exerciseName: "Bench" }, { ...log(row, "10,10,10"), exerciseName: "Row" }] });
    expect(needsDeload([s(145, 90), s(155, 100), s(165, 110)] as never)).toBe(true);
    expect(needsDeload([s(165, 110), s(155, 100), s(145, 90)] as never)).toBe(false);
  });
});

describe("tests and assignments get a reminder, not a study plan", () => {
  const now = new Date(2026, 8, 28, 16); // Monday 4pm
  const friday = new Date(2026, 9, 2, 8);

  it("detects assessments and their subject", () => {
    expect(detectAssessment("Chem test", "i have a chem test on friday")).toEqual({ kind: "test", subject: "chem" });
    expect(detectAssessment("History essay due Thursday")).toMatchObject({ kind: "essay", subject: "history" });
    expect(detectAssessment("Math quiz")).toMatchObject({ kind: "quiz", subject: "math" });
    expect(detectAssessment("Bio final exam")).toMatchObject({ kind: "exam" });
    expect(detectAssessment("Finish GoodHours project")).toBeNull();
    expect(detectAssessment("Buy groceries")).toBeNull();
    expect(detectAssessment("Study for chem test (1/3)")).toBeNull();
  });

  it("reminds the evening before, never in the past", () => {
    expect(headsUpTime(friday, now)).toEqual(new Date(2026, 9, 1, 19));
    expect(headsUpTime(new Date(2026, 8, 28, 20), now)).toBeNull();
  });
});

describe("measurements", () => {
  it("reads tape measurements in inches", () => {
    expect(parseMeasurements("waist 29, chest 36.5 in, shoulders 45, arms 12.25")).toEqual({ waist: 29, chest: 36.5, shoulders: 45, arms: 12.25 });
    expect(parseMeasurements("my waist is 30")).toEqual({ waist: 30 });
    expect(parseMeasurements("i did 3 sets of chest today")).toBeNull();
    expect(parseMeasurements("did arms 12 sets and chest 3x10")).toBeNull();
    expect(parseMeasurements("chest 185 lbs bench")).toBeNull();
    // "shoulders 48 in" is a measurement, not a 4-foot height.
    expect(parseMeasurements("shoulders 48 in")).toEqual({ shoulders: 48 });
    expect(parseBodyUpdate("shoulders 48 in")?.heightIn).toBe(48);
  });
});

describe("health alerts", () => {
  it("alerts only after 2 checks in a row, once, and says when it's fixed", () => {
    let s = { problems: {} } as Parameters<typeof foldChecks>[0];
    let r = foldChecks(s, { model: "Model down" });
    expect(r.alerts).toEqual([]);
    s = r.state;
    r = foldChecks(s, { model: "Model down" });
    expect(r.alerts).toEqual(["Model down"]);
    s = r.state;
    r = foldChecks(s, { model: "Model down" });
    expect(r.alerts).toEqual([]);
    s = r.state;
    r = foldChecks(s, {});
    expect(r.fixed).toEqual(["model"]);
    // A blip that never alerted clears silently.
    r = foldChecks(foldChecks({ problems: {} }, { gate: "x" }).state, {});
    expect(r.fixed).toEqual([]);
  });
});

describe("weekly score", () => {
  const now = new Date(2026, 9, 1, 15); // Thursday
  const day = (d: number, scores: Partial<Record<"physical" | "mental" | "financial" | "spiritual", number | null>>) => {
    const areas = ["physical", "mental", "financial", "spiritual"] as const;
    return {
      date: new Date(2026, 8, d),
      judgedBy: "m",
      rationale: { v: 2, ...Object.fromEntries(areas.map((a) => [a, { why: [], improve: null, noData: scores[a] == null }])) },
      ...Object.fromEntries(areas.map((a) => [a, scores[a] ?? 0])),
    } as never;
  };

  it("averages the days with data; a day with nothing logged is a −0.5 penalty, not a 0", () => {
    // Mon 28: physical 6, mental 8 · Tue 29: nothing at all · Wed 30: physical 8 · Thu (today): mental 4 so far
    const w = weekFromRows([day(28, { physical: 6, mental: 8 }), day(30, { physical: 8 }), { ...(day(1, { mental: 4 }) as object), date: new Date(2026, 9, 1) } as never], now);
    expect(w.days.map((d) => d.missed)).toEqual([false, true, false, false]);
    expect(w.missedDays).toBe(1);
    expect(w.areas.physical).toMatchObject({ avg: 7, days: 2, score: 6.5 });
    expect(w.areas.mental).toMatchObject({ avg: 6, days: 2, score: 5.5 });
    // Financial never logged: no score at all (not 0).
    expect(w.areas.financial.score).toBeNull();
    expect(w.overall).toBe(6);
  });

  it("today with nothing yet isn't a penalty", () => {
    const w = weekFromRows([day(28, { physical: 7 })], new Date(2026, 8, 29, 9));
    expect(w.missedDays).toBe(0);
    expect(w.areas.physical.score).toBe(7);
  });
});

describe("habits", () => {
  it("partial progress from a note", () => {
    expect(partialRatio("Drink ~100 oz of water every day", "did 60 oz")).toBe(0.6);
    expect(partialRatio("Read 20 pages", "25")).toBe(1);
    expect(partialRatio("Posture routine", "did half")).toBeNull();
  });
  it("new habits get an area without asking", async () => {
    expect(await classifyHabit("Morning skincare + SPF")).toBe("physical");
    expect(await classifyHabit("Read the Bible")).toBe("spiritual");
    expect(await classifyHabit("No phone after 9pm")).toBe("mental");
    expect(await classifyHabit("Save $10")).toBe("financial");
    expect(timeOfDayFor("Evening skincare")).toBe("evening");
  });
});

describe("calendar events from what he says", () => {
  const now = new Date(2026, 8, 30, 23); // Wed night
  const p = (t: string) => {
    const r = parseEventStatement(t, now);
    return r && `${r.title} | ${r.start.getDate()} ${r.allDay ? "all day" : `${r.start.getHours()}:${String(r.start.getMinutes()).padStart(2, "0")}-${r.end.getHours()}:${String(r.end.getMinutes()).padStart(2, "0")}`} | ${r.attendees.join(",")}`;
  };
  it.each([
    ["i have a dentist appointment friday at 3pm", "Dentist appointment | 2 15:00-16:00 | "],
    ["I have a chem test on friday", "Chem test | 2 all day | "],
    ["add soccer game to my calendar saturday 10-12 and share it with Mike@gmail.com", "Soccer game | 3 10:00-12:00 | mike@gmail.com"],
    ["my basketball game is on tuesday at 6", "Basketball game | 6 18:00-19:00 | "],
    ["i have mma practice tonight 7-9pm", "Mma practice | 30 19:00-21:00 | "],
    ["make a calendar event for mom's birthday dinner on oct 12 at 7pm", "Mom's birthday dinner | 12 19:00-20:00 | "],
  ])("%s", (t, want) => expect(p(t)).toBe(want));
  it.each(["i have to finish my essay by friday", "remind me friday to call mom", "i have a lot of homework", "what do i have friday?"])("not an event: %s", (t) => expect(p(t)).toBeNull());
  it("prep is due the evening before, or an hour before if that's past", () => {
    expect(prepDue(new Date(2026, 9, 2, 15), now)).toEqual(new Date(2026, 9, 1, 19));
    expect(prepDue(new Date(2026, 9, 1, 10), new Date(2026, 9, 1, 8))).toEqual(new Date(2026, 9, 1, 9));
  });
});

describe("news ranking", () => {
  const now = new Date("2026-09-30T23:30:00Z");
  const rss = (items: [string, string, string][]) =>
    `<rss><channel>${items.map(([t, src, d]) => `<item><title><![CDATA[${t} - ${src}]]></title><link>https://x.test/${encodeURIComponent(t)}</link><pubDate>${d}</pubDate><source url="https://${src}">${src}</source></item>`).join("")}</channel></rss>`;
  it("parses Google News RSS and ranks widely-covered, recent stories first; the world keeps a quarter", () => {
    const fresh = "Wed, 30 Sep 2026 20:00:00 GMT";
    const old = "Fri, 25 Sep 2026 20:00:00 GMT";
    const world = parseRss(rss([["Big storm hits the east coast", "AP", fresh], ["Big storm hits east coast, millions without power", "Reuters", fresh], ["Local bake sale", "Patch", old]]), "Top stories");
    expect(world[0]).toMatchObject({ title: "Big storm hits the east coast", source: "AP" });
    const mma = parseRss(rss([["Topuria returns to training", "ESPN", fresh], ["Topuria returns to training camp", "MMA Fighting", fresh]]), "UFC MMA");
    const top = rankNews([...world, ...mma], now, 4);
    expect(top[0].coverage).toBe(2);
    expect(top.map((x) => x.topic)).toContain("Top stories");
    expect(top.find((x) => x.title.includes("bake sale"))?.score ?? 0).toBeLessThan(top[0].score);
  });
});

describe.skipIf(!/test/.test(DB))("schedule and coach against the database", () => {
  let prisma: typeof import("@/lib/prisma").default;
  let userId = "";
  const saved: Record<string, unknown> = {};
  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).default;
    for (const key of ["body", "schedule-prefs", "training"]) saved[key] = (await prisma.brainState.findUnique({ where: { key } }))?.value ?? null;
    const put = (key: string, value: object) => prisma.brainState.upsert({ where: { key }, update: { value }, create: { key, value } });
    await put("body", { sleepTargetHours: 9, goal: "bulk", weightLb: 134, heightIn: 72, age: 15, ageAsOf: "2026-09-01" });
    await put("schedule-prefs", { bedtime: "22:00" });
    await put("training", { upperBlock: "A", blockStartedAt: "2026-09-01", split: { mon: ["upper"], tue: ["Lower A"], wed: [], thu: ["upper"], fri: [], sat: [], sun: [] } });
    userId = (await prisma.user.create({ data: { email: `life-${Date.now()}@test.local` } })).id;
  });
  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    for (const [key, value] of Object.entries(saved)) {
      if (value) await prisma.brainState.update({ where: { key }, data: { value: value as object } });
      else await prisma.brainState.delete({ where: { key } }).catch(() => undefined);
    }
  });

  it("builds a Monday: morning routine, school, workout after school, study session, focus item, wind-down", async () => {
    const { buildSchedule } = await import("../schedule");
    const monday = new Date(2026, 8, 28);
    await prisma.scheduleBlock.create({ data: { userId, title: "School", days: ["mon", "tue", "wed", "thu", "fri"], start: "07:40", end: "14:20" } });
    await prisma.habit.create({ data: { userId, name: "Morning skincare + SPF", timeOfDay: "morning" } });
    await prisma.habit.create({ data: { userId, name: "Evening skincare", timeOfDay: "evening" } });
    const upper = await prisma.weightRoutine.create({ data: { userId, name: "Upper A – Upper chest, lats, delts", exercises: { create: [{ name: "Incline dumbbell press", descriptor: "3x6-10" }] } } });
    const at = (h: number, m = 0) => new Date(2026, 8, 28, h, m);
    await prisma.todo.create({ data: { userId, title: "Study for Chem test (1/3): active-recall sheet", dueAt: at(19), priority: "medium" } });
    await prisma.todo.create({ data: { userId, title: "Email counselor", dueAt: at(17), priority: "high" } });

    const s = await buildSchedule(userId, monday, at(6));
    const rows = s.blocks.map((b) => `${b.start}-${b.end} ${b.kind} ${b.title}`);
    expect(s.wake).toBe("07:00");
    expect(rows[0]).toBe("07:00-07:10 routine Morning routine");
    expect(rows).toContain("07:40-14:20 fixed School");
    const workout = s.blocks.find((b) => b.kind === "workout")!;
    expect(workout.title).toBe(upper.name);
    expect(toMin(workout.start)).toBeGreaterThanOrEqual(toMin("15:00"));
    expect(toMin(workout.end)).toBeLessThanOrEqual(toMin("20:00"));
    expect(workout.detail).toContain("Incline dumbbell press");
    const study = s.blocks.find((b) => b.kind === "study")!;
    expect(toMin(study.start)).toBeGreaterThanOrEqual(toMin("16:00"));
    const focus = s.blocks.find((b) => b.kind === "focus")!;
    expect(focus.title).toBe("Email counselor");
    expect(toMin(focus.start)).toBeGreaterThanOrEqual(toMin("14:20")); // after school, not at 6am
    expect(rows.slice(-2)).toEqual(["21:20-21:30 routine Evening routine", "21:30-22:00 wind-down Wind down — no screens"]);
    // Nothing overlaps.
    const spans = s.blocks.map((b) => [toMin(b.start), toMin(b.end)]).sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < spans.length; i++) expect(spans[i][0]).toBeGreaterThanOrEqual(spans[i - 1][1]);
  });

  it("habit notes count as partial, and a ticked Workout habit counts as training", async () => {
    const { buildFacts } = await import("../brain/scores");
    const { getStartOfDay } = await import("../utils");
    const day = getStartOfDay(new Date());
    const water = await prisma.habit.create({ data: { userId, name: "Drink ~100 oz of water", area: "physical" } });
    const workout = await prisma.habit.create({ data: { userId, name: "Workout", area: "physical" } });
    await prisma.habitLog.create({ data: { habitId: water.id, date: day, completed: false, notes: "did 60 oz" } });
    await prisma.habitLog.create({ data: { habitId: workout.id, date: day, completed: true, notes: "push day, felt strong" } });
    const f = await buildFacts(userId, day, { final: true });
    const t = f.facts.map((x) => x.text);
    expect(t).toContain("• Habit partly done: “Drink ~100 oz of water” — “did 60 oz” (60%)");
    expect(t).toContain("✓ Worked out (checked off “Workout”) — “push day, felt strong”");
    expect(t.some((x) => /No training/.test(x))).toBe(false);
    expect(t.some((x) => /Habit (done|missed): “Workout”/.test(x))).toBe(false); // counted once
  });

  it("logging an Upper B session switches the block and ticks Workout; a posture session ticks Posture routine", async () => {
    const { noteSession, readTraining } = await import("../training");
    const habit = await prisma.habit.create({ data: { userId, name: "Workout", targetDays: ["mon", "tue", "thu", "sat"] } });
    const posture = await prisma.habit.create({ data: { userId, name: "Posture routine" } });
    await noteSession(userId, "Upper B – Chest, back thickness, shoulders", new Date(2026, 8, 28, 17));
    expect((await readTraining()).upperBlock).toBe("B");
    expect(await prisma.habitLog.count({ where: { habitId: habit.id, completed: true } })).toBe(1);
    expect(await prisma.habitLog.count({ where: { habitId: posture.id } })).toBe(0);
    await noteSession(userId, "Daily posture", new Date(2026, 8, 28, 20));
    expect(await prisma.habitLog.count({ where: { habitId: posture.id, completed: true } })).toBe(1);
  });
});
