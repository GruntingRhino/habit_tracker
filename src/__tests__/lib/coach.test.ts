import { describe, expect, it } from "vitest";
import { __testables } from "@/lib/coach";

const baseSnapshot = {
  profileSummary: "Test user focused on physical improvement.",
  goals: [
    {
      id: "goal-1",
      title: "Boost Physical Habit Consistency",
      description: "Improve weak physical habits this week.",
      category: "physical",
      timeframe: "7 days",
      priority: "high",
      status: "active",
    },
  ],
  dataAvailability: {
    dailyEntryCount30d: 6,
    habitLogCount30d: 24,
    workoutSessionCount30d: 4,
    hasPerformanceData: true,
  },
  today: {
    date: "2026-05-13",
    sleepHours: 8,
    workoutCompleted: false,
    deepWorkHours: 3,
    steps: 4000,
  },
  scores: {
    latest: {
      physical: 4,
      financial: 6,
      discipline: 5,
      focus: 6,
      mental: 7,
      appearance: 6,
      overall: 5.7,
    },
    average30d: {
      physical: 4,
      financial: 6,
      discipline: 5,
      focus: 6,
      mental: 7,
      appearance: 6,
      overall: 5.7,
    },
    trend7d: {
      physical: -1,
      financial: 0,
      discipline: 0,
      focus: 0,
      mental: 1,
      appearance: 0,
      overall: 0,
    },
  },
  habits: [
    {
      name: "Calories Eaten 3500kcal",
      category: "physical",
      description: null,
      targetDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      streak: 2,
      completionRate30d: 0.2,
      last14: "00000000000011",
    },
    {
      name: "Protein Intake 150g",
      category: "physical",
      description: null,
      targetDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      streak: 2,
      completionRate30d: 0.2,
      last14: "00000000000011",
    },
    {
      name: "Workout / Training Session",
      category: "physical",
      description: null,
      targetDays: ["mon", "wed", "fri", "sat"],
      streak: 1,
      completionRate30d: 0.1,
      last14: "00000000000001",
    },
  ],
  weakestHabits: [
    {
      name: "Steps / Movement 10,000",
      category: "physical",
      completionRate30d: 0,
      streak: 0,
    },
    {
      name: "Stretch / Mobility 10min",
      category: "physical",
      completionRate30d: 0,
      streak: 0,
    },
  ],
  strongestHabits: [
    {
      name: "Sleep 9hrs",
      category: "mental",
      completionRate30d: 1,
      streak: 9,
    },
  ],
  projects: [
    {
      title: "GoodHours MVP",
      description: null,
      priority: "high",
      status: "active",
      deadline: "2026-05-20",
      completionPercentage: 35,
      openTasks: ["Build dashboard", "Fix login"],
    },
  ],
  meals: {
    total: 2,
    categories: { breakfast: 1, dinner: 1 },
    examples: ["Eggs", "Rice bowl"],
  },
  routines: [
    {
      name: "Push Day",
      description: null,
      exercises: ["Bench Press", "Overhead Press"],
      recentSessions: ["2026-05-10"],
    },
    {
      name: "Pull Day",
      description: null,
      exercises: ["Barbell Row", "Pull Ups"],
      recentSessions: ["2026-05-11"],
    },
  ],
  workoutSessions: [
    {
      date: "2026-05-10",
      routine: "Push Day",
      exerciseCount: 5,
      highlights: ["Bench Press"],
    },
  ],
  recentEntries: [
    {
      date: "2026-05-13",
      sleepHours: 8,
      deepWorkHours: 3,
      screenTimeHours: 4,
      tasksCompleted: 4,
      tasksPlanned: 6,
      steps: 4000,
      moneySaved: 20,
      moneySpent: 35,
      caloriesEaten: 3100,
      overallDayRating: 4,
      workoutSummary: {
        countsAsWorkout: false,
        routine: null,
        durationMinutes: null,
        intensity: null,
      },
    },
  ],
  existingHabitNames: [
    "Calories Eaten 3500kcal",
    "Protein Intake 150g",
    "Workout / Training Session",
  ],
  existingProjectTitles: ["GoodHours MVP"],
};

describe("coach fallback behavior", () => {
  it("answers weakest-area prompts from user data", () => {
    const response = __testables.buildFallbackCoachResponse(
      baseSnapshot as never,
      "What is my weakest area right now, based on my actual data?",
      "Answer the user"
    );

    expect(response.message).toContain("physical");
    expect(response.message).toContain("Steps / Movement 10,000");
    expect(response.actions[0]?.type).toBe("add_project");
  });

  it("answers muscle-gain calorie prompts without generic fallback habits", () => {
    const response = __testables.buildFallbackCoachResponse(
      baseSnapshot as never,
      "I want to gain muscle fast by July 15. Give me the exact calorie target and habits I should add.",
      "Answer the user"
    );

    expect(response.message).toContain("3500kcal");
    expect(response.message).toContain("Push Day");
    expect(response.actions.some((action) => action.type === "add_habit")).toBe(true);
    expect(response.actions.some((action) => action.type === "add_project")).toBe(false);
    expect(response.goals).toHaveLength(0);
  });

  it("returns a project recommendation when asked for one", () => {
    const response = __testables.buildFallbackCoachResponse(
      baseSnapshot as never,
      "Suggest one project I should start this week that best matches my current priorities and explain why.",
      "Answer the user"
    );
    const firstAction = response.actions[0];

    expect(response.message).toContain("project");
    expect(response.actions).toHaveLength(1);
    expect(firstAction?.type).toBe("add_project");
    expect(firstAction && firstAction.type === "add_project" ? firstAction.project.title : null).toBe(
      "Weekly Physical Activation"
    );
  });

  it("does not treat overall as a weakest area when ranking saved category averages", () => {
    const response = __testables.buildFallbackCoachResponse(
      {
        ...baseSnapshot,
        goals: [],
        scores: {
          ...baseSnapshot.scores,
          average30d: {
            physical: 4,
            financial: 6,
            discipline: 5,
            focus: 6,
            mental: 7,
            appearance: 0,
            overall: 1,
          },
        },
      } as never,
      "How am I doing generally?"
    );

    expect(response.message).toContain("Your weakest 30-day area: physical at 4/10.");
    expect(response.message).not.toContain("overall at 1/10");
  });
});
