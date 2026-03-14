import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { calcStreak } from "@/lib/utils";
import { subDays } from "date-fns";

type TrendDirection = "improving" | "declining" | "stable";

function calcTrend(values: number[]): TrendDirection {
  if (values.length < 2) return "stable";

  const half = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, half);
  const secondHalf = values.slice(half);

  const avgFirst =
    firstHalf.reduce((s, v) => s + v, 0) / (firstHalf.length || 1);
  const avgSecond =
    secondHalf.reduce((s, v) => s + v, 0) / (secondHalf.length || 1);

  const delta = avgSecond - avgFirst;
  if (delta > 0.3) return "improving";
  if (delta < -0.3) return "declining";
  return "stable";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = session.user.id;
    const thirtyDaysAgo = subDays(new Date(), 30);
    const oneWeekAgo = subDays(new Date(), 7);

    // --- Last 30 days of category scores ---
    const categoryScores = await prisma.categoryScore.findMany({
      where: {
        userId,
        date: { gte: thirtyDaysAgo },
      },
      orderBy: { date: "asc" },
    });

    // --- Trend directions ---
    const trends: Record<string, TrendDirection> = {
      physical:   calcTrend(categoryScores.map((s) => s.physical)),
      financial:  calcTrend(categoryScores.map((s) => s.financial)),
      discipline: calcTrend(categoryScores.map((s) => s.discipline)),
      focus:      calcTrend(categoryScores.map((s) => s.focus)),
      mental:     calcTrend(categoryScores.map((s) => s.mental)),
      appearance: calcTrend(categoryScores.map((s) => s.appearance)),
      overall:    calcTrend(categoryScores.map((s) => s.overall)),
    };

    // --- Habits with completion rates and streaks ---
    const habits = await prisma.habit.findMany({
      where: { userId, isActive: true },
      include: {
        logs: {
          where: { date: { gte: thirtyDaysAgo } },
          orderBy: { date: "desc" },
        },
      },
    });

    const habitStats = habits.map((habit) => {
      const totalLogs = habit.logs.length;
      const completedLogs = habit.logs.filter((l) => l.completed).length;
      const completionRate =
        totalLogs > 0 ? completedLogs / totalLogs : 0;

      const streak = calcStreak(
        habit.logs.map((l) => ({ date: l.date, completed: l.completed }))
      );

      return {
        id: habit.id,
        name: habit.name,
        category: habit.category,
        color: habit.color,
        completionRate: Math.round(completionRate * 100) / 100,
        completedCount: completedLogs,
        totalCount: totalLogs,
        streak,
      };
    });

    // Group completion rates by category
    const categoryCompletionRates: Record<string, number> = {};
    const categoryGroups: Record<string, number[]> = {};
    for (const h of habitStats) {
      if (!categoryGroups[h.category]) categoryGroups[h.category] = [];
      categoryGroups[h.category].push(h.completionRate);
    }
    for (const [cat, rates] of Object.entries(categoryGroups)) {
      categoryCompletionRates[cat] =
        Math.round(
          (rates.reduce((s, r) => s + r, 0) / rates.length) * 100
        ) / 100;
    }

    // --- Project stats ---
    const [totalProjects, completedProjects, activeProjects] =
      await Promise.all([
        prisma.project.count({ where: { userId } }),
        prisma.project.count({ where: { userId, status: "completed" } }),
        prisma.project.count({ where: { userId, status: "active" } }),
      ]);

    const completedThisWeek = await prisma.project.count({
      where: {
        userId,
        status: "completed",
        completedAt: { gte: oneWeekAgo },
      },
    });

    const overdueCount = await prisma.project.count({
      where: {
        userId,
        status: { not: "completed" },
        deadline: { lt: new Date() },
      },
    });

    // Task completion stats across all projects
    const allTasks = await prisma.projectTask.findMany({
      where: { project: { userId } },
      select: { status: true },
    });
    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter((t) => t.status === "completed").length;
    const taskCompletionRate =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const projectStats = {
      total: totalProjects,
      completed: completedProjects,
      active: activeProjects,
      completedThisWeek,
      overdueCount,
      taskCompletionRate,
      totalTasks,
      completedTasks,
    };

    return NextResponse.json({
      categoryScores,
      trends,
      habitStats,
      categoryCompletionRates,
      projectStats,
    });
  } catch (error) {
    console.error("[analytics GET] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
