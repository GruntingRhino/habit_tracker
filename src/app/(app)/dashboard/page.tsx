import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Flame, Plus } from "lucide-react";
import { authOptions } from "@/lib/auth";

function getGreeting(name: string): string {
  const hour = new Date().getHours();
  const first = name.split(" ")[0];
  if (hour < 12) return `Good morning, ${first}`;
  if (hour < 17) return `Good afternoon, ${first}`;
  return `Good evening, ${first}`;
}
import prisma from "@/lib/prisma";
import { format } from "date-fns";
import DashboardTabs from "@/components/DashboardTabs";
import type { DashboardTabsProps } from "@/components/DashboardTabs";

function priorityRank(priority: string): number {
  switch (priority) {
    case "urgent": return 0;
    case "high":   return 1;
    case "medium": return 2;
    case "low":    return 3;
    default:       return 4;
  }
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Last 7 days window
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

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

  const latestScore  = recentScores[0] ?? null;
  const previousScore = recentScores[1] ?? null;

  // Latest + today entries
  const latestEntry = await prisma.dailyEntry.findFirst({
    where: { userId },
    orderBy: { date: "desc" },
  });
  const todayEntry = await prisma.dailyEntry.findFirst({
    where: { userId, date: today },
  });

  // Habit log date
  const habitLogDate = latestEntry ? new Date(latestEntry.date) : today;
  habitLogDate.setHours(0, 0, 0, 0);

  // All active habits with today's log
  const habits = await prisma.habit.findMany({
    where: { userId, isActive: true },
    include: { logs: { where: { date: habitLogDate } } },
    orderBy: { createdAt: "asc" },
  });

  // Projects
  const projects = await prisma.project.findMany({
    where: { userId, status: "active" },
    include: { tasks: { select: { id: true, status: true } } },
    orderBy: { createdAt: "asc" },
  });

  const sortedProjects = [...projects].sort((l, r) => {
    const pd = priorityRank(l.priority) - priorityRank(r.priority);
    if (pd !== 0) return pd;
    const ld = l.deadline ? new Date(l.deadline).getTime() : Infinity;
    const rd = r.deadline ? new Date(r.deadline).getTime() : Infinity;
    if (ld !== rd) return ld - rd;
    return new Date(l.createdAt).getTime() - new Date(r.createdAt).getTime();
  });

  // Streak
  const streakLogs = await prisma.habitLog.findMany({
    where: { habit: { userId }, completed: true },
    orderBy: { date: "desc" },
    take: 60,
  });
  const uniqueDays = new Set(
    streakLogs.map((l) => { const d = new Date(l.date); d.setHours(0,0,0,0); return d.getTime(); })
  );
  let streak = 0;
  let cursor = today.getTime();
  while (uniqueDays.has(cursor)) { streak++; cursor -= 86400000; }

  // Week at a glance
  const weekEntries = await prisma.dailyEntry.findMany({
    where: { userId, date: { gte: sevenDaysAgo, lte: today } },
    select: { deepWorkHours: true },
  });
  const weekEntriesLogged = weekEntries.length;
  const weekDeepWorkHours = weekEntries.reduce((sum, e) => sum + (e.deepWorkHours ?? 0), 0);

  const weekHabitLogs = await prisma.habitLog.findMany({
    where: {
      habit: { userId },
      date: { gte: sevenDaysAgo, lte: today },
    },
    select: { completed: true },
  });
  const weekHabitsCompleted = weekHabitLogs.filter((l) => l.completed).length;
  const weekHabitsTotal     = weekHabitLogs.length;

  // Coach insight
  const coachProfile = await prisma.coachProfile.findUnique({
    where: { userId },
    select: { summary: true },
  });
  const coachInsight = coachProfile?.summary ?? null;

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
    weekEntriesLogged,
    weekHabitsCompleted,
    weekHabitsTotal,
    weekDeepWorkHours: Math.round(weekDeepWorkHours * 10) / 10,
    coachInsight,
    userName: session.user.name ?? session.user.email ?? "there",
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 md:px-6 md:py-6">
      {/* Header */}
      <div className="mb-6 flex flex-col items-center justify-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
        <div className="min-w-0">
          <p className="mb-1 break-words text-xs font-medium uppercase tracking-[0.28em]" style={{ color: "#334d6e" }}>
            {dateLabel}
          </p>
          <h1
            className="text-[clamp(2.5rem,14vw,5rem)] font-light leading-none tracking-[-0.06em]"
            style={{ color: "#f8fbff", fontFamily: "var(--font-instrument-serif, serif)" }}
          >
            LiveImproved
          </h1>
          <p className="mt-1 text-sm" style={{ color: "#6b8cb8" }}>
            {getGreeting(tabsProps.userName)}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-end">
          {streak > 0 && (
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
              style={{ background: "rgba(251,146,60,0.08)", border: "1px solid rgba(251,146,60,0.2)" }}
            >
              <Flame className="w-4 h-4" style={{ color: "#fb923c" }} />
              <span className="text-sm font-semibold hidden sm:inline" style={{ color: "#fb923c" }}>
                {streak}-day streak
              </span>
              <span className="text-sm font-semibold sm:hidden" style={{ color: "#fb923c" }}>
                {streak}
              </span>
            </div>
          )}
          <Link
            href="/entry"
            className="flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-white"
            style={{ background: "var(--accent, #4f72ff)", boxShadow: "0 0 20px rgba(79,114,255,0.25)" }}
          >
            <Plus className="w-4 h-4" />
            {todayEntry ? "Open Daily Work" : "Start Daily Work"}
          </Link>
        </div>
      </div>

      <DashboardTabs {...tabsProps} />
    </div>
  );
}
