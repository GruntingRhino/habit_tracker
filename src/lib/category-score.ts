import { Prisma, type DailyEntry } from "@/generated/prisma";
import prisma from "@/lib/prisma";
import {
  calculateOverallScore,
  calculateScores,
  type CategoryScores,
  type DailyEntryInput,
} from "@/lib/scoring";
import { extractScoringSettings } from "@/lib/scoring-settings";
import { normalizeHabitCategory } from "@/lib/habit-category";
import { getStartOfDay } from "@/lib/utils";
import { subDays } from "date-fns";

type ScoreKey = "physical" | "financial" | "discipline" | "focus" | "mental";
type DbClient = Prisma.TransactionClient | typeof prisma;

// Habit categories are broader than score categories, so unmapped buckets
// fall back to discipline-only and the closest score dimension gets the bump.
const HABIT_CATEGORY_MAP: Record<string, ScoreKey | null> = {
  discipline: "discipline",
  finance: "financial",
  financial: "financial",
  focus: "focus",
  general: "discipline",
  health: "physical",
  mental: "mental",
  physical: "physical",
  productivity: "focus",
  social: "mental",
};

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

function zeroScores(): CategoryScores {
  return {
    physical: 0,
    financial: 0,
    discipline: 0,
    focus: 0,
    mental: 0,
    appearance: 0,
    overall: 0,
  };
}

function mapDailyEntryToInput(entry: DailyEntry): DailyEntryInput {
  return {
    sleepHours: entry.sleepHours ?? undefined,
    workoutCompleted: entry.workoutCompleted,
    workoutRoutineName: entry.workoutRoutineName ?? undefined,
    workoutDurationMinutes: entry.workoutDurationMinutes ?? undefined,
    workoutIntensity: entry.workoutIntensity ?? undefined,
    workoutDetails: entry.workoutDetails ?? undefined,
    sportsTrainingMinutes: entry.sportsTrainingMinutes ?? undefined,
    steps: entry.steps ?? undefined,
    deepWorkHours: entry.deepWorkHours ?? undefined,
    screenTimeHours: entry.screenTimeHours ?? undefined,
    tasksPlanned: entry.tasksPlanned ?? undefined,
    tasksCompleted: entry.tasksCompleted ?? undefined,
    taskDifficultyRating: entry.taskDifficultyRating ?? undefined,
    moneySpent: entry.moneySpent ?? undefined,
    moneySaved: entry.moneySaved ?? undefined,
    overallDayRating: entry.overallDayRating ?? undefined,
    incomeActivity: entry.incomeActivity,
    caloriesEaten: entry.caloriesEaten ?? undefined,
    rightWithGod: entry.rightWithGod,
  };
}

function mapHabitCategoryToScoreKey(category: string | null | undefined): ScoreKey | null {
  return HABIT_CATEGORY_MAP[normalizeHabitCategory(category)] ?? null;
}

function calcRecentStreak(logs: { date: Date; completed: boolean }[]): number {
  if (!logs.length) return 0;

  const logsByDate = new Map<string, { completed: number; total: number }>();
  for (const log of logs) {
    const key = getStartOfDay(log.date).toISOString();
    const current = logsByDate.get(key) ?? { completed: 0, total: 0 };
    current.total += 1;
    if (log.completed) current.completed += 1;
    logsByDate.set(key, current);
  }

  const streakDays = Array.from(logsByDate.entries()).map(([date, stats]) => ({
    date: new Date(date),
    completed: stats.total > 0 && stats.completed / stats.total >= 0.5,
  }));

  const sorted = streakDays.sort((a, b) => b.date.getTime() - a.date.getTime());
  const today = getStartOfDay(new Date()).getTime();
  let streak = 0;
  let cursor = today;

  for (const log of sorted) {
    const logDay = getStartOfDay(log.date).getTime();
    if (logDay === cursor) {
      if (!log.completed) break;
      streak += 1;
      cursor -= 86_400_000;
      continue;
    }

    if (logDay < cursor) break;
  }

  return streak;
}

export async function recomputeCategoryScoreForDate(
  userId: string,
  date: Date,
  db: DbClient = prisma
) {
  const scoreDate = getStartOfDay(date);

  const [entry, activeHabits, allLogs, completedThisWeek, overdueCount, totalActive, coachProfile] =
    await Promise.all([
      db.dailyEntry.findFirst({
        where: { userId, date: scoreDate },
      }),
      db.habit.findMany({
        where: { userId, isActive: true },
        select: {
          category: true,
          logs: {
            where: { date: scoreDate },
            select: { completed: true },
            take: 1,
          },
        },
      }),
      db.habitLog.findMany({
        where: {
          habit: { userId },
          date: { gte: subDays(scoreDate, 60) },
        },
        orderBy: { date: "desc" },
      }),
      db.project.count({
        where: {
          userId,
          status: "completed",
          completedAt: { gte: subDays(new Date(), 7) },
        },
      }),
      db.project.count({
        where: {
          userId,
          status: { not: "completed" },
          deadline: { lt: new Date() },
        },
      }),
      db.project.count({
        where: { userId, status: "active" },
      }),
      db.coachProfile.findUnique({
        where: { userId },
        select: { preferences: true },
      }),
    ]);

  let completedHabits = 0;
  const categoryStats: Partial<Record<ScoreKey, { completed: number; total: number }>> = {};

  for (const habit of activeHabits) {
    const scoreKey = mapHabitCategoryToScoreKey(habit.category);
    const completed = habit.logs[0]?.completed === true;

    if (completed) completedHabits += 1;

    if (!scoreKey) continue;

    const current = categoryStats[scoreKey] ?? { completed: 0, total: 0 };
    current.total += 1;
    if (completed) current.completed += 1;
    categoryStats[scoreKey] = current;
  }

  const totalHabits = activeHabits.length;
  const habitCompletionRate = totalHabits > 0 ? completedHabits / totalHabits : 0;
  const recentStreak = calcRecentStreak(
    allLogs.map((log) => ({ date: log.date, completed: log.completed }))
  );

  const baseScores = entry
    ? calculateScores({
        entry: mapDailyEntryToInput(entry),
        habitCompletionRate,
        projectStats: { completedThisWeek, overdueCount, totalActive },
        recentStreak,
        scoringSettings: extractScoringSettings(coachProfile?.preferences),
        categoryHabitRates: Object.fromEntries(
          Object.entries(categoryStats).map(([key, stats]) => [
            key,
            stats.total > 0 ? stats.completed / stats.total : 0,
          ])
        ) as Partial<Record<ScoreKey, number>>,
      })
    : zeroScores();
  const nextScores = {
    ...baseScores,
    overall: roundScore(
      calculateOverallScore({
        physical: baseScores.physical,
        financial: baseScores.financial,
        discipline: baseScores.discipline,
        focus: baseScores.focus,
        mental: baseScores.mental,
      })
    ),
  };

  const existing = await db.categoryScore.findFirst({
    where: { userId, date: scoreDate },
  });

  if (existing) {
    return db.categoryScore.update({
      where: { id: existing.id },
      data: {
        dailyEntryId: entry?.id ?? null,
        physical: nextScores.physical,
        financial: nextScores.financial,
        discipline: nextScores.discipline,
        focus: nextScores.focus,
        mental: nextScores.mental,
        appearance: 0,
        overall: nextScores.overall,
      },
    });
  }

  return db.categoryScore.create({
    data: {
      userId,
      dailyEntryId: entry?.id,
      date: scoreDate,
      physical: nextScores.physical,
      financial: nextScores.financial,
      discipline: nextScores.discipline,
      focus: nextScores.focus,
      mental: nextScores.mental,
      appearance: 0,
      overall: nextScores.overall,
    },
  });
}
