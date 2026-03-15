"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  BarChart3,
  LayoutDashboard,
  Dumbbell,
  Activity,
  Brain,
  RefreshCw,
  DollarSign,
  ClipboardCheck,
  Star,
  TrendingUp,
  TrendingDown,
  Minus,
  Utensils,
} from "lucide-react";
import {
  LineChart,
  Line,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
} from "recharts";
import DashboardScores from "@/components/DashboardScores";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import type { ScoreData } from "@/components/DashboardScores";
import { type LucideIcon } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DashboardHabit {
  id: string;
  name: string;
  category: string;
  color: string;
  completed: boolean;
}

export interface DashboardProject {
  id: string;
  title: string;
  priority: string;
  totalTasks: number;
  doneTasks: number;
}

export interface DashboardScore {
  key: string;
  title: string;
  score: number;
  prevScore?: number;
}

export interface DashboardTabsProps {
  dateLabel: string;
  streak: number;
  hasTodayEntry: boolean;
  hasData: boolean;
  scores: DashboardScore[];
  latestScoreDate: string | null;
  habits: DashboardHabit[];
  projects: DashboardProject[];
  entryNotes: string | null;
  entryDate: string | null;
}

// ── Analytics types (mirrored from analytics page) ───────────────────────────

interface CategoryScore {
  id: string;
  date: string;
  physical: number;
  financial: number;
  discipline: number;
  focus: number;
  mental: number;
  appearance: number;
  overall: number;
}

interface HabitStat {
  id: string;
  name: string;
  category: string;
  color: string;
  completionRate: number;
}

interface ProjectStats {
  total: number;
  completed: number;
  active: number;
  overdueCount: number;
  taskCompletionRate: number;
  totalTasks: number;
  completedTasks: number;
}

interface Trends {
  physical: string;
  financial: string;
  discipline: string;
  focus: string;
  mental: string;
  appearance: string;
  overall: string;
}

interface AnalyticsData {
  categoryScores: CategoryScore[];
  trends: Trends;
  habitStats: HabitStat[];
  projectStats: ProjectStats;
}

interface ProgressionEntry {
  date: string;
  weight: number | null;
  sets: number | null;
  reps: string | null;
  routineName: string;
}
interface ExerciseProgression {
  exerciseName: string;
  entries: ProgressionEntry[];
}

// ── Analytics meta ────────────────────────────────────────────────────────────

const SCORE_META: {
  key: keyof Omit<CategoryScore, "id" | "date">;
  label: string;
  color: string;
  icon: LucideIcon;
}[] = [
  { key: "physical",   label: "Physical",   color: "#22c55e", icon: Activity },
  { key: "financial",  label: "Financial",  color: "#8b5cf6", icon: DollarSign },
  { key: "discipline", label: "Discipline", color: "#f59e0b", icon: RefreshCw },
  { key: "focus",      label: "Focus",      color: "#3b82f6", icon: Brain },
  { key: "mental",     label: "Mental",     color: "#a78bfa", icon: ClipboardCheck },
  { key: "appearance", label: "Appearance", color: "#ec4899", icon: Star },
  { key: "overall",    label: "Overall",    color: "#14b8a6", icon: BarChart3 },
];

const PIE_COLORS = ["#3b82f6", "#1e293b", "#ef4444"];

// ── Small shared components ───────────────────────────────────────────────────

function TrendBadge({ trend }: { trend: string }) {
  if (trend === "improving")
    return <span className="flex items-center gap-1 text-green-400 text-xs"><TrendingUp className="w-3.5 h-3.5" />Improving</span>;
  if (trend === "declining")
    return <span className="flex items-center gap-1 text-red-400 text-xs"><TrendingDown className="w-3.5 h-3.5" />Declining</span>;
  return <span className="flex items-center gap-1 text-xs" style={{ color: "#334d6e" }}><Minus className="w-3.5 h-3.5" />Stable</span>;
}

function getScoreColor(score: number) {
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
    <div className="rounded-lg px-3 py-2 text-xs shadow-xl" style={{ background: "#0c1830", border: "1px solid rgba(40,76,140,0.3)" }}>
      <p className="mb-2 font-medium" style={{ color: "#6b8cb8" }}>{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="capitalize" style={{ color: "#4a6a90" }}>{p.name}:</span>
          <span className="font-semibold" style={{ color: "#c8deff" }}>{p.value.toFixed(1)}</span>
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
    <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "#0c1830", border: "1px solid rgba(40,76,140,0.3)" }}>
      <p className="mb-1" style={{ color: "#6b8cb8" }}>{label}</p>
      <p className="text-blue-400 font-semibold">{Math.round(payload[0].value * 100)}% completion</p>
    </div>
  );
}

interface ProgressionTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: { date: string; sets: number | null; reps: string | null } }>;
}
function ProgressionTooltip({ active, payload }: ProgressionTooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-lg px-3 py-2 text-xs shadow-xl" style={{ background: "#0c1830", border: "1px solid rgba(40,76,140,0.3)" }}>
      <p className="mb-1" style={{ color: "#6b8cb8" }}>{new Date(p.payload.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
      <p className="text-blue-400 font-semibold">{p.value} lbs</p>
      {p.payload.sets && p.payload.reps && <p style={{ color: "#2d4a6a" }}>{p.payload.sets}×{p.payload.reps}</p>}
    </div>
  );
}

// ── Analytics tab ─────────────────────────────────────────────────────────────

function AnalyticsTab() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><LoadingSpinner size="lg" /></div>;
  if (!data) return <EmptyState icon={BarChart3} title="No analytics data" description="Start logging daily entries to see analytics." ctaLabel="Log entry" ctaHref="/entry" />;

  const { categoryScores, trends, habitStats, projectStats } = data;
  const lineData = categoryScores.map((s) => ({
    date: new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    physical: s.physical, financial: s.financial, discipline: s.discipline,
    focus: s.focus, mental: s.mental, appearance: s.appearance, overall: s.overall,
  }));
  const radarData = SCORE_META.filter((m) => m.key !== "overall").map(({ key, label }) => {
    const last7 = categoryScores.slice(-7);
    const avg = last7.length > 0 ? last7.reduce((sum, s) => sum + s[key], 0) / last7.length : 0;
    return { subject: label, value: Math.round(avg * 10) / 10, fullMark: 10 };
  });
  const habitBarData = habitStats.map((h) => ({
    name: h.name.length > 12 ? h.name.slice(0, 12) + "…" : h.name,
    rate: Math.round(h.completionRate * 100) / 100,
    color: h.color,
  }));
  const pieData = [
    { name: "Completed", value: projectStats.completed },
    { name: "Active", value: projectStats.active },
    { name: "Overdue", value: projectStats.overdueCount },
  ].filter((d) => d.value > 0);
  const latest = categoryScores[categoryScores.length - 1];

  return (
    <div>
      {/* Score cards */}
      {latest && (
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "#3d5a7a", fontFamily: "'Syne', sans-serif" }}>Current Scores</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {SCORE_META.map(({ key, label, color, icon: Icon }) => {
              const score = latest[key];
              const trend = trends[key as keyof Trends];
              return (
                <div key={key} className="rounded-xl p-4 text-center" style={{ background: "linear-gradient(135deg, #0c1830 0%, #091222 100%)", border: "1px solid rgba(40,76,140,0.22)" }}>
                  <div className="flex items-center justify-center mb-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + "20" }}>
                      <Icon className="w-3.5 h-3.5" style={{ color }} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold mb-0.5" style={{ color: getScoreColor(score), fontFamily: "'Syne', sans-serif" }}>{score.toFixed(1)}</p>
                  <p className="text-xs mb-1" style={{ color: "#2d4a6a" }}>{label}</p>
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
          <div className="rounded-xl p-5" style={{ background: "linear-gradient(135deg, #0c1830 0%, #091222 100%)", border: "1px solid rgba(40,76,140,0.22)" }}>
            <h2 className="font-semibold mb-4" style={{ color: "#c8deff", fontFamily: "'Syne', sans-serif" }}>Score Trends (Last 30 Days)</h2>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={lineData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,60,110,0.4)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#2d4a6a", fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis domain={[0, 10]} tick={{ fill: "#2d4a6a", fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomLineTooltip />} />
                <Legend wrapperStyle={{ fontSize: "11px", color: "#4a6a90" }} />
                {SCORE_META.map(({ key, color }) => (
                  <Line key={key} type="monotone" dataKey={key} stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Radar */}
        <div className="rounded-xl p-5" style={{ background: "linear-gradient(135deg, #0c1830 0%, #091222 100%)", border: "1px solid rgba(40,76,140,0.22)" }}>
          <h2 className="font-semibold mb-4" style={{ color: "#c8deff", fontFamily: "'Syne', sans-serif" }}>This Week&apos;s Radar</h2>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
              <PolarGrid stroke="rgba(30,60,110,0.5)" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: "#4a6a90", fontSize: 11 }} />
              <Radar name="Score" dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} strokeWidth={2} />
              <Tooltip contentStyle={{ backgroundColor: "#0c1830", border: "1px solid rgba(40,76,140,0.3)", borderRadius: "8px", fontSize: "12px", color: "#c8deff" }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Habit bar */}
        <div className="rounded-xl p-5" style={{ background: "linear-gradient(135deg, #0c1830 0%, #091222 100%)", border: "1px solid rgba(40,76,140,0.22)" }}>
          <h2 className="font-semibold mb-4" style={{ color: "#c8deff", fontFamily: "'Syne', sans-serif" }}>Habit Completion Rates</h2>
          {habitBarData.length === 0 ? (
            <div className="flex items-center justify-center h-48"><p className="text-sm" style={{ color: "#2d4a6a" }}>No habits yet</p></div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={habitBarData} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,60,110,0.4)" horizontal={false} />
                <XAxis type="number" domain={[0, 1]} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} tick={{ fill: "#2d4a6a", fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#4a6a90", fontSize: 11 }} tickLine={false} axisLine={false} width={80} />
                <Tooltip content={<CustomBarTooltip />} />
                <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                  {habitBarData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Project pie */}
        <div className="rounded-xl p-5" style={{ background: "linear-gradient(135deg, #0c1830 0%, #091222 100%)", border: "1px solid rgba(40,76,140,0.22)" }}>
          <h2 className="font-semibold mb-4" style={{ color: "#c8deff", fontFamily: "'Syne', sans-serif" }}>Project Status</h2>
          {pieData.length === 0 ? (
            <div className="flex items-center justify-center h-48"><p className="text-sm" style={{ color: "#2d4a6a" }}>No projects yet</p></div>
          ) : (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" strokeWidth={0}>
                    {pieData.map((_, index) => <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "#0c1830", border: "1px solid rgba(40,76,140,0.3)", borderRadius: "8px", fontSize: "12px", color: "#c8deff" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-3">
                {pieData.map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                    <span className="text-sm" style={{ color: "#4a6a90" }}>{entry.name}</span>
                    <span className="font-semibold text-sm ml-auto" style={{ color: "#c8deff" }}>{entry.value}</span>
                  </div>
                ))}
                <div className="pt-2" style={{ borderTop: "1px solid rgba(30,60,110,0.4)" }}>
                  <p className="text-xs" style={{ color: "#2d4a6a" }}>{projectStats.taskCompletionRate}% task completion rate</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Insights */}
        <div className="rounded-xl p-5" style={{ background: "linear-gradient(135deg, #0c1830 0%, #091222 100%)", border: "1px solid rgba(40,76,140,0.22)" }}>
          <h2 className="font-semibold mb-4" style={{ color: "#c8deff", fontFamily: "'Syne', sans-serif" }}>Insights</h2>
          <div className="space-y-3">
            {habitStats.length > 0 && (() => {
              const top = [...habitStats].sort((a, b) => b.completionRate - a.completionRate)[0];
              return (
                <div className="flex gap-3 p-3 rounded-lg" style={{ background: "rgba(16,217,160,0.05)", border: "1px solid rgba(16,217,160,0.12)" }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(16,217,160,0.1)" }}><span className="text-base">🏆</span></div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: "#8aadcc" }}>Best Habit</p>
                    <p className="text-xs" style={{ color: "#4a6a90" }}><span style={{ color: "#c8deff" }}>{top.name}</span> — {Math.round(top.completionRate * 100)}% completion</p>
                  </div>
                </div>
              );
            })()}
            <div className="flex gap-3 p-3 rounded-lg" style={{ background: "rgba(79,114,255,0.05)", border: "1px solid rgba(79,114,255,0.12)" }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(79,114,255,0.1)" }}><span className="text-base">📊</span></div>
              <div>
                <p className="text-sm font-medium" style={{ color: "#8aadcc" }}>Project Tasks</p>
                <p className="text-xs" style={{ color: "#4a6a90" }}>{projectStats.completedTasks} of {projectStats.totalTasks} tasks completed ({projectStats.taskCompletionRate}%)</p>
              </div>
            </div>
            {latest && (
              <div className="flex gap-3 p-3 rounded-lg" style={{ background: "rgba(167,139,250,0.05)", border: "1px solid rgba(167,139,250,0.12)" }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(167,139,250,0.1)" }}><span className="text-base">📈</span></div>
                <div>
                  <p className="text-sm font-medium" style={{ color: "#8aadcc" }}>Overall Score</p>
                  <p className="text-xs" style={{ color: "#4a6a90" }}>Current: <span className="font-semibold" style={{ color: getScoreColor(latest.overall) }}>{latest.overall.toFixed(1)}/10</span> — {trends.overall}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Progression tab ───────────────────────────────────────────────────────────

function ProgressionTab() {
  const [progressions, setProgressions] = useState<ExerciseProgression[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/weights/progression", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => { setProgressions(data); if (data.length > 0) setSelectedExercise(data[0].exerciseName); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-48"><LoadingSpinner size="lg" /></div>;
  if (progressions.length === 0) return <EmptyState icon={Dumbbell} title="No progression data yet" description="Log workouts with weights in the Routines tab to track progression." ctaLabel="Go to Routines" ctaHref="/weights" />;

  const current = progressions.find((p) => p.exerciseName === selectedExercise);
  const chartData = current?.entries.filter((e) => e.weight !== null).map((e) => ({
    date: e.date,
    dateLabel: new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    weight: e.weight!,
    sets: e.sets,
    reps: e.reps,
  })) ?? [];
  const maxWeight = chartData.length ? Math.max(...chartData.map((d) => d.weight)) : 0;
  const minWeight = chartData.length ? Math.min(...chartData.map((d) => d.weight)) : 0;
  const firstWeight = chartData[0]?.weight ?? 0;
  const lastWeight = chartData[chartData.length - 1]?.weight ?? 0;
  const change = lastWeight - firstWeight;

  return (
    <div className="flex gap-6">
      <div className="w-52 flex-shrink-0">
        <p className="text-xs uppercase tracking-widest font-medium mb-3" style={{ color: "#2d4a6a", fontFamily: "'Syne', sans-serif" }}>Exercises</p>
        <div className="space-y-1">
          {progressions.map((p) => (
            <button key={p.exerciseName} onClick={() => setSelectedExercise(p.exerciseName)}
              className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-150"
              style={selectedExercise === p.exerciseName
                ? { background: "linear-gradient(135deg, rgba(79,114,255,0.18) 0%, rgba(79,114,255,0.06) 100%)", border: "1px solid rgba(79,114,255,0.28)", color: "#a8c4ff" }
                : { border: "1px solid transparent", color: "#4a6a90" }}
              onMouseEnter={(e) => { if (selectedExercise !== p.exerciseName) { (e.currentTarget as HTMLElement).style.background = "rgba(18,36,66,0.7)"; (e.currentTarget as HTMLElement).style.color = "#c8deff"; } }}
              onMouseLeave={(e) => { if (selectedExercise !== p.exerciseName) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#4a6a90"; } }}>
              <p className="font-medium truncate">{p.exerciseName}</p>
              <p className="text-xs mt-0.5" style={{ color: "#1e3050" }}>{p.entries.filter((e) => e.weight).length} sessions</p>
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        {current && chartData.length > 0 ? (
          <>
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="rounded-xl p-3 text-center" style={{ background: "linear-gradient(135deg, #0c1830 0%, #091222 100%)", border: "1px solid rgba(40,76,140,0.22)" }}>
                <p className="text-xl font-bold" style={{ color: "#c8deff", fontFamily: "'Syne', sans-serif" }}>{lastWeight}</p>
                <p className="text-xs mt-0.5" style={{ color: "#2d4a6a" }}>Latest (lbs)</p>
              </div>
              <div className="rounded-xl p-3 text-center" style={{ background: "linear-gradient(135deg, #0c1830 0%, #091222 100%)", border: "1px solid rgba(40,76,140,0.22)" }}>
                <p className="text-xl font-bold" style={{ color: "#c8deff", fontFamily: "'Syne', sans-serif" }}>{maxWeight}</p>
                <p className="text-xs mt-0.5" style={{ color: "#2d4a6a" }}>All-time Max</p>
              </div>
              <div className="rounded-xl p-3 text-center" style={{ background: "linear-gradient(135deg, #0c1830 0%, #091222 100%)", border: "1px solid rgba(40,76,140,0.22)" }}>
                <p className="text-xl font-bold" style={{ color: change > 0 ? "#10d9a0" : change < 0 ? "#ff4d6a" : "#4a6a90", fontFamily: "'Syne', sans-serif" }}>{change > 0 ? "+" : ""}{change}</p>
                <p className="text-xs mt-0.5" style={{ color: "#2d4a6a" }}>Total Change</p>
              </div>
            </div>
            <div className="rounded-xl p-5" style={{ background: "linear-gradient(135deg, #0c1830 0%, #091222 100%)", border: "1px solid rgba(40,76,140,0.22)" }}>
              <h3 className="text-sm font-semibold mb-4" style={{ color: "#c8deff", fontFamily: "'Syne', sans-serif" }}>{current.exerciseName} — Weight Progression</h3>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,60,110,0.4)" vertical={false} />
                  <XAxis dataKey="dateLabel" tick={{ fill: "#2d4a6a", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis domain={[Math.max(0, minWeight - 10), maxWeight + 10]} tick={{ fill: "#2d4a6a", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ProgressionTooltip />} />
                  <Line type="monotone" dataKey="weight" stroke="#4f72ff" strokeWidth={2.5} dot={{ fill: "#4f72ff", r: 4, strokeWidth: 0 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 rounded-xl overflow-hidden" style={{ background: "linear-gradient(135deg, #0c1830 0%, #091222 100%)", border: "1px solid rgba(40,76,140,0.22)" }}>
              <div className="grid grid-cols-4 px-4 py-2 text-xs uppercase tracking-widest font-medium" style={{ borderBottom: "1px solid rgba(30,60,110,0.4)", color: "#2d4a6a" }}>
                <span>Date</span><span>Weight</span><span>Sets × Reps</span><span>Routine</span>
              </div>
              <div className="max-h-48 overflow-y-auto" style={{ borderColor: "rgba(30,60,110,0.3)" }}>
                {[...chartData].reverse().map((d, i) => {
                  const entry = current.entries.find((e) => e.date === d.date);
                  return (
                    <div key={i} className="grid grid-cols-4 px-4 py-2.5 text-xs" style={{ borderBottom: "1px solid rgba(20,40,75,0.5)" }}>
                      <span style={{ color: "#4a6a90" }}>{new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                      <span className="font-semibold" style={{ color: "#4f72ff" }}>{d.weight} lbs</span>
                      <span style={{ color: "#2d4a6a" }}>{d.sets && d.reps ? `${d.sets}×${d.reps}` : "—"}</span>
                      <span className="truncate" style={{ color: "#1e3050" }}>{entry?.routineName ?? "—"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <p className="text-sm" style={{ color: "#4a6a90" }}>No weight data for this exercise</p>
            <p className="text-xs mt-1" style={{ color: "#1e3050" }}>Log workouts with weight to see progression</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main DashboardTabs component ──────────────────────────────────────────────

type Tab = "dashboard" | "analytics" | "progression";

export default function DashboardTabs(props: DashboardTabsProps) {
  const {
    hasData, scores, latestScoreDate, habits, projects,
    entryNotes, entryDate,
  } = props;

  const [tab, setTab] = useState<Tab>("dashboard");

  const tabBtn = useCallback((id: Tab, label: string, Icon: LucideIcon) => (
    <button
      onClick={() => setTab(id)}
      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150"
      style={
        tab === id
          ? {
              background: "linear-gradient(135deg, rgba(79,114,255,0.22) 0%, rgba(79,114,255,0.1) 100%)",
              border: "1px solid rgba(79,114,255,0.35)",
              color: "#a8c4ff",
              boxShadow: "0 0 12px rgba(79,114,255,0.15)",
            }
          : {
              border: "1px solid transparent",
              color: "#3d5a7a",
            }
      }
      onMouseEnter={(e) => {
        if (tab !== id) (e.currentTarget as HTMLElement).style.color = "#6b8cb8";
      }}
      onMouseLeave={(e) => {
        if (tab !== id) (e.currentTarget as HTMLElement).style.color = "#3d5a7a";
      }}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  ), [tab]);

  return (
    <>
      {/* Tab nav */}
      <div
        className="flex gap-1 rounded-xl p-1 mb-6 w-fit"
        style={{
          background: "linear-gradient(135deg, rgba(9,18,34,0.95) 0%, rgba(6,13,28,0.9) 100%)",
          border: "1px solid rgba(40,76,140,0.25)",
        }}
      >
        {tabBtn("dashboard", "Dashboard", LayoutDashboard)}
        {tabBtn("analytics", "Analytics", BarChart3)}
        {tabBtn("progression", "Progression", Dumbbell)}
      </div>

      {/* Dashboard tab */}
      {tab === "dashboard" && (
        <>
          {!hasData ? (
            <EmptyState
              icon={Star}
              title="No data yet"
              description="Start tracking habits and daily entries to see your performance scores."
              ctaLabel="Log your first entry"
              ctaHref="/entry"
            />
          ) : (
            <>
              {/* Score Cards */}
              <section className="mb-8">
                <h2 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "#3d5a7a", fontFamily: "'Syne', sans-serif" }}>
                  Performance Scores
                  <span className="font-normal ml-2 normal-case" style={{ color: "#27415e" }}>— click any score to see analysis</span>
                </h2>
                <DashboardScores scores={scores as ScoreData[]} />
                {latestScoreDate && (
                  <p className="text-xs mt-2" style={{ color: "#2d4a6a" }}>
                    Last entry: {new Date(latestScoreDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                )}
              </section>

              {/* Quick access */}
              <div className="flex gap-3 mb-6">
                <Link
                  href="/meals"
                  className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium transition-all duration-150"
                  style={{ background: "linear-gradient(135deg, #0c1830 0%, #091222 100%)", border: "1px solid rgba(40,76,140,0.22)", color: "#6b8cb8" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(79,114,255,0.3)"; (e.currentTarget as HTMLElement).style.color = "#c8deff"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(40,76,140,0.22)"; (e.currentTarget as HTMLElement).style.color = "#6b8cb8"; }}
                >
                  <Utensils className="w-4 h-4 text-orange-400" />
                  Meals
                </Link>
                <Link
                  href="/weights"
                  className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium transition-all duration-150"
                  style={{ background: "linear-gradient(135deg, #0c1830 0%, #091222 100%)", border: "1px solid rgba(40,76,140,0.22)", color: "#6b8cb8" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(79,114,255,0.3)"; (e.currentTarget as HTMLElement).style.color = "#c8deff"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(40,76,140,0.22)"; (e.currentTarget as HTMLElement).style.color = "#6b8cb8"; }}
                >
                  <Dumbbell className="w-4 h-4 text-blue-400" />
                  Routines
                </Link>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Habits */}
                <section className="rounded-xl p-5" style={{ background: "linear-gradient(135deg, #0c1830 0%, #091222 100%)", border: "1px solid rgba(40,76,140,0.22)" }}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold" style={{ color: "#c8deff", fontFamily: "'Syne', sans-serif" }}>
                      Habits
                      {entryDate && <span className="text-xs font-normal ml-2" style={{ color: "#2d4a6a" }}>({new Date(entryDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })})</span>}
                    </h2>
                    <Link href="/habits" className="text-xs flex items-center gap-1 transition-colors" style={{ color: "#4f72ff" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#7a9eff")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#4f72ff")}>
                      View all <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                  {habits.length === 0 ? (
                    <div className="py-6 text-center">
                      <p className="text-sm" style={{ color: "#2d4a6a" }}>No habits yet</p>
                      <Link href="/habits" className="text-sm mt-1 inline-block transition-colors" style={{ color: "#4f72ff" }}>Add your first habit</Link>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {habits.map((habit) => (
                        <div key={habit.id} className="flex items-center gap-3 p-2.5 rounded-lg" style={{ background: "rgba(6,13,28,0.6)" }}>
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: habit.color }} />
                          {habit.completed
                            ? <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                            : <Circle className="w-4 h-4 flex-shrink-0" style={{ color: "#1e3050" }} />}
                          <span className={`text-sm flex-1 ${habit.completed ? "line-through" : ""}`} style={{ color: habit.completed ? "#334d6e" : "#c8deff" }}>{habit.name}</span>
                          <span className="text-xs capitalize" style={{ color: "#2d4a6a" }}>{habit.category}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Projects */}
                <section className="rounded-xl p-5" style={{ background: "linear-gradient(135deg, #0c1830 0%, #091222 100%)", border: "1px solid rgba(40,76,140,0.22)" }}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold" style={{ color: "#c8deff", fontFamily: "'Syne', sans-serif" }}>Active Projects</h2>
                    <Link href="/projects" className="text-xs flex items-center gap-1 transition-colors" style={{ color: "#4f72ff" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#7a9eff")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#4f72ff")}>
                      View all <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                  {projects.length === 0 ? (
                    <div className="py-6 text-center">
                      <p className="text-sm" style={{ color: "#2d4a6a" }}>No active projects</p>
                      <Link href="/projects" className="text-sm mt-1 inline-block transition-colors" style={{ color: "#4f72ff" }}>Create a project</Link>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {projects.map((project) => {
                        const pct = project.totalTasks > 0 ? Math.round((project.doneTasks / project.totalTasks) * 100) : 0;
                        const priorityColors: Record<string, string> = {
                          high: "text-red-400 bg-red-500/10",
                          medium: "text-yellow-400 bg-yellow-500/10",
                          low: "text-green-400 bg-green-500/10",
                        };
                        return (
                          <Link key={project.id} href={`/projects/${project.id}`} className="block p-3 rounded-lg transition-all duration-150" style={{ background: "rgba(6,13,28,0.6)" }}
                            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(6,13,28,0.9)")}
                            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(6,13,28,0.6)")}>
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <span className="text-sm font-medium line-clamp-1" style={{ color: "#c8deff" }}>{project.title}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 capitalize ${priorityColors[project.priority] ?? "text-slate-400 bg-slate-500/10"}`}>{project.priority}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(20,40,70,0.8)" }}>
                                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #4f72ff, #22d3ee)" }} />
                              </div>
                              <span className="text-xs flex-shrink-0" style={{ color: "#2d4a6a" }}>{project.doneTasks}/{project.totalTasks} tasks</span>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>

              {entryNotes && (
                <section className="mt-6 rounded-xl p-5" style={{ background: "linear-gradient(135deg, #0c1830 0%, #091222 100%)", border: "1px solid rgba(40,76,140,0.22)" }}>
                  <h2 className="font-semibold mb-3" style={{ color: "#c8deff", fontFamily: "'Syne', sans-serif" }}>
                    Last Entry Notes
                    {entryDate && <span className="text-xs font-normal ml-2" style={{ color: "#2d4a6a" }}>({new Date(entryDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })})</span>}
                  </h2>
                  <p className="text-sm leading-relaxed" style={{ color: "#6b8cb8" }}>{entryNotes}</p>
                </section>
              )}
            </>
          )}
        </>
      )}

      {/* Analytics tab */}
      {tab === "analytics" && <AnalyticsTab />}

      {/* Progression tab */}
      {tab === "progression" && <ProgressionTab />}
    </>
  );
}
