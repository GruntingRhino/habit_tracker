import { Prisma, type DailyEntry } from "@/generated/prisma";
import prisma from "@/lib/prisma";
import { calculateScores, type CategoryScores, type DailyEntryInput } from "@/lib/scoring";
import { getStartOfDay } from "@/lib/utils";
import { subDays } from "date-fns";

const SCORE_KEYS = [
  "physical",
  "financial",
  "discipline",
  "focus",
  "mental",
  "appearance",
] as const;

const MAX_DISCIPLINE_HABIT_BONUS = 2;
const MAX_CATEGORY_HABIT_BONUS = 1.5;

type ScoreKey = (typeof SCORE_KEYS)[number];
type DbClient = Prisma.TransactionClient | typeof prisma;

// Habit categories are broader than score categories, so unmapped buckets
// fall back to discipline-only and the closest score dimension gets the bump.
const HABIT_CATEGORY_MAP: Record<string, ScoreKey | null> = {
  appearance: "appearance",
  discipline: "discipline",
  finance: "financial",
  financial: "financial",
  focus: "focus",
  general: null,
  health: "physical",
  mental: "mental",
  physical: "physical",
  productivity: "focus",
  social: "mental",
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(10, value));
}

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
  if (!category) return null;
  return HABIT_CATEGORY_MAP[category.toLowerCase()] ?? null;
}

function calculateOverall(scores: Omit<CategoryScores, "overall">): number {
  return clampScore(
    scores.physical * 0.20 +
      scores.financial * 0.15 +
      scores.discipline * 0.20 +
      scores.focus * 0.20 +
      scores.mental * 0.15 +
      scores.appearance * 0.10
  );
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

function applyHabitBonuses(params: {
  baseScores: CategoryScores;
  totalHabits: number;
  completedHabits: number;
  categoryRates: Partial<Record<ScoreKey, number>>;
}): CategoryScores {
  const { baseScores, totalHabits, completedHabits, categoryRates } = params;

  const nextScores: Omit<CategoryScores, "overall"> = {
    physical: baseScores.physical,
    financial: baseScores.financial,
    discipline: baseScores.discipline,
    focus: baseScores.focus,
    mental: baseScores.mental,
    appearance: baseScores.appearance,
  };

  if (totalHabits > 0) {
    nextScores.discipline = clampScore(
      nextScores.discipline +
        (completedHabits / totalHabits) * MAX_DISCIPLINE_HABIT_BONUS
    );
  }

  for (const key of SCORE_KEYS) {
    const rate = categoryRates[key];
    if (!rate) continue;

    nextScores[key] = clampScore(
      nextScores[key] + rate * MAX_CATEGORY_HABIT_BONUS
    );
  }

  return {
    physical: roundScore(nextScores.physical),
    financial: roundScore(nextScores.financial),
    discipline: roundScore(nextScores.discipline),
    focus: roundScore(nextScores.focus),
    mental: roundScore(nextScores.mental),
    appearance: roundScore(nextScores.appearance),
    overall: roundScore(calculateOverall(nextScores)),
  };
}

export async function recomputeCategoryScoreForDate(
  userId: string,
  date: Date,
  db: DbClient = prisma
) {
  const scoreDate = getStartOfDay(date);

  const [entry, activeHabits, allLogs, completedThisWeek, overdueCount, totalActive] =
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
      })
    : zeroScores();

  const categoryRates = Object.fromEntries(
    Object.entries(categoryStats).map(([key, stats]) => [
      key,
      stats.total > 0 ? stats.completed / stats.total : 0,
    ])
  ) as Partial<Record<ScoreKey, number>>;

  const nextScores = applyHabitBonuses({
    baseScores,
    totalHabits,
    completedHabits,
    categoryRates,
  });

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
        appearance: nextScores.appearance,
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
      appearance: nextScores.appearance,
      overall: nextScores.overall,
    },
  });
}
