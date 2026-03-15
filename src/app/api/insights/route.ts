import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { assessWorkout } from "@/lib/workout";
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

function startOfDayTime(value: Date): number {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function buildFallbackProblem(score: number): string {
  if (score <= 2) {
    return `Score is ${score}/10 — this category collapsed today.`;
  }
  if (score <= 4) {
    return `Score is ${score}/10 — this category is actively dragging your day down.`;
  }
  return `Score is ${score}/10 — better than failing, still far from tight execution.`;
}

function buildFallbackAction(score: number): string {
  if (score <= 2) {
    return "Treat this as a same-day correction. Fix the biggest miss in this category before tomorrow starts.";
  }
  if (score <= 4) {
    return "Pick the single highest-leverage fix in this category and make it non-negotiable tomorrow.";
  }
  return "Review the scoring thresholds in this category and tighten the weakest 1–2 inputs first.";
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
  const latestEntry = entries[0] ?? null;
  const latestWorkout = latestEntry
    ? assessWorkout({
        workoutCompleted: latestEntry.workoutCompleted,
        workoutRoutineName: latestEntry.workoutRoutineName,
        workoutDurationMinutes: latestEntry.workoutDurationMinutes,
        workoutIntensity: latestEntry.workoutIntensity,
        workoutDetails: latestEntry.workoutDetails,
      })
    : null;
  const latestDateKey = latestEntry ? startOfDayTime(latestEntry.date) : null;
  const latestHabitCompletionRate =
    latestDateKey === null || habits.length === 0
      ? 0
      : habits.filter((habit) => {
          const log = habit.logs.find(
            (entry) => startOfDayTime(entry.date) === latestDateKey
          );
          return log?.completed === true;
        }).length / habits.length;
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
    const workoutAssessments = entries.map((entry) => ({
      entry,
      workout: assessWorkout({
        workoutCompleted: entry.workoutCompleted,
        workoutRoutineName: entry.workoutRoutineName,
        workoutDurationMinutes: entry.workoutDurationMinutes,
        workoutIntensity: entry.workoutIntensity,
        workoutDetails: entry.workoutDetails,
      }),
    }));
    const noWorkoutDays = workoutAssessments.filter(
      ({ workout }) => !workout.countsAsWorkout
    ).length;
    const lowTrainingDays = workoutAssessments.filter(
      ({ entry, workout }) =>
        workout.effectiveTrainingMinutes + (entry.sportsTrainingMinutes ?? 0) < 30
    ).length;
    const weakWorkoutDays = workoutAssessments.filter(
      ({ workout }) => workout.performed && workout.qualityPoints < 2
    ).length;
    const avgSleep =
      n > 0
        ? entries.reduce((s, e) => s + (e.sleepHours ?? 0), 0) / n
        : 0;
    const avgEffectiveTraining =
      n > 0
        ? workoutAssessments.reduce(
            (sum, { entry, workout }) =>
              sum +
              workout.effectiveTrainingMinutes +
              (entry.sportsTrainingMinutes ?? 0),
            0
          ) / n
        : 0;
    const latestTrainingLoad =
      (latestWorkout?.effectiveTrainingMinutes ?? 0) +
      (latestEntry?.sportsTrainingMinutes ?? 0);

    if (latestEntry && (latestEntry.sleepHours ?? 0) < 6.5) {
      problems.push({
        text: `Today: only ${(latestEntry.sleepHours ?? 0).toFixed(1)}h sleep. That nearly zeros out the sleep portion of physical scoring.`,
      });
    }
    if (latestWorkout && latestWorkout.performed && latestWorkout.qualityPoints < 2) {
      problems.push({
        text: `Today: your workout only earned ${latestWorkout.qualityPoints.toFixed(1)}/3 credit — not enough duration or effort for real training points.`,
      });
    }
    if (latestEntry && latestTrainingLoad < 30) {
      problems.push({
        text: `Today: total training load was only ${latestTrainingLoad} effective minutes. That is below the threshold for meaningful physical momentum.`,
      });
    }

    if (badSleepDays > 10)
      problems.push({
        text: `Sleep out of optimal range (7.5–8.5h) on ${badSleepDays}/30 days — currently averaging ${avgSleep.toFixed(1)}h`,
      });
    if (noWorkoutDays > 15)
      problems.push({
        text: `No meaningful workout credit on ${noWorkoutDays}/30 days — less than 50% real training consistency`,
      });
    if (lowTrainingDays > 20)
      problems.push({
        text: `Total training load under 30 effective minutes on ${lowTrainingDays}/30 days — averaging ${avgEffectiveTraining.toFixed(0)} effective minutes`,
      });
    if (weakWorkoutDays > 8)
      problems.push({
        text: `Logged ${weakWorkoutDays}/30 workouts with weak structure or insufficient detail — vague sessions are capped hard`,
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
    if (weakWorkoutDays > 5)
      actions.push({
        type: "advice",
        text: "When you choose a custom workout, log what you actually did. Sets, distance, rounds, or drills matter because vague entries are intentionally capped.",
      });
    if (latestEntry && (latestEntry.sleepHours ?? 0) < 6.5)
      actions.push({
        type: "advice",
        text: "Tonight's fix is simple: get to bed on time and stop trying to outscore bad sleep with effort tomorrow.",
      });
  }

  if (category === "financial") {
    const noIncomeDays = countDays((e) => !e.incomeActivity);
    const highSpendDays = countDays((e) => (e.moneySpent ?? 0) > 100);
    const noSavingsDays = countDays(
      (e) => (e.moneySaved ?? 0) === 0 && (e.moneySpent ?? 0) > 0
    );
    const latestSpent = latestEntry?.moneySpent ?? 0;
    const latestSaved = latestEntry?.moneySaved ?? 0;

    if (latestEntry && !latestEntry.incomeActivity) {
      problems.push({
        text: "Today: no income-generating activity was logged, which hard-capped the financial score before spending was even considered.",
      });
    }
    if (latestEntry && latestSpent > 0 && latestSaved === 0) {
      problems.push({
        text: `Today: you spent ${formatMoney(latestSpent)} and saved ${formatMoney(latestSaved)}. That is pure financial leakage.`,
      });
    }

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
    if (latestEntry && !latestEntry.incomeActivity)
      actions.push({
        type: "advice",
        text: "Tomorrow needs one concrete money move before noon: outreach, sales, client work, shipping, or anything tied directly to revenue.",
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

    if (
      latestEntry &&
      (latestEntry.tasksPlanned ?? 0) > 0 &&
      (latestEntry.tasksCompleted ?? 0) / Math.max(1, latestEntry.tasksPlanned ?? 0) < 0.5
    ) {
      problems.push({
        text: `Today: you only completed ${latestEntry.tasksCompleted ?? 0}/${latestEntry.tasksPlanned ?? 0} planned tasks. That is not disciplined execution.`,
      });
    }
    if (latestHabitCompletionRate < 0.5) {
      problems.push({
        text: `Today: only ${Math.round(latestHabitCompletionRate * 100)}% of active habits were completed. Discipline scoring gives nothing below 50%.`,
      });
    }

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
    if (latestHabitCompletionRate < 0.5)
      actions.push({
        type: "advice",
        text: "Stop carrying too many standards loosely. Lock in the 2–3 habits that must happen every day and hit those first.",
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

    if (latestEntry && (latestEntry.deepWorkHours ?? 0) < 2) {
      problems.push({
        text: `Today: only ${latestEntry.deepWorkHours ?? 0}h of deep work logged. Focus scoring stays weak without a real block of uninterrupted work.`,
      });
    }
    if (latestEntry && (latestEntry.screenTimeHours ?? 0) > 5) {
      problems.push({
        text: `Today: ${latestEntry.screenTimeHours ?? 0}h of screen time triggered the focus penalty directly.`,
      });
    }

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
    if (latestEntry && (latestEntry.screenTimeHours ?? 0) > 5)
      actions.push({
        type: "advice",
        text: "Tomorrow: no reactive scrolling before your first deep-work block is complete.",
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

    if (latestEntry && (latestEntry.overallDayRating ?? 0) > 0 && (latestEntry.overallDayRating ?? 0) < 5) {
      problems.push({
        text: `Today: you rated the day ${latestEntry.overallDayRating}/10. Your own self-assessment says the day was not mentally solid.`,
      });
    }
    if (latestEntry && (latestEntry.sleepHours ?? 0) < 6.5) {
      problems.push({
        text: `Today: sleep was only ${(latestEntry.sleepHours ?? 0).toFixed(1)}h. That undercuts mood, resilience, and clarity immediately.`,
      });
    }

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
    if (latestEntry && (latestEntry.overallDayRating ?? 0) < 5)
      actions.push({
        type: "advice",
        text: "Do a short shutdown review tonight and write the single behavior that made the day feel bad. Fix that first tomorrow.",
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

    if (latestWorkout && !latestWorkout.countsAsWorkout) {
      problems.push({
        text: "Today: there was no meaningful workout credit, which drags appearance scoring immediately.",
      });
    }
    if (latestEntry && (latestEntry.steps ?? 0) > 0 && (latestEntry.steps ?? 0) < 7000) {
      problems.push({
        text: `Today: only ${(latestEntry.steps ?? 0).toLocaleString()} steps logged. That is low daily movement.`,
      });
    }

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
    if (latestEntry && (latestEntry.steps ?? 0) > 0 && (latestEntry.steps ?? 0) < 7000)
      actions.push({
        type: "advice",
        text: "Take the easy win tomorrow: a long walk gets you part of the way back without needing motivation gymnastics.",
      });
  }

  // If no issues found for a sub-10 score, add generic advice
  if (problems.length === 0 && currentScore < 10) {
    problems.push({
      text: buildFallbackProblem(currentScore),
    });
    actions.push({
      type: "advice",
      text: buildFallbackAction(currentScore),
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
