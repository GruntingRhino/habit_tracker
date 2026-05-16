import { describe, expect, it } from "vitest";
import { calculateScores } from "@/lib/scoring";

const BASE = {
  habitCompletionRate: 0.8,
  projectStats: { completedThisWeek: 2, overdueCount: 0, totalActive: 3 },
  recentStreak: 10,
  scoringSettings: { strictness: "balanced" as const, ageYears: 17 },
  categoryHabitRates: {
    discipline: 0.8,
    focus: 0.7,
    mental: 0.9,
    financial: 0.6,
  },
};

describe("calculateScores", () => {
  it("returns all scores in 0-10 range", () => {
    const scores = calculateScores({
      ...BASE,
      entry: {
        sleepHours: 8,
        workoutCompleted: true,
        workoutDurationMinutes: 60,
        workoutIntensity: "moderate",
        steps: 10000,
        deepWorkHours: 5,
        screenTimeHours: 2,
        tasksPlanned: 8,
        tasksCompleted: 7,
        incomeActivity: true,
        moneySaved: 20,
        overallDayRating: 8,
        caloriesEaten: 2500,
      },
    });

    for (const value of Object.values(scores)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(10);
    }
  });

  it("does not use appearance in the overall weighting anymore", () => {
    const scores = calculateScores({
      ...BASE,
      entry: {
        sleepHours: 8,
        workoutCompleted: true,
        workoutDurationMinutes: 75,
        workoutIntensity: "hard",
        steps: 12000,
        deepWorkHours: 5,
        screenTimeHours: 1,
        tasksPlanned: 7,
        tasksCompleted: 7,
        incomeActivity: true,
        overallDayRating: 9,
        caloriesEaten: 2800,
      },
    });

    const manual =
      scores.physical * 0.25 +
      scores.financial * 0.15 +
      scores.discipline * 0.2 +
      scores.focus * 0.2 +
      scores.mental * 0.2;

    expect(scores.appearance).toBe(0);
    expect(scores.overall).toBeCloseTo(manual, 0);
  });

  it("penalizes discipline and focus when active projects are overdue", () => {
    const withoutOverdue = calculateScores({
      ...BASE,
      projectStats: { completedThisWeek: 2, overdueCount: 0, totalActive: 3 },
      entry: {
        deepWorkHours: 4,
        screenTimeHours: 2,
        tasksPlanned: 6,
        tasksCompleted: 5,
      },
    });

    const withOverdue = calculateScores({
      ...BASE,
      projectStats: { completedThisWeek: 2, overdueCount: 3, totalActive: 3 },
      entry: {
        deepWorkHours: 4,
        screenTimeHours: 2,
        tasksPlanned: 6,
        tasksCompleted: 5,
      },
    });

    expect(withOverdue.discipline).toBeLessThan(withoutOverdue.discipline);
    expect(withOverdue.focus).toBeLessThan(withoutOverdue.focus);
  });

  it("uses age-aware financial scoring", () => {
    const studentScores = calculateScores({
      ...BASE,
      scoringSettings: { strictness: "balanced", ageYears: 17 },
      entry: {
        incomeActivity: false,
        deepWorkHours: 5,
        tasksPlanned: 6,
        tasksCompleted: 6,
      },
    });

    const adultScores = calculateScores({
      ...BASE,
      scoringSettings: { strictness: "balanced", ageYears: 30 },
      entry: {
        incomeActivity: false,
        deepWorkHours: 5,
        tasksPlanned: 6,
        tasksCompleted: 6,
      },
    });

    expect(studentScores.financial).toBeGreaterThan(adultScores.financial);
  });

  it("strict mode grades harder than lenient mode", () => {
    const lenient = calculateScores({
      ...BASE,
      scoringSettings: { strictness: "lenient", ageYears: 20 },
      entry: {
        sleepHours: 7.5,
        workoutCompleted: true,
        workoutDurationMinutes: 50,
        workoutIntensity: "moderate",
        steps: 9000,
        deepWorkHours: 4,
        screenTimeHours: 3,
        tasksPlanned: 6,
        tasksCompleted: 5,
        incomeActivity: true,
        overallDayRating: 7,
      },
    });

    const strict = calculateScores({
      ...BASE,
      scoringSettings: { strictness: "strict", ageYears: 20 },
      entry: {
        sleepHours: 7.5,
        workoutCompleted: true,
        workoutDurationMinutes: 50,
        workoutIntensity: "moderate",
        steps: 9000,
        deepWorkHours: 4,
        screenTimeHours: 3,
        tasksPlanned: 6,
        tasksCompleted: 5,
        incomeActivity: true,
        overallDayRating: 7,
      },
    });

    expect(strict.overall).toBeLessThan(lenient.overall);
  });
});
