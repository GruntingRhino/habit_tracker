/**
 * Schedule, training coach, study plans, measurements, health checks.
 * Pure parts always run; the DB parts need DATABASE_URL pointing at a test database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { gaps, parseScheduleBlock, parseSleepTimes, place, toMin } from "../schedule";
import { increment, needsDeload, parseReps, parseTarget, suggest, type SetLog } from "../training";
import { detectAssessment, studyPlan } from "../study";
import { parseMeasurements, parseBodyUpdate } from "../body";
import { foldChecks } from "../health";

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
  });

  it("deload after two sessions of drops on 2+ lifts", () => {
    const s = (bench: number, row: number) => ({ logs: [{ ...log(bench, "8,8,8"), exerciseName: "Bench" }, { ...log(row, "10,10,10"), exerciseName: "Row" }] });
    expect(needsDeload([s(145, 90), s(155, 100), s(165, 110)] as never)).toBe(true);
    expect(needsDeload([s(165, 110), s(155, 100), s(145, 90)] as never)).toBe(false);
  });
});

describe("tests and assignments become study plans", () => {
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

  it("spaces study sessions before the test (7pm), last one high priority", () => {
    const plan = studyPlan({ kind: "test", subject: "chem" }, friday, now);
    expect(plan.map((p) => p.title)).toEqual([
      "Study for Chem test (1/3): active-recall sheet + practice problems",
      "Study for Chem test (2/3): self-quiz and fix weak spots",
      "Study for Chem test (3/3): quick review of mistakes (sleep early)",
    ]);
    expect(plan.map((p) => p.dueAt.getDate())).toEqual([28, 29, 1]); // tonight, tomorrow, and the night before
    expect(plan.every((p) => p.dueAt.getHours() === 19)).toBe(true);
    expect(plan[2].priority).toBe("high");
  });

  it("compresses when time is short, keeping the final review", () => {
    const tomorrow = new Date(2026, 8, 29, 8);
    expect(studyPlan({ kind: "test", subject: "chem" }, tomorrow, now).map((p) => p.title)).toEqual(["Study for Chem test: quick review of mistakes (sleep early)"]);
    expect(studyPlan({ kind: "test", subject: null }, new Date(2026, 8, 28, 20), now)).toEqual([]);
  });

  it("essays get outline → draft → edit", () => {
    expect(studyPlan({ kind: "essay", subject: "english" }, friday, now).map((p) => p.title.split(": ")[1])).toEqual(["outline + thesis", "full rough draft", "edit, cite, final read"]);
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

  it("logging an Upper B session switches the block and ticks the upper-workout habit", async () => {
    const { noteSession, readTraining } = await import("../training");
    const habit = await prisma.habit.create({ data: { userId, name: "Upper workout (current block)", targetDays: ["mon", "thu"] } });
    await noteSession(userId, "Upper B – Chest, back thickness, shoulders", new Date(2026, 8, 28, 17));
    expect((await readTraining()).upperBlock).toBe("B");
    expect(await prisma.habitLog.count({ where: { habitId: habit.id, completed: true } })).toBe(1);
  });
});
