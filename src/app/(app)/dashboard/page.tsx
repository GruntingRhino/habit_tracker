import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Flame, Plus } from "lucide-react";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { format } from "date-fns";
import DashboardTabs from "@/components/DashboardTabs";
import type { DashboardTabsProps } from "@/components/DashboardTabs";

function priorityRank(priority: string): number {
  switch (priority) {
    case "urgent":
      return 0;
    case "high":
      return 1;
    case "medium":
      return 2;
    case "low":
      return 3;
    default:
      return 4;
  }
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Fetch last 2 category scores for trend
  const rawRecentScores = await prisma.categoryScore.findMany({
    where: { userId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 14,
  });

  const recentScores = Array.from(
    rawRecentScores.reduce((map, score) => {
      const key = score.date.toISOString().slice(0, 10);
      if (!map.has(key)) map.set(key, score);
      return map;
    }, new Map<string, (typeof rawRecentScores)[number]>()).values()
  ).slice(0, 2);

  const latestScore = recentScores[0] ?? null;
  const previousScore = recentScores[1] ?? null;

  // Fetch latest entry (not necessarily today's)
  const latestEntry = await prisma.dailyEntry.findFirst({
    where: { userId },
    orderBy: { date: "desc" },
  });

  // Check if today's entry exists (for button label)
  const todayEntry = await prisma.dailyEntry.findFirst({
    where: { userId, date: today },
  });

  // Determine the date to use for habit logs (latest entry date or today)
  const habitLogDate = latestEntry ? new Date(latestEntry.date) : today;
  habitLogDate.setHours(0, 0, 0, 0);

  // Fetch active habits with logs from the latest entry date
  const habits = await prisma.habit.findMany({
    where: { userId, isActive: true },
    include: {
      logs: {
        where: { date: habitLogDate },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 8,
  });

  // Fetch top 3 active projects with task counts
  const projects = await prisma.project.findMany({
    where: { userId, status: "active" },
    include: {
      tasks: { select: { id: true, status: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const sortedProjects = [...projects].sort((left, right) => {
    const priorityDelta = priorityRank(left.priority) - priorityRank(right.priority);
    if (priorityDelta !== 0) return priorityDelta;

    const leftDeadline = left.deadline ? new Date(left.deadline).getTime() : Number.POSITIVE_INFINITY;
    const rightDeadline = right.deadline ? new Date(right.deadline).getTime() : Number.POSITIVE_INFINITY;
    if (leftDeadline !== rightDeadline) return leftDeadline - rightDeadline;

    return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  });

  // Streak: count consecutive days with habit completions
  const streakLogs = await prisma.habitLog.findMany({
    where: {
      habit: { userId },
      completed: true,
    },
    orderBy: { date: "desc" },
    take: 60,
  });

  const uniqueDays = new Set(
    streakLogs.map((l) => {
      const d = new Date(l.date);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    })
  );

  let streak = 0;
  let cursor = today.getTime();
  while (uniqueDays.has(cursor)) {
    streak++;
    cursor -= 86400000;
  }

  const hasData = latestScore !== null;
  const dateLabel = format(new Date(), "EEEE · MMMM d, yyyy");

  const tabsProps: DashboardTabsProps = {
    dateLabel,
    streak,
    hasTodayEntry: !!todayEntry,
    hasData,
    scores: hasData
      ? [
          { key: "physical",   title: "Physical",   score: latestScore.physical   ?? 0, prevScore: previousScore?.physical   ?? undefined },
          { key: "financial",  title: "Financial",  score: latestScore.financial  ?? 0, prevScore: previousScore?.financial  ?? undefined },
          { key: "discipline", title: "Discipline", score: latestScore.discipline ?? 0, prevScore: previousScore?.discipline ?? undefined },
          { key: "focus",      title: "Focus",      score: latestScore.focus      ?? 0, prevScore: previousScore?.focus      ?? undefined },
          { key: "mental",     title: "Mental",     score: latestScore.mental     ?? 0, prevScore: previousScore?.mental     ?? undefined },
          { key: "overall",    title: "Overall",    score: latestScore.overall    ?? 0, prevScore: previousScore?.overall    ?? undefined },
        ]
      : [],
    latestScoreDate: latestScore ? latestScore.date.toISOString() : null,
    habits: habits.map((h) => ({
      id: h.id,
      name: h.name,
      category: h.category,
      color: h.color,
      completed: h.logs[0]?.completed === true,
    })),
    projects: sortedProjects.slice(0, 3).map((p) => ({
      id: p.id,
      title: p.title,
      priority: p.priority,
      totalTasks: p.tasks.length,
      doneTasks: p.tasks.filter((t) => t.status === "completed").length,
    })),
    entryNotes: latestEntry?.notes ?? null,
    entryDate: latestEntry ? latestEntry.date.toISOString() : null,
  };

  return (
    <div className="fade-in">
      {/* Header (Claude Design) */}
      <div className="flex items-end justify-between gap-4 mb-7">
        <div>
          <h1
            className="text-[48px] leading-none m-0"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 400,
              letterSpacing: "-0.025em",
              color: "var(--ink-100)",
            }}
          >
            LiveImproved
          </h1>
          <div
            className="text-xs uppercase mt-2"
            style={{
              letterSpacing: ".15em",
              color: "var(--ink-500)",
            }}
          >
            {dateLabel}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {streak > 0 && (
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
              style={{
                background: "rgba(255, 181, 71, .08)",
                border: "1px solid rgba(255, 181, 71, .2)",
              }}
            >
              <Flame className="w-4 h-4" style={{ color: "var(--cat-appearance)" }} />
              <span className="text-sm font-semibold" style={{ color: "var(--cat-appearance)" }}>
                {streak} day streak
              </span>
            </div>
          )}
          <Link
            href="/entry"
            className="btn-primary flex items-center gap-2 text-sm"
            style={{ padding: "14px 22px", borderRadius: "14px" }}
          >
            <Plus className="w-4 h-4" />
            {todayEntry ? "Log today" : "Log today"}
          </Link>
        </div>
      </div>

      <DashboardTabs {...tabsProps} />
    </div>
  );
}
