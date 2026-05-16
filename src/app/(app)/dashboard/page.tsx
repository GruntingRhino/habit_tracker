import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Flame, PlusCircle } from "lucide-react";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { format } from "date-fns";
import DashboardTabs from "@/components/DashboardTabs";
import type { DashboardTabsProps } from "@/components/DashboardTabs";

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
    orderBy: { createdAt: "desc" },
    take: 3,
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
  const dateLabel = format(new Date(), "EEEE, MMMM d, yyyy");

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
    projects: projects.map((p) => ({
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
    <div className="px-4 py-5 md:px-6 md:py-6 max-w-6xl mx-auto pb-20 lg:pb-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{
              fontFamily: "'Syne', sans-serif",
              background: "linear-gradient(135deg, #c8deff 0%, #93b8ff 60%, #7eb3ff 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            GoodHabits
          </h1>
          <p className="text-xs font-medium tracking-widest uppercase mt-1" style={{ color: "#334d6e" }}>
            {dateLabel}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {streak > 0 && (
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
              style={{
                background: "rgba(251, 146, 60, 0.08)",
                border: "1px solid rgba(251, 146, 60, 0.2)",
              }}
            >
              <Flame className="w-4 h-4" style={{ color: "#fb923c" }} />
              <span className="text-sm font-semibold" style={{ color: "#fb923c" }}>
                {streak} day streak
              </span>
            </div>
          )}
          <Link
            href="/entry"
            className="btn-primary-glow flex items-center gap-2 text-white text-sm font-semibold px-4 py-2 rounded-lg"
          >
            <PlusCircle className="w-4 h-4" />
            {todayEntry ? "Update Entry" : "Log Today"}
          </Link>
        </div>
      </div>

      <DashboardTabs {...tabsProps} />
    </div>
  );
}
