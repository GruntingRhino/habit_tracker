import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Star,
  ArrowRight,
  Flame,
  CheckCircle2,
  Circle,
  PlusCircle,
} from "lucide-react";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import EmptyState from "@/components/EmptyState";
import DashboardScores from "@/components/DashboardScores";
import { format } from "date-fns";
import type { ScoreData } from "@/components/DashboardScores";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Fetch last 2 category scores for trend
  const recentScores = await prisma.categoryScore.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take: 2,
  });

  const latestScore = recentScores[0] ?? null;
  const previousScore = recentScores[1] ?? null;

  // Fetch today's entry
  const todayEntry = await prisma.dailyEntry.findFirst({
    where: {
      userId,
      date: today,
    },
  });

  // Fetch active habits with today's logs
  const habits = await prisma.habit.findMany({
    where: { userId, isActive: true },
    include: {
      logs: {
        where: { date: today },
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

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-slate-400 text-sm">{dateLabel}</p>
          <h1 className="text-2xl font-bold text-slate-100 mt-0.5">
            Dashboard
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {streak > 0 && (
            <div className="flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-1.5">
              <Flame className="w-4 h-4 text-orange-400" />
              <span className="text-orange-400 text-sm font-semibold">
                {streak} day streak
              </span>
            </div>
          )}
          <Link
            href="/entry"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            {todayEntry ? "Update Entry" : "Log Today"}
          </Link>
        </div>
      </div>

      {!hasData ? (
        <EmptyState
          icon={Star}
          title="No data yet"
          description="Start tracking your habits and daily entries to see your performance scores here."
          ctaLabel="Log your first entry"
          ctaHref="/entry"
        />
      ) : (
        <>
          {/* Score Cards */}
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">
              Performance Scores
              <span className="text-slate-600 font-normal ml-2 normal-case">— click any score to see analysis</span>
            </h2>
            <DashboardScores
              scores={[
                { key: "physical",   title: "Physical",   score: latestScore.physical,   prevScore: previousScore?.physical },
                { key: "financial",  title: "Financial",  score: latestScore.financial,  prevScore: previousScore?.financial },
                { key: "discipline", title: "Discipline", score: latestScore.discipline, prevScore: previousScore?.discipline },
                { key: "focus",      title: "Focus",      score: latestScore.focus,      prevScore: previousScore?.focus },
                { key: "mental",     title: "Mental",     score: latestScore.mental,     prevScore: previousScore?.mental },
                { key: "appearance", title: "Appearance", score: latestScore.appearance, prevScore: previousScore?.appearance },
                { key: "overall",    title: "Overall",    score: latestScore.overall,    prevScore: previousScore?.overall },
              ] satisfies ScoreData[]}
            />
            <p className="text-slate-500 text-xs mt-2">
              Last updated:{" "}
              {format(new Date(latestScore.date), "MMM d, yyyy")}
            </p>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Today's Habits */}
            <section className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-slate-100">
                  Today&apos;s Habits
                </h2>
                <Link
                  href="/habits"
                  className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1"
                >
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              {habits.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-slate-500 text-sm">No habits yet</p>
                  <Link
                    href="/habits"
                    className="text-blue-400 text-sm hover:text-blue-300 mt-1 inline-block"
                  >
                    Add your first habit
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {habits.map((habit) => {
                    const completed = habit.logs[0]?.completed === true;
                    return (
                      <div
                        key={habit.id}
                        className="flex items-center gap-3 p-2.5 rounded-lg bg-[#0a0f1e]/50"
                      >
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: habit.color }}
                        />
                        {completed ? (
                          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 text-slate-600 flex-shrink-0" />
                        )}
                        <span
                          className={`text-sm flex-1 ${
                            completed
                              ? "text-slate-400 line-through"
                              : "text-slate-200"
                          }`}
                        >
                          {habit.name}
                        </span>
                        <span className="text-slate-600 text-xs capitalize">
                          {habit.category}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Active Projects */}
            <section className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-slate-100">
                  Active Projects
                </h2>
                <Link
                  href="/projects"
                  className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1"
                >
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              {projects.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-slate-500 text-sm">No active projects</p>
                  <Link
                    href="/projects"
                    className="text-blue-400 text-sm hover:text-blue-300 mt-1 inline-block"
                  >
                    Create a project
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {projects.map((project) => {
                    const total = project.tasks.length;
                    const done = project.tasks.filter(
                      (t) => t.status === "completed"
                    ).length;
                    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

                    const priorityColors: Record<string, string> = {
                      high: "text-red-400 bg-red-500/10",
                      medium: "text-yellow-400 bg-yellow-500/10",
                      low: "text-green-400 bg-green-500/10",
                    };
                    const priorityClass =
                      priorityColors[project.priority] ??
                      "text-slate-400 bg-slate-500/10";

                    return (
                      <Link
                        key={project.id}
                        href={`/projects/${project.id}`}
                        className="block p-3 rounded-lg bg-[#0a0f1e]/50 hover:bg-[#0a0f1e] transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="text-slate-100 text-sm font-medium line-clamp-1">
                            {project.title}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 capitalize ${priorityClass}`}
                          >
                            {project.priority}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-[#1e293b] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-slate-500 text-xs flex-shrink-0">
                            {done}/{total} tasks
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Quick insight from last entry */}
          {todayEntry?.notes && (
            <section className="mt-6 bg-[#0f172a] border border-[#1e293b] rounded-xl p-5">
              <h2 className="font-semibold text-slate-100 mb-3">
                Today&apos;s Notes
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                {todayEntry.notes}
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
