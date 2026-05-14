import { describe, it, expect } from "vitest";
import { calculateScores } from "@/lib/scoring";

const BASE_STATS = {
  habitCompletionRate: 1,
  projectStats: { completedThisWeek: 2, overdueCount: 0, totalActive: 3 },
  recentStreak: 30,
};

describe("calculateScores", () => {
  it("returns all scores in 0–10 range", () => {
    const scores = calculateScores({
      ...BASE_STATS,
      entry: {
        sleepHours: 8,
        workoutCompleted: true,
        workoutDurationMinutes: 60,
        workoutIntensity: "moderate",
        steps: 10000,
        deepWorkHours: 5,
        screenTimeHours: 2,
        tasksPlanned: 8,
        tasksCompleted: 8,
        moneySpent: 20,
        moneySaved: 100,
        incomeActivity: true,
        overallDayRating: 9,
        caloriesEaten: 2200,
      },
    });

    for (const [key, val] of Object.entries(scores)) {
      expect(val, key).toBeGreaterThanOrEqual(0);
      expect(val, key).toBeLessThanOrEqual(10);
    }
  });

  it("perfect day scores well above average on all categories", () => {
    const scores = calculateScores({
      ...BASE_STATS,
      entry: {
        sleepHours: 8,
        workoutCompleted: true,
        workoutDurationMinutes: 75,
        workoutIntensity: "hard",
        sportsTrainingMinutes: 30,
        steps: 12000,
        deepWorkHours: 6,
        screenTimeHours: 1,
        tasksPlanned: 8,
        tasksCompleted: 8,
        moneySpent: 10,
        moneySaved: 120,
        incomeActivity: true,
        overallDayRating: 10,
        caloriesEaten: 2200,
        rightWithGod: true,
      },
    });
    expect(scores.physical).toBeGreaterThanOrEqual(6);
    expect(scores.discipline).toBeGreaterThanOrEqual(8);
    expect(scores.focus).toBeGreaterThanOrEqual(8);
    expect(scores.overall).toBeGreaterThanOrEqual(6);
  });

  it("zero-data entry stays in range and physical is 0", () => {
    const scores = calculateScores({
      ...BASE_STATS,
      habitCompletionRate: 0,
      recentStreak: 0,
      entry: {},
    });
    expect(scores.physical).toBe(0);
    // focus gets 2pts from implicit zero screen time (≤2h bucket) — that's correct
    for (const val of Object.values(scores)) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(10);
    }
  });

  it("sleep under 6h gives 0 physical sleep points", () => {
    const withGoodSleep = calculateScores({
      ...BASE_STATS,
      entry: { sleepHours: 8, workoutCompleted: false },
    });
    const withBadSleep = calculateScores({
      ...BASE_STATS,
      entry: { sleepHours: 5, workoutCompleted: false },
    });
    expect(withGoodSleep.physical).toBeGreaterThan(withBadSleep.physical);
  });

  it("incomeActivity drives financial score", () => {
    const withIncome = calculateScores({
      ...BASE_STATS,
      entry: { incomeActivity: true, moneySpent: 50, moneySaved: 50 },
    });
    const withoutIncome = calculateScores({
      ...BASE_STATS,
      entry: { incomeActivity: false, moneySpent: 50, moneySaved: 50 },
    });
    expect(withIncome.financial).toBeGreaterThan(withoutIncome.financial);
  });

  it("overall is weighted average, not a category value", () => {
    const scores = calculateScores({
      ...BASE_STATS,
      entry: {
        sleepHours: 8,
        deepWorkHours: 4,
        screenTimeHours: 2,
        tasksPlanned: 5,
        tasksCompleted: 5,
        incomeActivity: true,
        moneySpent: 20,
        moneySaved: 80,
        overallDayRating: 8,
      },
    });
    const manual =
      scores.physical   * 0.20 +
      scores.financial  * 0.15 +
      scores.discipline * 0.20 +
      scores.focus      * 0.20 +
      scores.mental     * 0.15 +
      scores.appearance * 0.10;
    expect(scores.overall).toBeCloseTo(manual, 0);
  });
});
