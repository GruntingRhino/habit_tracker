import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { calculateScores } from "@/lib/scoring";
import { getStartOfDay } from "@/lib/utils";
import { subDays } from "date-fns";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const thirtyDaysAgo = subDays(new Date(), 30);

    const entries = await prisma.dailyEntry.findMany({
      where: {
        userId: session.user.id,
        date: { gte: thirtyDaysAgo },
      },
      orderBy: { date: "desc" },
      include: {
        categoryScores: true,
      },
    });

    return NextResponse.json(entries);
  } catch (error) {
    console.error("[daily-entries GET] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const userId = session.user.id;

    const entryDate = body.date
      ? getStartOfDay(new Date(body.date))
      : getStartOfDay(new Date());

    // Check for existing entry for this user on this date
    const existingEntry = await prisma.dailyEntry.findFirst({
      where: { userId, date: entryDate },
    });

    let entry;
    if (existingEntry) {
      entry = await prisma.dailyEntry.update({
        where: { id: existingEntry.id },
        data: {
          sleepHours: body.sleepHours ?? undefined,
          workoutCompleted: body.workoutCompleted ?? undefined,
          workoutRoutineName: body.workoutRoutineName ?? undefined,
          sportsTrainingMinutes: body.sportsTrainingMinutes ?? undefined,
          steps: body.steps ?? undefined,
          deepWorkHours: body.deepWorkHours ?? undefined,
          screenTimeHours: body.screenTimeHours ?? undefined,
          tasksPlanned: body.tasksPlanned ?? undefined,
          tasksCompleted: body.tasksCompleted ?? undefined,
          taskDifficultyRating: body.taskDifficultyRating ?? undefined,
          moneySpent: body.moneySpent ?? undefined,
          moneySaved: body.moneySaved ?? undefined,
          incomeActivity: body.incomeActivity ?? undefined,
          caloriesEaten: body.caloriesEaten ?? undefined,
          wakeTime: body.wakeTime ?? undefined,
          bedtime: body.bedtime ?? undefined,
          notes: body.notes ?? undefined,
          overallDayRating: body.overallDayRating ?? undefined,
        },
      });
    } else {
      entry = await prisma.dailyEntry.create({
        data: {
          userId,
          date: entryDate,
          sleepHours: body.sleepHours,
          workoutCompleted: body.workoutCompleted ?? false,
          workoutRoutineName: body.workoutRoutineName,
          sportsTrainingMinutes: body.sportsTrainingMinutes,
          steps: body.steps,
          deepWorkHours: body.deepWorkHours,
          screenTimeHours: body.screenTimeHours,
          tasksPlanned: body.tasksPlanned,
          tasksCompleted: body.tasksCompleted,
          taskDifficultyRating: body.taskDifficultyRating,
          moneySpent: body.moneySpent,
          moneySaved: body.moneySaved,
          incomeActivity: body.incomeActivity ?? false,
          caloriesEaten: body.caloriesEaten,
          wakeTime: body.wakeTime,
          bedtime: body.bedtime,
          notes: body.notes,
          overallDayRating: body.overallDayRating,
        },
      });
    }

    // Compute habit completion rate for this day
    const habits = await prisma.habit.findMany({
      where: { userId, isActive: true },
      include: {
        logs: {
          where: { date: entryDate },
        },
      },
    });

    const totalHabits = habits.length;
    const completedHabits = habits.filter(
      (h) => h.logs[0]?.completed === true
    ).length;
    const habitCompletionRate =
      totalHabits > 0 ? completedHabits / totalHabits : 0;

    // Get project stats
    const oneWeekAgo = subDays(new Date(), 7);
    const [completedThisWeek, overdueCount, totalActive] = await Promise.all([
      prisma.project.count({
        where: {
          userId,
          status: "completed",
          completedAt: { gte: oneWeekAgo },
        },
      }),
      prisma.project.count({
        where: {
          userId,
          status: { not: "completed" },
          deadline: { lt: new Date() },
        },
      }),
      prisma.project.count({
        where: { userId, status: "active" },
      }),
    ]);

    // Calculate streak from habit logs
    const allLogs = await prisma.habitLog.findMany({
      where: {
        habit: { userId },
      },
      orderBy: { date: "desc" },
      take: 60,
    });

    // Aggregate by date: a day counts as "completed" if >= 50% habits done
    const logsByDate = new Map<string, { completed: number; total: number }>();
    for (const log of allLogs) {
      const key = getStartOfDay(log.date).toISOString();
      if (!logsByDate.has(key)) logsByDate.set(key, { completed: 0, total: 0 });
      const dayStats = logsByDate.get(key)!;
      dayStats.total++;
      if (log.completed) dayStats.completed++;
    }

    const streakLogs = Array.from(logsByDate.entries()).map(([date, stats]) => ({
      date: new Date(date),
      completed: stats.total > 0 && stats.completed / stats.total >= 0.5,
    }));

    const recentStreak = calcStreakFromLogs(streakLogs);

    const scores = calculateScores({
      entry: {
        sleepHours: entry.sleepHours ?? undefined,
        workoutCompleted: entry.workoutCompleted,
        workoutRoutineName: entry.workoutRoutineName ?? undefined,
        sportsTrainingMinutes: entry.sportsTrainingMinutes ?? undefined,
        steps: entry.steps ?? undefined,
        deepWorkHours: entry.deepWorkHours ?? undefined,
        screenTimeHours: entry.screenTimeHours ?? undefined,
        tasksPlanned: entry.tasksPlanned ?? undefined,
        tasksCompleted: entry.tasksCompleted ?? undefined,
        taskDifficultyRating: entry.taskDifficultyRating ?? undefined,
        moneySpent: entry.moneySpent ?? undefined,
        moneySaved: entry.moneySaved ?? undefined,
        incomeActivity: entry.incomeActivity ?? false,
        caloriesEaten: entry.caloriesEaten ?? undefined,
        overallDayRating: entry.overallDayRating ?? undefined,
      },
      habitCompletionRate,
      projectStats: { completedThisWeek, overdueCount, totalActive },
      recentStreak,
    });

    // Save or update category scores (no unique constraint, use findFirst pattern)
    const existingScore = await prisma.categoryScore.findFirst({
      where: { userId, date: entryDate },
    });

    let savedScores;
    if (existingScore) {
      savedScores = await prisma.categoryScore.update({
        where: { id: existingScore.id },
        data: {
          physical:   scores.physical,
          financial:  scores.financial,
          discipline: scores.discipline,
          focus:      scores.focus,
          mental:     scores.mental,
          appearance: scores.appearance,
          overall:    scores.overall,
          dailyEntryId: entry.id,
        },
      });
    } else {
      savedScores = await prisma.categoryScore.create({
        data: {
          userId,
          dailyEntryId: entry.id,
          date:       entryDate,
          physical:   scores.physical,
          financial:  scores.financial,
          discipline: scores.discipline,
          focus:      scores.focus,
          mental:     scores.mental,
          appearance: scores.appearance,
          overall:    scores.overall,
        },
      });
    }

    return NextResponse.json(
      { entry, scores: savedScores },
      { status: 201 }
    );
  } catch (error) {
    console.error("[daily-entries POST] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function calcStreakFromLogs(
  logs: { date: Date; completed: boolean }[]
): number {
  if (!logs.length) return 0;

  const sorted = [...logs].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const today = getStartOfDay(new Date()).getTime();
  let streak = 0;
  let cursor = today;

  for (const log of sorted) {
    const logDay = getStartOfDay(log.date).getTime();
    if (logDay === cursor) {
      if (log.completed) {
        streak++;
        cursor -= 86400000;
      } else {
        break;
      }
    } else if (logDay < cursor) {
      break;
    }
  }

  return streak;
}
