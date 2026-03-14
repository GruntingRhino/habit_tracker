import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { subDays } from "date-fns";

export interface InsightProblem {
  text: string;
}

export interface InsightAction {
  type: "add_habit" | "adjust_habit" | "advice";
  text: string;
  habitName?: string;
  habitCategory?: string;
  habitId?: string;
  priority?: "low" | "medium" | "high";
}

export interface InsightResult {
  category: string;
  currentScore: number;
  thirtyDayAvg: number;
  problems: InsightProblem[];
  actions: InsightAction[];
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { category, currentScore } = await req.json();
  const userId = session.user.id;
  const since = subDays(new Date(), 30);

  // Fetch 30 days of data
  const [entries, scores, habits] = await Promise.all([
    prisma.dailyEntry.findMany({
      where: { userId, date: { gte: since } },
      orderBy: { date: "desc" },
    }),
    prisma.categoryScore.findMany({
      where: { userId, date: { gte: since } },
      orderBy: { date: "desc" },
    }),
    prisma.habit.findMany({
      where: { userId, isActive: true },
      include: {
        logs: {
          where: { date: { gte: since } },
        },
      },
    }),
  ]);

  const n = entries.length;
  const thirtyDayAvg =
    scores.length > 0
      ? Math.round(
          (scores.reduce(
            (sum, s) => sum + (s[category as keyof typeof s] as number ?? 0),
            0
          ) /
            scores.length) *
            10
        ) / 10
      : 0;

  const problems: InsightProblem[] = [];
  const actions: InsightAction[] = [];

  // Helper: count days meeting a condition
  function countDays(fn: (e: (typeof entries)[0]) => boolean) {
    return entries.filter(fn).length;
  }

  if (category === "physical") {
    const badSleepDays = countDays(
      (e) => (e.sleepHours ?? 0) < 7 || (e.sleepHours ?? 0) > 9
    );
    const noWorkoutDays = countDays((e) => !e.workoutCompleted && !e.workoutRoutineName);
    const lowTrainingDays = countDays(
      (e) => (e.sportsTrainingMinutes ?? 0) < 30
    );
    const avgSleep =
      n > 0
        ? entries.reduce((s, e) => s + (e.sleepHours ?? 0), 0) / n
        : 0;

    if (badSleepDays > 10)
      problems.push({
        text: `Sleep out of optimal range (7.5–8.5h) on ${badSleepDays}/30 days — currently averaging ${avgSleep.toFixed(1)}h`,
      });
    if (noWorkoutDays > 15)
      problems.push({
        text: `Skipped workout on ${noWorkoutDays}/30 days — less than 50% workout rate`,
      });
    if (lowTrainingDays > 20)
      problems.push({
        text: `Sports/extra training under 30 min on ${lowTrainingDays}/30 days`,
      });

    if (avgSleep < 7)
      actions.push({
        type: "advice",
        text: "Set a consistent bedtime alarm — aim for 7.5–8.5h sleep. Use your bedtime field to track it.",
      });
    if (noWorkoutDays > 10)
      actions.push({
        type: "add_habit",
        text: "Add a daily workout habit to enforce consistency",
        habitName: "Daily Workout",
        habitCategory: "physical",
      });
    if (lowTrainingDays > 15)
      actions.push({
        type: "add_habit",
        text: "Add a 60-min training session habit (sport, run, or drill)",
        habitName: "60-Min Training Session",
        habitCategory: "physical",
      });
  }

  if (category === "financial") {
    const noIncomeDays = countDays((e) => !e.incomeActivity);
    const highSpendDays = countDays((e) => (e.moneySpent ?? 0) > 100);
    const noSavingsDays = countDays(
      (e) => (e.moneySaved ?? 0) === 0 && (e.moneySpent ?? 0) > 0
    );

    if (noIncomeDays > 20)
      problems.push({
        text: `Did not log income-generating activity on ${noIncomeDays}/30 days — this alone caps your financial score`,
      });
    if (highSpendDays > 10)
      problems.push({
        text: `Spent over $100 on ${highSpendDays}/30 days — high discretionary spending`,
      });
    if (noSavingsDays > 15)
      problems.push({
        text: `Logged $0 saved on ${noSavingsDays}/30 days where money was spent`,
      });

    if (noIncomeDays > 10)
      actions.push({
        type: "add_habit",
        text: "Add a daily income-activity habit (work on business, freelance, invest)",
        habitName: "Income-Generating Activity",
        habitCategory: "financial",
      });
    if (highSpendDays > 10)
      actions.push({
        type: "advice",
        text: "Track every purchase. Aim to log something saved every day, even $5.",
      });
    if (noSavingsDays > 15)
      actions.push({
        type: "add_habit",
        text: "Add a daily savings habit — even small amounts build the discipline score",
        habitName: "Save Money Daily",
        habitCategory: "financial",
      });
  }

  if (category === "discipline") {
    // Analyze habit completion rates
    const habitStats = habits.map((h) => {
      const completed = h.logs.filter((l) => l.completed).length;
      const total = h.logs.length;
      return { name: h.id, habitName: h.name, rate: total > 0 ? completed / total : 0, priority: h.category };
    });

    const lowHabits = habitStats.filter((h) => h.rate < 0.5);
    const avgHabitRate =
      habitStats.length > 0
        ? habitStats.reduce((s, h) => s + h.rate, 0) / habitStats.length
        : 0;

    const lowTaskDays = countDays(
      (e) =>
        (e.tasksPlanned ?? 0) > 0 &&
        (e.tasksCompleted ?? 0) / (e.tasksPlanned ?? 1) < 0.5
    );

    if (avgHabitRate < 0.7)
      problems.push({
        text: `Average habit completion rate is ${Math.round(avgHabitRate * 100)}% — you need 75%+ for meaningful discipline points`,
      });
    for (const h of lowHabits) {
      problems.push({
        text: `"${h.habitName}" only completed ${Math.round(h.rate * 100)}% of the time — below the 50% threshold`,
      });
    }
    if (lowTaskDays > 10)
      problems.push({
        text: `Completed fewer than half your planned tasks on ${lowTaskDays}/30 days`,
      });

    for (const h of lowHabits) {
      actions.push({
        type: "adjust_habit",
        text: `Upgrade "${h.habitName}" to high priority — you're not taking it seriously enough`,
        habitId: h.name,
        priority: "high",
      });
    }
    if (lowTaskDays > 10)
      actions.push({
        type: "advice",
        text: "Plan fewer tasks per day — 3 focused tasks completed beats 8 abandoned ones.",
      });
  }

  if (category === "focus") {
    const lowDeepWorkDays = countDays((e) => (e.deepWorkHours ?? 0) < 2);
    const highScreenDays = countDays((e) => (e.screenTimeHours ?? 0) > 5);
    const avgDeepWork =
      n > 0
        ? entries.reduce((s, e) => s + (e.deepWorkHours ?? 0), 0) / n
        : 0;
    const avgScreen =
      n > 0
        ? entries.reduce((s, e) => s + (e.screenTimeHours ?? 0), 0) / n
        : 0;

    if (lowDeepWorkDays > 15)
      problems.push({
        text: `Deep work under 2h on ${lowDeepWorkDays}/30 days — averaging ${avgDeepWork.toFixed(1)}h/day`,
      });
    if (highScreenDays > 15)
      problems.push({
        text: `Screen time over 5h on ${highScreenDays}/30 days — averaging ${avgScreen.toFixed(1)}h/day. This actively penalizes your score.`,
      });

    if (lowDeepWorkDays > 10)
      actions.push({
        type: "add_habit",
        text: "Add a 2-hour deep work block habit (no interruptions, phone off)",
        habitName: "2-Hour Deep Work Block",
        habitCategory: "focus",
      });
    if (highScreenDays > 10)
      actions.push({
        type: "add_habit",
        text: "Add a screen-time limit habit — set your phone's daily limit to 3h",
        habitName: "Screen Time Under 3h",
        habitCategory: "focus",
      });
    if (avgDeepWork < 3)
      actions.push({
        type: "advice",
        text: "Start your day with 2–3h of focused work before checking email or social media.",
      });
  }

  if (category === "mental") {
    const lowRatingDays = countDays(
      (e) => (e.overallDayRating ?? 0) > 0 && (e.overallDayRating ?? 0) < 6
    );
    const badSleepDays = countDays(
      (e) => (e.sleepHours ?? 0) > 0 && (e.sleepHours ?? 0) < 6.5
    );
    const highScreenDays = countDays((e) => (e.screenTimeHours ?? 0) > 4);
    const avgRating =
      n > 0
        ? entries
            .filter((e) => (e.overallDayRating ?? 0) > 0)
            .reduce((s, e) => s + (e.overallDayRating ?? 0), 0) /
          Math.max(1, entries.filter((e) => (e.overallDayRating ?? 0) > 0).length)
        : 0;

    if (lowRatingDays > 10)
      problems.push({
        text: `Rated ${lowRatingDays} days below 6/10 — average day rating is ${avgRating.toFixed(1)}/10`,
      });
    if (badSleepDays > 10)
      problems.push({
        text: `Slept under 6.5h on ${badSleepDays}/30 days — chronic sleep deficit damages mental scores`,
      });
    if (highScreenDays > 15)
      problems.push({
        text: `4h+ screen time on ${highScreenDays}/30 days — directly lowers mental wellbeing score`,
      });

    if (avgRating < 6)
      actions.push({
        type: "add_habit",
        text: "Add a daily meditation or journaling habit to improve mental baseline",
        habitName: "Morning Meditation/Journal",
        habitCategory: "mental",
      });
    if (badSleepDays > 10)
      actions.push({
        type: "advice",
        text: "Sleep is your #1 mental health lever. Protect 7.5–8.5h like a non-negotiable appointment.",
      });
    if (highScreenDays > 15)
      actions.push({
        type: "add_habit",
        text: "Add a phone-free morning habit (no screens first 60 min)",
        habitName: "Phone-Free Morning (60 min)",
        habitCategory: "mental",
      });
  }

  if (category === "appearance") {
    const noWorkoutDays = countDays((e) => !e.workoutCompleted && !e.workoutRoutineName);
    const lowStepDays = countDays(
      (e) => (e.steps ?? 0) > 0 && (e.steps ?? 0) < 7000
    );
    const noStepsDays = countDays((e) => (e.steps ?? 0) === 0);
    const badSleepDays = countDays(
      (e) => (e.sleepHours ?? 0) > 0 && (e.sleepHours ?? 0) < 7
    );

    if (noWorkoutDays > 15)
      problems.push({
        text: `No workout logged on ${noWorkoutDays}/30 days — skipping the gym shows`,
      });
    if (lowStepDays > 10)
      problems.push({
        text: `Under 7,000 steps on ${lowStepDays}/30 tracked days — sedentary lifestyle affects appearance`,
      });
    if (noStepsDays > 20)
      problems.push({
        text: `Steps not logged on ${noStepsDays}/30 days — start tracking your movement`,
      });
    if (badSleepDays > 10)
      problems.push({
        text: `Under 7h sleep on ${badSleepDays}/30 days — poor sleep affects skin, energy, and physique`,
      });

    if (noWorkoutDays > 10)
      actions.push({
        type: "add_habit",
        text: "Commit to 5x/week gym or training sessions",
        habitName: "5x Weekly Training",
        habitCategory: "physical",
      });
    if (noStepsDays > 15)
      actions.push({
        type: "add_habit",
        text: "Add a 10,000 steps per day habit — get a cheap pedometer or use your phone",
        habitName: "10,000 Steps Daily",
        habitCategory: "physical",
      });
    if (badSleepDays > 10)
      actions.push({
        type: "advice",
        text: "Sleep affects your skin, posture, and energy more than any supplement. Fix this first.",
      });
  }

  // If no issues found for a sub-10 score, add generic advice
  if (problems.length === 0 && currentScore < 10) {
    problems.push({
      text: `Score is ${currentScore}/10 — good but not perfect. Push to close the gap.`,
    });
    actions.push({
      type: "advice",
      text: "Review the scoring thresholds in this category and identify the exact 1–2 things keeping you from 10/10.",
    });
  }

  const result: InsightResult = {
    category,
    currentScore,
    thirtyDayAvg,
    problems,
    actions,
  };

  return NextResponse.json(result);
}
