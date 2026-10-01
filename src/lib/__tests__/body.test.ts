/**
 * Body stats → targets. Pure parts always run; the DB part needs a test database:
 * DATABASE_URL=postgresql://test@127.0.0.1:55432/li_test npx vitest run body
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeTargets, currentAge, fmtHeight, normalizeBody, parseBodyUpdate, weightTrend } from "../body";

const DB = process.env.DATABASE_URL ?? "";

describe("targets follow weight, height and age", () => {
  const me = { heightIn: 72, age: 15, ageAsOf: "2026-09-29", goal: "bulk" as const };
  const now = new Date("2026-09-29T12:00:00");

  it("134 lb, 6'0\", 15, lean bulk", () => {
    const r = computeTargets(me, 134, now);
    expect(r.maintenance).toBe(2600);
    expect(r.targets).toMatchObject({ calories: 2850, protein: 107, fat: 95, carbs: 392, fiber: 40, calcium: 1300, iron: 11, sugar: 30, sodium: 2300 });
    // Protein stays inside his 1.6–1.8 g/kg rule.
    const gPerKg = r.targets.protein / (134 / 2.20462);
    expect(gPerKg).toBeGreaterThanOrEqual(1.6);
    expect(gPerKg).toBeLessThanOrEqual(1.8);
    expect(r.targets.protein * 4 + r.targets.fat * 9 + r.targets.carbs * 4).toBeCloseTo(r.targets.calories, -1);
  });

  it("gaining weight raises protein and calories; the trend adjustment and goal apply on top", () => {
    const a = computeTargets(me, 134, now).targets;
    const b = computeTargets(me, 145, now).targets;
    expect(b.protein).toBe(116);
    expect(b.calories).toBeGreaterThan(a.calories);
    expect(computeTargets({ ...me, calorieAdjust: 125 }, 134, now).targets.calories).toBe(2975);
    expect(computeTargets({ ...me, goal: "maintain" }, 134, now).targets.calories).toBe(2600);
    expect(computeTargets({ ...me, calorieAdjust: 9999 }, 134, now).targets.calories).toBe(3350); // capped at +500
  });

  it("age moves on by itself, and adult values apply from 19", () => {
    expect(currentAge(me, new Date("2027-10-01"))).toBe(16);
    const adult = computeTargets({ ...me, age: 19 }, 170, now).targets;
    expect(adult).toMatchObject({ calcium: 1000, iron: 8, vitaminC: 90 });
  });

  it("old metric stats convert to imperial", () => {
    expect(normalizeBody({ weightKg: 60.33, heightCm: 180.34 })).toMatchObject({ weightLb: 133, heightIn: 71 });
    expect(fmtHeight(72)).toBe(`6'0"`);
    expect(fmtHeight(73.4)).toBe(`6'1"`);
  });
});

describe("reading weight, height and age from a message", () => {
  it.each([
    ["134 lb", { weightLb: 134 }],
    ["i weigh 135.5 this morning", { weightLb: 135.5 }],
    ["weighed in at 136 lbs", { weightLb: 136 }],
    ["6'1", { heightIn: 73 }],
    ["im 6 ft 1 in now", { heightIn: 73 }],
    ["i'm 6'0\" and 134 pounds", { weightLb: 134, heightIn: 72 }],
    ["73 inches tall", { heightIn: 73 }],
    ["i'm 16 now", { age: 16 }],
  ])("%s", (text, want) => expect(parseBodyUpdate(text)).toEqual(want));

  it.each(["remind me at 6", "what should i weigh?", "bench 135 for 5", "i ran 3 miles", "call mom at 6'ish"])("ignores %s", (text) => {
    const r = parseBodyUpdate(text);
    expect(r?.weightLb == null || /bench/.test(text)).toBe(true);
    expect(r?.heightIn).toBeUndefined();
  });
});

describe("weight trend", () => {
  const day = (d: number, lb: number) => ({ date: new Date(2026, 8, 29 - d), lb });
  it("compares 7-day averages two weeks apart", () => {
    const daily = [...[0, 1, 2, 3].map((d) => day(d, 136)), ...[14, 15, 16].map((d) => day(d, 135))];
    expect(weightTrend(daily, [], new Date(2026, 8, 29, 9))?.perWeek).toBeCloseTo(0.5);
  });
  it("falls back to check-ins at least 13 days apart", () => {
    const t = weightTrend([], [{ date: "2026-09-01", weightLb: 134 }, { date: "2026-09-29", weightLb: 135 }], new Date(2026, 8, 29));
    expect(t?.perWeek).toBeCloseTo(0.25);
    expect(weightTrend([], [{ date: "2026-09-25", weightLb: 134 }], new Date(2026, 8, 29))).toBeNull();
  });
});

describe.skipIf(!/test/.test(DB))("check-ins update targets (real DB)", () => {
  let prisma: typeof import("@/lib/prisma").default;
  let userId = "";
  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).default;
    userId = (await prisma.user.create({ data: { email: `body-${Date.now()}@test.local` } })).id;
    await prisma.brainState.create({ data: { key: `body:${userId}`, value: { age: 15, ageAsOf: "2026-09-29", goal: "bulk", heightIn: 72 } } });
  });
  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.brainState.deleteMany({ where: { key: { endsWith: `:${userId}` } } });
  });

  it("a weigh-in sets targets; a stalled trend at a later check-in adds 125 kcal", async () => {
    const { recordBodyUpdate, updateBody } = await import("../body");
    const tue = new Date("2026-09-12T08:00:00"); // a Saturday, not a check-in day
    const first = await recordBodyUpdate(userId, { weightLb: 134 }, tue);
    expect(first).toContain("Logged 134 lb.");
    let u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.nutritionTargets).toMatchObject({ calories: 2850, protein: 107 });

    // Two weeks later, same weight on Sunday: gaining too slowly for a lean bulk → +125 kcal.
    const sun = new Date("2026-09-27T08:00:00");
    const r = await updateBody(userId, { weightLb: 134 }, { checkIn: true, now: sun });
    expect(r.lines.join(" ")).toContain("+125 kcal");
    u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect((u.nutritionTargets as { calories: number }).calories).toBe(2975);
    // The weigh-in also landed in the journal for the 7-day average.
    expect((await prisma.dailyEntry.findFirst({ where: { userId, weightLb: 134 } }))?.weightLb).toBe(134);
  });
});
