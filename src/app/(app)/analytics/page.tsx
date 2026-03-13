"use client";

import { useState, useEffect, useCallback } from "react";
import {
  LineChart,
  Line,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Activity,
  Brain,
  RefreshCw,
  DollarSign,
  ClipboardCheck,
  Star,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
} from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import { type LucideIcon } from "lucide-react";

interface CategoryScore {
  id: string;
  date: string;
  physical: number;
  focus: number;
  consistency: number;
  financial: number;
  responsibility: number;
  overall: number;
}

interface HabitStat {
  id: string;
  name: string;
  category: string;
  color: string;
  completionRate: number;
  completedCount: number;
  totalCount: number;
  streak: number;
}

interface ProjectStats {
  total: number;
  completed: number;
  active: number;
  completedThisWeek: number;
  overdueCount: number;
  taskCompletionRate: number;
  totalTasks: number;
  completedTasks: number;
}

interface Trends {
  physical: string;
  focus: string;
  consistency: string;
  financial: string;
  responsibility: string;
  overall: string;
}

interface AnalyticsData {
  categoryScores: CategoryScore[];
  trends: Trends;
  habitStats: HabitStat[];
  categoryCompletionRates: Record<string, number>;
  projectStats: ProjectStats;
}

const SCORE_META: {
  key: keyof Omit<CategoryScore, "id" | "date">;
  label: string;
  color: string;
  icon: LucideIcon;
}[] = [
  { key: "physical", label: "Physical", color: "#22c55e", icon: Activity },
  { key: "focus", label: "Focus", color: "#3b82f6", icon: Brain },
  { key: "consistency", label: "Consistency", color: "#f59e0b", icon: RefreshCw },
  { key: "financial", label: "Financial", color: "#8b5cf6", icon: DollarSign },
  { key: "responsibility", label: "Responsibility", color: "#ec4899", icon: ClipboardCheck },
  { key: "overall", label: "Overall", color: "#14b8a6", icon: Star },
];

const PIE_COLORS = ["#3b82f6", "#1e293b", "#ef4444"];

function TrendBadge({ trend }: { trend: string }) {
  if (trend === "improving") {
    return (
      <span className="flex items-center gap-1 text-green-400 text-xs">
        <TrendingUp className="w-3.5 h-3.5" />
        Improving
      </span>
    );
  }
  if (trend === "declining") {
    return (
      <span className="flex items-center gap-1 text-red-400 text-xs">
        <TrendingDown className="w-3.5 h-3.5" />
        Declining
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-slate-400 text-xs">
      <Minus className="w-3.5 h-3.5" />
      Stable
    </span>
  );
}

function getScoreColor(score: number): string {
  if (score > 7) return "text-green-400";
  if (score >= 5) return "text-yellow-400";
  return "text-red-400";
}

interface CustomLineTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function CustomLineTooltip({ active, payload, label }: CustomLineTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0f172a] border border-[#1e293b] rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-2 font-medium">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 mb-0.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: p.color }}
          />
          <span className="text-slate-400 capitalize">{p.name}:</span>
          <span className="text-slate-100 font-semibold">
            {p.value.toFixed(1)}
          </span>
        </div>
      ))}
    </div>
  );
}

interface CustomBarTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function CustomBarTooltip({ active, payload, label }: CustomBarTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0f172a] border border-[#1e293b] rounded-lg px-3 py-2 text-xs">
      <p className="text-slate-400 mb-1">{label}</p>
      <p className="text-blue-400 font-semibold">
        {Math.round(payload[0].value * 100)}% completion
      </p>
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await fetch("/api/analytics", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load analytics");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <EmptyState
          icon={BarChart3}
          title="No analytics data"
          description="Start logging daily entries to see your performance analytics."
          ctaLabel="Log your first entry"
          ctaHref="/entry"
        />
      </div>
    );
  }

  const { categoryScores, trends, habitStats, projectStats } = data;

  // Prepare line chart data
  const lineData = categoryScores.map((s) => ({
    date: new Date(s.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    physical: s.physical,
    focus: s.focus,
    consistency: s.consistency,
    financial: s.financial,
    responsibility: s.responsibility,
    overall: s.overall,
  }));

  // Radar chart data: current week averages
  const radarData = SCORE_META.map(({ key, label }) => {
    const last7 = categoryScores.slice(-7);
    const avg =
      last7.length > 0
        ? last7.reduce((sum, s) => sum + s[key], 0) / last7.length
        : 0;
    return { subject: label, value: Math.round(avg * 10) / 10, fullMark: 10 };
  });

  // Habit completion bar chart
  const habitBarData = habitStats.map((h) => ({
    name: h.name.length > 12 ? h.name.slice(0, 12) + "…" : h.name,
    rate: Math.round(h.completionRate * 100) / 100,
    color: h.color,
  }));

  // Project pie chart
  const pieData = [
    { name: "Completed", value: projectStats.completed },
    { name: "Active", value: projectStats.active },
    { name: "Overdue", value: projectStats.overdueCount },
  ].filter((d) => d.value > 0);

  // Latest scores for cards
  const latest = categoryScores[categoryScores.length - 1];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Analytics</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Last 30 days performance overview
        </p>
      </div>

      {/* Score cards with trends */}
      {latest && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">
            Current Scores
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {SCORE_META.map(({ key, label, color, icon: Icon }) => {
              const score = latest[key];
              const trend = trends[key as keyof Trends];
              return (
                <div
                  key={key}
                  className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 text-center"
                >
                  <div className="flex items-center justify-center mb-2">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: color + "20" }}
                    >
                      <Icon
                        className="w-3.5 h-3.5"
                        style={{ color }}
                      />
                    </div>
                  </div>
                  <p
                    className={`text-2xl font-bold mb-0.5 ${getScoreColor(score)}`}
                  >
                    {score.toFixed(1)}
                  </p>
                  <p className="text-slate-500 text-xs mb-1">{label}</p>
                  <TrendBadge trend={trend} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Line chart */}
      {lineData.length > 1 && (
        <section className="mb-6">
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5">
            <h2 className="font-semibold text-slate-100 mb-4">
              Score Trends (Last 30 Days)
            </h2>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart
                data={lineData}
                margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#1e293b"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#475569", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 10]}
                  tick={{ fill: "#475569", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<CustomLineTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: "11px", color: "#94a3b8" }}
                />
                {SCORE_META.map(({ key, color }) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Radar chart */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5">
          <h2 className="font-semibold text-slate-100 mb-4">
            This Week&apos;s Radar
          </h2>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
              <PolarGrid stroke="#1e293b" />
              <PolarAngleAxis
                dataKey="subject"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
              />
              <Radar
                name="Score"
                dataKey="value"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.2}
                strokeWidth={2}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  border: "1px solid #1e293b",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "#f1f5f9",
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Habit completion bar chart */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5">
          <h2 className="font-semibold text-slate-100 mb-4">
            Habit Completion Rates
          </h2>
          {habitBarData.length === 0 ? (
            <div className="flex items-center justify-center h-48">
              <p className="text-slate-500 text-sm">No habits yet</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={habitBarData}
                layout="vertical"
                margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#1e293b"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  domain={[0, 1]}
                  tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                  tick={{ fill: "#475569", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={80}
                />
                <Tooltip content={<CustomBarTooltip />} />
                <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                  {habitBarData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Project pie chart */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5">
          <h2 className="font-semibold text-slate-100 mb-4">
            Project Status
          </h2>
          {pieData.length === 0 ? (
            <div className="flex items-center justify-center h-48">
              <p className="text-slate-500 text-sm">No projects yet</p>
            </div>
          ) : (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {pieData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      border: "1px solid #1e293b",
                      borderRadius: "8px",
                      fontSize: "12px",
                      color: "#f1f5f9",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-3">
                {pieData.map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor:
                          PIE_COLORS[index % PIE_COLORS.length],
                      }}
                    />
                    <span className="text-slate-400 text-sm">{entry.name}</span>
                    <span className="text-slate-100 font-semibold text-sm ml-auto">
                      {entry.value}
                    </span>
                  </div>
                ))}
                <div className="pt-2 border-t border-[#1e293b]">
                  <p className="text-slate-500 text-xs">
                    {projectStats.taskCompletionRate}% task completion rate
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Insights card */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5">
          <h2 className="font-semibold text-slate-100 mb-4">Insights</h2>
          <div className="space-y-3">
            {/* Top performing habit */}
            {habitStats.length > 0 && (() => {
              const top = [...habitStats].sort(
                (a, b) => b.completionRate - a.completionRate
              )[0];
              return (
                <div className="flex gap-3 p-3 bg-green-500/5 border border-green-500/10 rounded-lg">
                  <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-base">🏆</span>
                  </div>
                  <div>
                    <p className="text-slate-300 text-sm font-medium">
                      Best Habit
                    </p>
                    <p className="text-slate-400 text-xs">
                      <span className="text-slate-200">{top.name}</span> —{" "}
                      {Math.round(top.completionRate * 100)}% completion rate
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* Project progress */}
            <div className="flex gap-3 p-3 bg-blue-500/5 border border-blue-500/10 rounded-lg">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <span className="text-base">📊</span>
              </div>
              <div>
                <p className="text-slate-300 text-sm font-medium">
                  Project Tasks
                </p>
                <p className="text-slate-400 text-xs">
                  {projectStats.completedTasks} of {projectStats.totalTasks}{" "}
                  tasks completed ({projectStats.taskCompletionRate}%)
                </p>
              </div>
            </div>

            {/* Score trend */}
            {latest && (
              <div className="flex gap-3 p-3 bg-purple-500/5 border border-purple-500/10 rounded-lg">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-base">📈</span>
                </div>
                <div>
                  <p className="text-slate-300 text-sm font-medium">
                    Overall Score
                  </p>
                  <p className="text-slate-400 text-xs">
                    Current overall:{" "}
                    <span
                      className={`font-semibold ${getScoreColor(latest.overall)}`}
                    >
                      {latest.overall.toFixed(1)}/10
                    </span>{" "}
                    — {trends.overall}
                  </p>
                </div>
              </div>
            )}

            {/* Overdue warning */}
            {projectStats.overdueCount > 0 && (
              <div className="flex gap-3 p-3 bg-red-500/5 border border-red-500/10 rounded-lg">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-base">⚠️</span>
                </div>
                <div>
                  <p className="text-slate-300 text-sm font-medium">
                    Overdue Projects
                  </p>
                  <p className="text-slate-400 text-xs">
                    {projectStats.overdueCount} project
                    {projectStats.overdueCount !== 1 ? "s" : ""} past deadline
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
