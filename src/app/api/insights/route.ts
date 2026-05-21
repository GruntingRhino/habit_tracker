import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { assessWorkout } from "@/lib/workout";
import { subDays } from "date-fns";
import { reportError } from "@/lib/monitoring";
import {
  buildScopedRateLimitKeys,
  extractClientIp,
  isRateLimited,
} from "@/lib/rate-limit";

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

const insightRequestSchema = z.object({
  category: z.enum([
    "discipline",
    "focus",
    "financial",
    "mental",
    "overall",
    "physical",
  ]),
  currentScore: z.number().min(0).max(10),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const limit = await isRateLimited(
      buildScopedRateLimitKeys(
        "insights",
        session.user.id,
        extractClientIp(req.headers)
      )
    );
    if (limit) {
      return NextResponse.json(
        { error: "Too many insight requests. Try again shortly." },
        { status: 429 }
      );
    }

    const rawBody = await req.json();
    const parsed = insightRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const { category, currentScore } = parsed.data;
    const userId = session.user.id;
    const since = subDays(new Date(), 30);

    const [entries, scores, habits, overdueProjectCount] = await Promise.all([
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
        include: { logs: { where: { date: { gte: since } } } },
      }),
      prisma.project.count({
        where: {
          userId,
          status: { not: "completed" },
          deadline: { lt: new Date() },
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

  function countDays(fn: (e: (typeof entries)[0]) => boolean) {
    return entries.filter(fn).length;
  }

  // ── Physical ────────────────────────────────────────────────────────────────
  if (category === "physical") {
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

    const noWorkoutDays = workoutAssessments.filter(({ workout }) => !workout.countsAsWorkout).length;
    const lowTrainingDays = workoutAssessments.filter(
      ({ entry, workout }) => workout.effectiveTrainingMinutes + (entry.sportsTrainingMinutes ?? 0) < 30
    ).length;
    const weakWorkoutDays = workoutAssessments.filter(
      ({ workout }) => workout.performed && workout.qualityPoints < 2
    ).length;

    const avgSleep = n > 0 ? entries.reduce((s, e) => s + (e.sleepHours ?? 0), 0) / n : 0;
    const avgEffectiveTraining =
      n > 0
        ? workoutAssessments.reduce(
            (sum, { entry, workout }) =>
              sum + workout.effectiveTrainingMinutes + (entry.sportsTrainingMinutes ?? 0),
            0
          ) / n
        : 0;
    const performedWorkouts = workoutAssessments.filter((w) => w.workout.performed);
    const avgQualityPoints =
      performedWorkouts.length > 0
        ? performedWorkouts.reduce((s, w) => s + w.workout.qualityPoints, 0) / performedWorkouts.length
        : 0;
    const latestTrainingLoad =
      (latestWorkout?.effectiveTrainingMinutes ?? 0) + (latestEntry?.sportsTrainingMinutes ?? 0);
    const badSleepDays = countDays((e) => (e.sleepHours ?? 0) < 7 || (e.sleepHours ?? 0) > 9);

    // Hard problems (today)
    if (latestEntry && (latestEntry.sleepHours ?? 0) < 6.5)
      problems.push({ text: `Today: only ${(latestEntry.sleepHours ?? 0).toFixed(1)}h sleep — this nearly zeros the sleep portion of physical scoring.` });
    if (latestWorkout && latestWorkout.performed && latestWorkout.qualityPoints < 2)
      problems.push({ text: `Today: workout earned ${latestWorkout.qualityPoints.toFixed(1)}/3 quality credit — not enough duration or effort for full training points.` });
    if (latestEntry && latestTrainingLoad < 30)
      problems.push({ text: `Today: only ${latestTrainingLoad} effective training minutes — below the 30-min threshold for meaningful physical credit.` });

    // Hard 30-day problems
    if (badSleepDays > 10)
      problems.push({ text: `Sleep out of optimal range on ${badSleepDays}/30 days — averaging ${avgSleep.toFixed(1)}h (target: 7.5–8.5h).` });
    if (noWorkoutDays > 15)
      problems.push({ text: `No meaningful workout credit on ${noWorkoutDays}/30 days — under 50% real training consistency.` });
    if (lowTrainingDays > 20)
      problems.push({ text: `Training load under 30 min on ${lowTrainingDays}/30 days — averaging ${avgEffectiveTraining.toFixed(0)} effective minutes.` });
    if (weakWorkoutDays > 8)
      problems.push({ text: `${weakWorkoutDays}/30 workouts logged with weak structure or no detail — vague sessions are capped hard.` });

    // Soft diagnostics (specific when score is 5–9 and hard checks didn't fire)
    if (problems.length === 0 && currentScore < 10) {
      if (avgSleep < 7.5)
        problems.push({ text: `Averaging ${avgSleep.toFixed(1)}h sleep — the scoring target is 7.5–8.5h. You're ${(7.5 - avgSleep).toFixed(1)}h short per night, which compounds across 30 days.` });
      if (avgEffectiveTraining < 45)
        problems.push({ text: `Averaging ${avgEffectiveTraining.toFixed(0)} effective training minutes/day — 45–60+ min of quality work is where physical points peak.` });
      if (avgQualityPoints > 0 && avgQualityPoints < 2.5)
        problems.push({ text: `Workout quality averaging ${avgQualityPoints.toFixed(1)}/3 — you're showing up but not logging enough structure for full credit.` });
      if (noWorkoutDays > 8)
        problems.push({ text: `Skipped training on ${noWorkoutDays}/30 days (${Math.round((noWorkoutDays / Math.max(n, 1)) * 100)}% skip rate) — consistency is the first lever.` });
    }

    // Actions
    if (avgSleep < 7)
      actions.push({ type: "advice", text: "Set a fixed bedtime alarm. Aim for 7.5–8.5h. Use the bedtime field in your daily entry to track it." });
    if (avgSleep >= 7 && avgSleep < 7.5)
      actions.push({ type: "advice", text: `Move your bedtime ${Math.ceil((7.5 - avgSleep) * 60)} minutes earlier. That single change closes most of your sleep gap.` });
    if (noWorkoutDays > 10)
      actions.push({ type: "add_habit", text: "Add a daily workout habit to enforce training consistency", habitName: "Daily Workout", habitCategory: "physical" });
    if (avgEffectiveTraining < 45)
      actions.push({ type: "advice", text: "Add 15 minutes to each session. Push toward 45–60 min of actual work-dense training, not just time in the gym." });
    if (avgQualityPoints > 0 && avgQualityPoints < 2.5)
      actions.push({ type: "advice", text: "Log your actual sets, reps, weight, or rounds. Specific detail pushes quality past 2.5/3 — vague entries are intentionally capped." });
    if (latestEntry && (latestEntry.sleepHours ?? 0) < 6.5)
      actions.push({ type: "advice", text: "Tonight: get to bed on time. You cannot outscore bad sleep with effort the next day." });
  }

  // ── Financial ───────────────────────────────────────────────────────────────
  if (category === "financial") {
    const noIncomeDays = countDays((e) => !e.incomeActivity);
    const highSpendDays = countDays((e) => (e.moneySpent ?? 0) > 100);
    const noSavingsDays = countDays((e) => (e.moneySaved ?? 0) === 0 && (e.moneySpent ?? 0) > 0);
    const latestSpent = latestEntry?.moneySpent ?? 0;
    const latestSaved = latestEntry?.moneySaved ?? 0;
    const avgSpent = n > 0 ? entries.reduce((s, e) => s + (e.moneySpent ?? 0), 0) / n : 0;
    const avgSaved = n > 0 ? entries.reduce((s, e) => s + (e.moneySaved ?? 0), 0) / n : 0;
    const incomeDays = n - noIncomeDays;

    // Hard problems (today)
    if (latestEntry && !latestEntry.incomeActivity)
      problems.push({ text: "Today: no income-generating activity logged — this hard-caps financial score before spending is even considered." });
    if (latestEntry && latestSpent > 0 && latestSaved === 0)
      problems.push({ text: `Today: spent ${formatMoney(latestSpent)} and saved ${formatMoney(0)} — pure financial leakage.` });

    // Hard 30-day problems
    if (noIncomeDays > 20)
      problems.push({ text: `No income activity on ${noIncomeDays}/30 days — missing it caps your financial ceiling entirely.` });
    if (highSpendDays > 10)
      problems.push({ text: `Spent over $100 on ${highSpendDays}/30 days — high discretionary spending.` });
    if (noSavingsDays > 15)
      problems.push({ text: `$0 saved on ${noSavingsDays} days where money was spent.` });

    // Soft diagnostics
    if (problems.length === 0 && currentScore < 10) {
      if (noIncomeDays > 3)
        problems.push({ text: `Income activity skipped on ${noIncomeDays}/30 days — you had ${incomeDays} active days. Each missed day caps your score ceiling.` });
      if (avgSaved < avgSpent * 0.25 && avgSpent > 0)
        problems.push({ text: `Saving ${formatMoney(avgSaved)}/day against ${formatMoney(avgSpent)}/day spend — your savings rate is ${Math.round((avgSaved / avgSpent) * 100)}% of daily spend. Target is 25%+.` });
      if (noSavingsDays > 5)
        problems.push({ text: `$0 saved on ${noSavingsDays} days where money was spent — consistent daily savings is what separates a 7 from a 9 here.` });
      if (highSpendDays > 5)
        problems.push({ text: `Spent $100+ on ${highSpendDays} days this month — that spending pattern is leaking financial score points.` });
    }

    // Actions
    if (noIncomeDays > 5)
      actions.push({ type: "add_habit", text: "Add a daily income-activity habit (business work, freelance, investing)", habitName: "Income-Generating Activity", habitCategory: "financial" });
    if (avgSaved < avgSpent * 0.25 && avgSpent > 0)
      actions.push({ type: "advice", text: `Log at least ${formatMoney(Math.ceil(avgSpent * 0.25))} saved every day you spend money. Even $10 logged changes the scoring calculus.` });
    if (noSavingsDays > 5)
      actions.push({ type: "add_habit", text: "Add a daily savings habit — even small amounts build the scoring pattern", habitName: "Save Money Daily", habitCategory: "financial" });
    if (latestEntry && !latestEntry.incomeActivity)
      actions.push({ type: "advice", text: "Tomorrow: one revenue-generating action before noon — outreach, client work, sales, shipping, or investing. Anything tied directly to money in." });
  }

  // ── Discipline ──────────────────────────────────────────────────────────────
  if (category === "discipline") {
    const habitStats = habits.map((h) => {
      const completed = h.logs.filter((l) => l.completed).length;
      const total = h.logs.length;
      return { name: h.id, habitName: h.name, rate: total > 0 ? completed / total : 0 };
    });
    const lowHabits = habitStats.filter((h) => h.rate < 0.5);
    const mediumHabits = habitStats.filter((h) => h.rate >= 0.5 && h.rate < 0.8);
    const avgHabitRate =
      habitStats.length > 0
        ? habitStats.reduce((s, h) => s + h.rate, 0) / habitStats.length
        : 0;
    const taskEntries = entries.filter((e) => (e.tasksPlanned ?? 0) > 0);
    const avgTaskCompletion =
      taskEntries.length > 0
        ? taskEntries.reduce((s, e) => s + (e.tasksCompleted ?? 0) / Math.max(1, e.tasksPlanned ?? 1), 0) / taskEntries.length
        : 0;
    const lowTaskDays = countDays(
      (e) => (e.tasksPlanned ?? 0) > 0 && (e.tasksCompleted ?? 0) / (e.tasksPlanned ?? 1) < 0.5
    );

    // Hard problems (today)
    if (latestEntry && (latestEntry.tasksPlanned ?? 0) > 0 &&
        (latestEntry.tasksCompleted ?? 0) / Math.max(1, latestEntry.tasksPlanned ?? 0) < 0.5)
      problems.push({ text: `Today: completed ${latestEntry.tasksCompleted ?? 0}/${latestEntry.tasksPlanned ?? 0} planned tasks — under 50% task completion tanks discipline directly.` });
    if (latestHabitCompletionRate < 0.5)
      problems.push({ text: `Today: only ${Math.round(latestHabitCompletionRate * 100)}% of habits completed — discipline scoring gives no credit below 50%.` });

    // Hard 30-day problems
    if (avgHabitRate < 0.7)
      problems.push({ text: `Average habit completion is ${Math.round(avgHabitRate * 100)}% — you need 75%+ for meaningful discipline points.` });
    for (const h of lowHabits)
      problems.push({ text: `"${h.habitName}" completed ${Math.round(h.rate * 100)}% of the time — below the 50% floor.` });
    if (lowTaskDays > 10)
      problems.push({ text: `Completed fewer than half your planned tasks on ${lowTaskDays}/30 days.` });
    if (overdueProjectCount > 0)
      problems.push({
        text: `${overdueProjectCount} active project${overdueProjectCount === 1 ? " is" : "s are"} overdue — discipline scoring is being penalized until that work is either finished or rescheduled.`,
      });

    // Soft diagnostics
    if (problems.length === 0 && currentScore < 10) {
      if (avgHabitRate < 0.85)
        problems.push({ text: `Habit completion averaging ${Math.round(avgHabitRate * 100)}% — you need 85%+ consistently to score in the 8–9 range. You're ${Math.round((0.85 - avgHabitRate) * 100)}% short.` });
      for (const h of mediumHabits)
        problems.push({ text: `"${h.habitName}" completed only ${Math.round(h.rate * 100)}% of the time — this inconsistency is quietly capping your score.` });
      if (avgTaskCompletion > 0 && avgTaskCompletion < 0.8)
        problems.push({ text: `Completing ${Math.round(avgTaskCompletion * 100)}% of planned tasks on average — plan fewer and hit them all rather than carrying unfinished work.` });
    }

    // Actions
    for (const h of lowHabits)
      actions.push({ type: "adjust_habit", text: `Set "${h.habitName}" as high priority — you're not treating it seriously enough`, habitId: h.name, priority: "high" });
    for (const h of mediumHabits)
      actions.push({ type: "advice", text: `Give "${h.habitName}" a fixed daily time slot. Attach it to a trigger you already do (morning alarm, meals, etc.) so it stops getting skipped.` });
    if (avgTaskCompletion > 0 && avgTaskCompletion < 0.8)
      actions.push({ type: "advice", text: "Cap your task list at 3 per day. Completing 3/3 beats completing 5/8 in both score and momentum." });
    if (latestHabitCompletionRate < 0.5)
      actions.push({ type: "advice", text: "Identify the 2–3 habits that must happen every day and hit those first before anything else." });
    if (overdueProjectCount > 0)
      actions.push({
        type: "advice",
        text: "Clear or reschedule every overdue project tonight. Leaving deadlines broken is a direct discipline penalty now.",
      });
  }

  // ── Focus ───────────────────────────────────────────────────────────────────
  if (category === "focus") {
    const lowDeepWorkDays = countDays((e) => (e.deepWorkHours ?? 0) < 2);
    const highScreenDays = countDays((e) => (e.screenTimeHours ?? 0) > 5);
    const avgDeepWork = n > 0 ? entries.reduce((s, e) => s + (e.deepWorkHours ?? 0), 0) / n : 0;
    const avgScreen = n > 0 ? entries.reduce((s, e) => s + (e.screenTimeHours ?? 0), 0) / n : 0;
    const under3DeepWorkDays = countDays((e) => (e.deepWorkHours ?? 0) < 3);

    // Hard problems (today)
    if (latestEntry && (latestEntry.deepWorkHours ?? 0) < 2)
      problems.push({ text: `Today: only ${latestEntry.deepWorkHours ?? 0}h deep work — focus scoring stays weak without a real block of uninterrupted output.` });
    if (latestEntry && (latestEntry.screenTimeHours ?? 0) > 5)
      problems.push({ text: `Today: ${latestEntry.screenTimeHours ?? 0}h screen time triggered the focus penalty directly.` });

    // Hard 30-day problems
    if (lowDeepWorkDays > 15)
      problems.push({ text: `Deep work under 2h on ${lowDeepWorkDays}/30 days — averaging ${avgDeepWork.toFixed(1)}h/day.` });
    if (highScreenDays > 15)
      problems.push({ text: `Screen time over 5h on ${highScreenDays}/30 days — averaging ${avgScreen.toFixed(1)}h/day. This actively penalizes your score.` });
    if (overdueProjectCount > 0)
      problems.push({
        text: `${overdueProjectCount} active project${overdueProjectCount === 1 ? " is" : "s are"} overdue — open overdue work is splitting attention and cutting into focus scoring.`,
      });

    // Soft diagnostics
    if (problems.length === 0 && currentScore < 10) {
      if (avgDeepWork < 3)
        problems.push({ text: `Averaging ${avgDeepWork.toFixed(1)}h deep work/day — 3h+ is where focus scoring peaks. You're ${(3 - avgDeepWork).toFixed(1)}h short per day.` });
      if (under3DeepWorkDays > 10)
        problems.push({ text: `Under 3h deep work on ${under3DeepWorkDays}/30 days — you're hitting 2h+ but not consistently clearing the 3h threshold that drives the top tier.` });
      if (avgScreen > 3)
        problems.push({ text: `Averaging ${avgScreen.toFixed(1)}h screen time — even at 3–5h it's quietly eating into your focus ceiling. Target is under 3h.` });
    }

    // Actions
    if (avgDeepWork < 3)
      actions.push({ type: "add_habit", text: "Add a 3-hour morning deep work block (phone off, one task, before 10am)", habitName: "3-Hour Morning Deep Work", habitCategory: "focus" });
    if (avgScreen > 3)
      actions.push({ type: "advice", text: `Cut ${(avgScreen - 3).toFixed(0)}h of daily screen time with app limits. The source doesn't matter — total does.` });
    if (lowDeepWorkDays > 10)
      actions.push({ type: "add_habit", text: "Add a 2-hour deep work block habit (no interruptions, phone off)", habitName: "2-Hour Deep Work Block", habitCategory: "focus" });
    if (latestEntry && (latestEntry.screenTimeHours ?? 0) > 5)
      actions.push({ type: "advice", text: "Tomorrow: no reactive scrolling before your first deep-work block is complete." });
    if (avgDeepWork >= 2 && avgDeepWork < 3)
      actions.push({ type: "advice", text: `You're hitting 2h — add one more hour by starting 60 minutes earlier and protecting that window before your first meeting or task switch.` });
    if (overdueProjectCount > 0)
      actions.push({
        type: "advice",
        text: "Pick one overdue project and define the next concrete task. Ambiguous overdue work is what keeps fragmenting focus.",
      });
  }

  // ── Mental ──────────────────────────────────────────────────────────────────
  if (category === "mental") {
    const lowRatingDays = countDays((e) => (e.overallDayRating ?? 0) > 0 && (e.overallDayRating ?? 0) < 6);
    const badSleepDays = countDays((e) => (e.sleepHours ?? 0) > 0 && (e.sleepHours ?? 0) < 6.5);
    const highScreenDays = countDays((e) => (e.screenTimeHours ?? 0) > 4);
    const ratedEntries = entries.filter((e) => (e.overallDayRating ?? 0) > 0);
    const avgRating =
      ratedEntries.length > 0
        ? ratedEntries.reduce((s, e) => s + (e.overallDayRating ?? 0), 0) / ratedEntries.length
        : 0;
    const avgSleep = n > 0 ? entries.reduce((s, e) => s + (e.sleepHours ?? 0), 0) / n : 0;
    const avgScreen = n > 0 ? entries.reduce((s, e) => s + (e.screenTimeHours ?? 0), 0) / n : 0;
    const rightWithGodDays = entries.filter((e) => e.rightWithGod).length;

    // Hard problems (today)
    if (latestEntry && (latestEntry.overallDayRating ?? 0) > 0 && (latestEntry.overallDayRating ?? 0) < 5)
      problems.push({ text: `Today: you rated the day ${latestEntry.overallDayRating}/10 — your own self-assessment says it wasn't mentally solid.` });
    if (latestEntry && (latestEntry.sleepHours ?? 0) < 6.5)
      problems.push({ text: `Today: only ${(latestEntry.sleepHours ?? 0).toFixed(1)}h sleep — undercuts mood, resilience, and clarity immediately.` });

    // Hard 30-day problems
    if (lowRatingDays > 10)
      problems.push({ text: `Rated ${lowRatingDays} days below 6/10 — 30-day average is ${avgRating.toFixed(1)}/10.` });
    if (badSleepDays > 10)
      problems.push({ text: `Slept under 6.5h on ${badSleepDays}/30 days — chronic sleep deficit damages mental scores.` });
    if (highScreenDays > 15)
      problems.push({ text: `4h+ screen time on ${highScreenDays}/30 days — directly lowers mental wellbeing score.` });

    // Soft diagnostics
    if (problems.length === 0 && currentScore < 10) {
      if (avgRating > 0 && avgRating < 7.5)
        problems.push({ text: `Average self-rated day is ${avgRating.toFixed(1)}/10 — your own assessment is anchoring the mental score. Days rated 5–7 create a ceiling.` });
      if (avgSleep < 7.5)
        problems.push({ text: `Averaging ${avgSleep.toFixed(1)}h sleep — mental clarity and mood both take a direct hit under 7.5h. This is the #1 lever.` });
      if (avgScreen > 2.5)
        problems.push({ text: `Averaging ${avgScreen.toFixed(1)}h screen time — passive consumption quietly degrades mental sharpness and self-rated wellbeing.` });
      if (n > 7 && rightWithGodDays < n * 0.5)
        problems.push({ text: `"Right with God" checked only ${rightWithGodDays}/${n} days — this spiritual/reflective field contributes to mental scoring when consistent.` });
    }

    // Actions
    if (avgRating > 0 && avgRating < 7)
      actions.push({ type: "add_habit", text: "Add a daily meditation or journaling habit to improve your mental baseline", habitName: "Morning Meditation/Journal", habitCategory: "mental" });
    if (avgSleep < 7.5)
      actions.push({ type: "advice", text: `You need ${(7.5 - avgSleep).toFixed(1)}h more sleep/night. Back-calculate your bedtime from your wake time and set a phone alarm.` });
    if (avgScreen > 2.5)
      actions.push({ type: "add_habit", text: "Add a phone-free morning habit (no screens first 60 min)", habitName: "Phone-Free Morning (60 min)", habitCategory: "mental" });
    if (avgRating > 0 && avgRating < 7.5)
      actions.push({ type: "advice", text: "Write down what made your last 3 low-rated days bad. If the same answer appears twice, that's your fix — it's almost always sleep, output, or avoidance." });
    if (n > 7 && rightWithGodDays < n * 0.5)
      actions.push({ type: "advice", text: "Log the 'right with God' field daily — even 5 seconds. Consistent spiritual reflection tracks directly into mental scoring." });
  }

  // ── Overall ─────────────────────────────────────────────────────────────────
  if (category === "overall") {
    if (scores.length > 0) {
      const latest = scores[0];
      const categoryKeys = ["physical", "financial", "discipline", "focus", "mental"] as const;
      const ranked = categoryKeys
        .map((k) => ({ key: k, score: latest[k] ?? 0 }))
        .sort((a, b) => a.score - b.score);

      const weakest = ranked[0];
      const secondWeakest = ranked[1];
      const avgScores = Object.fromEntries(
        categoryKeys.map((k) => [
          k,
          scores.length > 0
            ? Math.round((scores.reduce((s, sc) => s + (sc[k] ?? 0), 0) / scores.length) * 10) / 10
            : 0,
        ])
      );

      problems.push({
        text: `Your lowest score is ${weakest.key} at ${weakest.score.toFixed(1)}/10 — this single category is pulling your overall score down the most.`,
      });
      if (secondWeakest.score < 7) {
        problems.push({
          text: `${secondWeakest.key} is also lagging at ${secondWeakest.score.toFixed(1)}/10 — fixing both would lift your overall by ~${((10 - weakest.score + 10 - secondWeakest.score) / 5 * 0.6).toFixed(1)} points.`,
        });
      }

      const trendingDown = categoryKeys.filter((k) => {
        const vals = scores.slice(0, 7).map((s) => s[k] ?? 0);
        if (vals.length < 3) return false;
        const recent = vals.slice(0, 3).reduce((s, v) => s + v, 0) / 3;
        const older = vals.slice(-3).reduce((s, v) => s + v, 0) / 3;
        return recent - older < -0.5;
      });
      if (trendingDown.length > 0)
        problems.push({ text: `${trendingDown.join(", ")} ${trendingDown.length === 1 ? "has" : "have"} trended down over the last 7 days — declining momentum is compounding.` });

      actions.push({
        type: "advice",
        text: `Click the ${weakest.key} score card for a specific breakdown of exactly what is holding it at ${weakest.score.toFixed(1)}/10 and what to fix first.`,
      });
      if (currentScore < 8) {
        const lowestAvg = [...ranked].sort((a, b) => (avgScores[a.key] ?? 0) - (avgScores[b.key] ?? 0))[0];
        actions.push({
          type: "advice",
          text: `Over 30 days your weakest average is ${lowestAvg.key} at ${avgScores[lowestAvg.key]}/10. Fix the pattern there — today's score is a symptom, not the problem.`,
        });
      }
    } else {
      problems.push({ text: "Not enough data yet. Log daily entries to unlock specific score analysis." });
      actions.push({ type: "advice", text: "Log your first daily entry to start seeing category-specific breakdowns." });
    }
  }

  // Final safety net — should rarely fire now
  if (problems.length === 0 && currentScore < 10) {
    problems.push({ text: `Score is ${currentScore.toFixed(1)}/10. No single threshold was breached but performance isn't at ceiling.` });
    actions.push({ type: "advice", text: "Every input in this category is passing — push each one 10% further. Marginal improvements across all inputs add up to a full point." });
  }

    return NextResponse.json({ category, currentScore, thirtyDayAvg, problems, actions } satisfies InsightResult);
  } catch (error) {
    reportError({ context: "insights POST", error, userId: session.user.id });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
