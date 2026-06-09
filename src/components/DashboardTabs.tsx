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
  Utensils,
  Flame,
  ChevronRight,
  FolderKanban,
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
  { key: "overall",    label: "Overall",    color: "#14b8a6", icon: BarChart3 },
  { key: "focus",      label: "Focus",      color: "#3b82f6", icon: Brain },
  { key: "mental",     label: "Mental",     color: "#a78bfa", icon: ClipboardCheck },
];

const PIE_COLORS = ["#3b82f6", "#1e293b", "#ef4444"];

// ── Small shared components ───────────────────────────────────────────────────

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

// ── Meals preview ─────────────────────────────────────────────────────────────

interface Meal {
  id: string;
  name: string;
  category: string;
  calories: number | null;
  recipe: string | null;
}

const MEAL_CATEGORY_COLORS: Record<string, string> = {
  breakfast: "#f59e0b",
  lunch:     "#22d3ee",
  dinner:    "#a78bfa",
  snack:     "#10d9a0",
};

function MealsPreview() {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/meals", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setMeals(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div
      className="rounded-[20px] flex flex-col overflow-hidden"
      style={{
        background: "var(--bg-elev-1)",
        border: "1px solid var(--stroke-2)",
        minHeight: "220px",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: "1px solid var(--stroke-1)" }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-6 h-6 rounded-[7px] flex items-center justify-center"
            style={{ background: "rgba(255, 181, 71, .12)", color: "var(--cat-appearance)" }}
          >
            <Utensils className="w-3 h-3" />
          </div>
          <span className="text-sm font-semibold" style={{ color: "var(--ink-100)" }}>
            Meals
          </span>
          {!loading && (
            <span
              className="text-[11px] font-mono"
              style={{ color: "var(--ink-400)" }}
            >
              · {meals.length}
            </span>
          )}
        </div>
        <Link
          href="/meals"
          className="text-[12px] flex items-center gap-1 transition-colors"
          style={{ color: "var(--blue-400)" }}
        >
          See all <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto p-3" style={{ maxHeight: "180px" }}>
        {loading ? (
          <div className="flex items-center justify-center h-16">
            <div
              className="w-4 h-4 rounded-full border-2 animate-spin"
              style={{ borderColor: "var(--stroke-2)", borderTopColor: "var(--blue-400)" }}
            />
          </div>
        ) : meals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-16 gap-1">
            <p className="text-xs" style={{ color: "var(--ink-500)" }}>No meals added yet</p>
            <Link href="/meals" className="text-xs" style={{ color: "var(--blue-400)" }}>
              Add your first meal →
            </Link>
          </div>
        ) : (
          <div className="space-y-1">
            {meals.map((meal) => (
              <div
                key={meal.id}
                className="flex items-center gap-3 px-3 py-2 rounded-[10px]"
                style={{ background: "rgba(255,255,255,.015)" }}
              >
                <span
                  className="text-[10px] uppercase px-2 py-0.5 rounded-[6px] font-medium flex-shrink-0"
                  style={{
                    background: `${MEAL_CATEGORY_COLORS[meal.category] ?? "var(--blue-400)"}18`,
                    color: MEAL_CATEGORY_COLORS[meal.category] ?? "var(--blue-400)",
                    letterSpacing: ".12em",
                  }}
                >
                  {meal.category}
                </span>
                <span className="text-xs flex-1 truncate" style={{ color: "var(--ink-300)" }}>
                  {meal.name}
                </span>
                {meal.calories && (
                  <span className="text-xs flex-shrink-0 font-mono" style={{ color: "var(--ink-400)" }}>
                    {meal.calories} cal
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Routines preview ───────────────────────────────────────────────────────────

interface Routine {
  id: string;
  name: string;
  description: string | null;
  exercises: { id: string; name: string }[];
  sessions: { date: string }[];
  _count: { sessions: number };
}

function RoutinesPreview() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayMs] = useState(() => Date.now());

  useEffect(() => {
    fetch("/api/weights/routines", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setRoutines(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div
      className="rounded-[20px] flex flex-col overflow-hidden"
      style={{
        background: "var(--bg-elev-1)",
        border: "1px solid var(--stroke-2)",
        minHeight: "220px",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: "1px solid var(--stroke-1)" }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-6 h-6 rounded-[7px] flex items-center justify-center"
            style={{ background: "rgba(79, 127, 255, .12)", color: "var(--blue-400)" }}
          >
            <Dumbbell className="w-3 h-3" />
          </div>
          <span className="text-sm font-semibold" style={{ color: "var(--ink-100)" }}>
            Routines
          </span>
          {!loading && (
            <span
              className="text-[11px] font-mono"
              style={{ color: "var(--ink-400)" }}
            >
              · {routines.length}
            </span>
          )}
        </div>
        <Link
          href="/weights"
          className="text-[12px] flex items-center gap-1 transition-colors"
          style={{ color: "var(--blue-400)" }}
        >
          See all <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto p-3" style={{ maxHeight: "180px" }}>
        {loading ? (
          <div className="flex items-center justify-center h-16">
            <div
              className="w-4 h-4 rounded-full border-2 animate-spin"
              style={{ borderColor: "var(--stroke-2)", borderTopColor: "var(--blue-400)" }}
            />
          </div>
        ) : routines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-16 gap-1">
            <p className="text-xs" style={{ color: "var(--ink-500)" }}>No routines yet</p>
            <Link href="/weights" className="text-xs" style={{ color: "var(--blue-400)" }}>
              Create a routine →
            </Link>
          </div>
        ) : (
          <div className="space-y-1">
            {routines.map((routine) => {
              const lastSession = routine.sessions[0];
              const daysSince = lastSession
                ? Math.floor((todayMs - new Date(lastSession.date).getTime()) / 86400000)
                : null;
              return (
                <div
                  key={routine.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-[10px]"
                  style={{ background: "rgba(255,255,255,.015)" }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: "var(--ink-200)" }}>
                      {routine.name}
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--ink-500)" }}>
                      {routine.exercises.length} exercise{routine.exercises.length !== 1 ? "s" : ""}
                      {" · "}
                      {routine._count.sessions} session{routine._count.sessions !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {daysSince !== null && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Flame
                        className="w-3 h-3"
                        style={{ color: daysSince <= 2 ? "var(--cat-appearance)" : "var(--ink-600)" }}
                      />
                      <span
                        className="text-[11px]"
                        style={{ color: daysSince <= 2 ? "var(--cat-appearance)" : "var(--ink-600)" }}
                      >
                        {daysSince === 0 ? "today" : `${daysSince}d ago`}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
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
  if (!data || data.categoryScores.length === 0) return <EmptyState icon={BarChart3} title="Log an entry to see analytics" description="Your performance charts will appear here once you've logged a daily entry." ctaLabel="Log Today's Entry" ctaHref="/entry" />;

  const { categoryScores, trends, habitStats, projectStats } = data;
  const lineData = categoryScores.map((s) => ({
    date: new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    physical: s.physical, financial: s.financial, discipline: s.discipline,
    focus: s.focus, mental: s.mental, overall: s.overall,
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
      {/* Score cards — clickable for insights */}
      {latest && (
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "#3d5a7a", fontFamily: "'Syne', sans-serif" }}>Current Scores</h2>
          <p className="text-xs mb-4" style={{ color: "#1e3050" }}>Click any score to see what you&apos;re doing wrong and what to fix</p>
          <DashboardScores
            scores={SCORE_META.map(({ key, label }) => {
              const prev = categoryScores[categoryScores.length - 2];
              return {
                key,
                title: label,
                score: latest[key as keyof typeof latest] as number,
                prevScore: prev ? (prev[key as keyof typeof prev] as number) : undefined,
              };
            })}
          />
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Action queue pie */}
        <div className="rounded-xl p-5" style={{ background: "linear-gradient(135deg, #0c1830 0%, #091222 100%)", border: "1px solid rgba(40,76,140,0.22)" }}>
          <h2 className="font-semibold mb-4" style={{ color: "#c8deff", fontFamily: "'Syne', sans-serif" }}>Plans Status</h2>
          {pieData.length === 0 ? (
            <div className="flex items-center justify-center h-48"><p className="text-sm" style={{ color: "#2d4a6a" }}>No plans yet</p></div>
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
                <p className="text-sm font-medium" style={{ color: "#8aadcc" }}>Queue Tasks</p>
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
    <div className="flex flex-col md:flex-row gap-6">
      <div className="md:w-52 flex-shrink-0">
        <p className="text-xs uppercase tracking-widest font-medium mb-3" style={{ color: "#2d4a6a", fontFamily: "'Syne', sans-serif" }}>Exercises</p>
        <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible pb-1 md:pb-0">
          {progressions.map((p) => (
            <button key={p.exerciseName} onClick={() => setSelectedExercise(p.exerciseName)}
              className="flex-shrink-0 md:w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-150 whitespace-nowrap md:whitespace-normal"
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
    habits, projects,
    entryNotes, entryDate,
  } = props;

  const [tab, setTab] = useState<Tab>("dashboard");
  const [localHabits, setLocalHabits] = useState<DashboardHabit[]>(habits);

  useEffect(() => {
    setLocalHabits(habits);
  }, [habits]);

  async function toggleHabit(id: string) {
    setLocalHabits((prev) =>
      prev.map((h) => (h.id === id ? { ...h, completed: !h.completed } : h))
    );
    try {
      const res = await fetch(`/api/habits/${id}/log`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        setLocalHabits((prev) =>
          prev.map((h) => (h.id === id ? { ...h, completed: !h.completed } : h))
        );
      }
    } catch {
      setLocalHabits((prev) =>
        prev.map((h) => (h.id === id ? { ...h, completed: !h.completed } : h))
      );
    }
  }

  const tabBtn = useCallback((id: Tab, label: string, Icon: LucideIcon) => (
    <button
      onClick={() => setTab(id)}
      className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] text-[13px] font-medium transition-all duration-150"
      style={
        tab === id
          ? {
              color: "var(--ink-100)",
              background: "rgba(79, 127, 255, .1)",
              border: "1px solid rgba(79, 127, 255, .35)",
            }
          : {
              color: "var(--ink-400)",
              border: "1px solid transparent",
            }
      }
      onMouseEnter={(e) => {
        if (tab !== id) (e.currentTarget as HTMLElement).style.color = "var(--ink-200)";
      }}
      onMouseLeave={(e) => {
        if (tab !== id) (e.currentTarget as HTMLElement).style.color = "var(--ink-400)";
      }}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  ), [tab]);

  return (
    <>
      {/* Tab nav (Claude Design) */}
      <div
        className="inline-flex gap-1 p-1 mb-6 rounded-[14px] overflow-x-auto"
        style={{
          background: "var(--bg-elev-1)",
          border: "1px solid var(--stroke-1)",
        }}
      >
        {tabBtn("dashboard", "Dashboard", LayoutDashboard)}
        {tabBtn("analytics", "Analytics", BarChart3)}
        {tabBtn("progression", "Progression", Dumbbell)}
      </div>

      {/* Dashboard tab */}
      {tab === "dashboard" && (
        <div className="fade-in">
          {/* Score Hero (Claude Design) */}
          {props.hasData && props.scores.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-7 mb-7">
              {/* Score Ring */}
              <div
                className="relative overflow-hidden rounded-[20px] p-7"
                style={{
                  background: "linear-gradient(180deg, rgba(79, 127, 255, .06), rgba(0,0,0,0)), var(--bg-elev-1)",
                  border: "1px solid var(--stroke-2)",
                }}
              >
                <div
                  className="absolute inset-[-1px] pointer-events-none rounded-[20px]"
                  style={{
                    background: "radial-gradient(circle at 50% 0%, rgba(79, 127, 255, .15), transparent 50%)",
                  }}
                />
                <div className="relative">
                  <div
                    className="text-[11px] uppercase"
                    style={{ letterSpacing: ".2em", color: "var(--ink-400)" }}
                  >
                    Today&apos;s score
                  </div>
                  <div className="flex items-center gap-6 mt-5">
                    {/* Animated Score Ring */}
                    <div className="relative w-[160px] h-[160px] flex-shrink-0">
                      <svg viewBox="0 0 160 160" className="w-full h-full">
                        <defs>
                          <linearGradient id="score-gradient" x1="0" x2="1" y1="0" y2="1">
                            <stop offset="0" stopColor="#4f7fff"/>
                            <stop offset="1" stopColor="#2cb6ff"/>
                          </linearGradient>
                        </defs>
                        <circle
                          cx="80" cy="80" r="68"
                          fill="none"
                          stroke="rgba(255,255,255,.06)"
                          strokeWidth="12"
                        />
                        <circle
                          cx="80" cy="80" r="68"
                          fill="none"
                          stroke="url(#score-gradient)"
                          strokeWidth="12"
                          strokeLinecap="round"
                          strokeDasharray={2 * Math.PI * 68}
                          strokeDashoffset={2 * Math.PI * 68 * (1 - (props.scores.find(s => s.key === "overall")?.score ?? 0) / 10)}
                          transform="rotate(-90 80 80)"
                          style={{ transition: "stroke-dashoffset 1.6s cubic-bezier(.2,.7,.2,1)" }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center flex-col">
                        <div
                          className="text-[56px] leading-none"
                          style={{
                            fontFamily: "var(--font-display)",
                            color: "var(--ink-100)",
                            letterSpacing: "-0.04em",
                          }}
                        >
                          {props.scores.find(s => s.key === "overall")?.score ?? 0}
                        </div>
                        <div
                          className="text-[9px] uppercase mt-1"
                          style={{ letterSpacing: ".2em", color: "var(--ink-500)" }}
                        >
                          today
                        </div>
                      </div>
                    </div>
                    {/* Delta */}
                    <div className="flex-1">
                      {props.scores.find(s => s.key === "overall")?.prevScore !== undefined && (
                        <span
                          className="inline-flex items-center gap-1.5 text-[13px] px-2.5 py-1 rounded-full"
                          style={{
                            color: "var(--good)",
                            background: "rgba(46, 216, 137, .1)",
                          }}
                        >
                          +{(props.scores.find(s => s.key === "overall")?.score ?? 0) - (props.scores.find(s => s.key === "overall")?.prevScore ?? 0)} from yesterday
                        </span>
                      )}
                      <div
                        className="text-[14px] leading-relaxed mt-2.5"
                        style={{ color: "var(--ink-300)" }}
                      >
                        {localHabits.filter(h => h.completed).length > 0
                          ? `Great progress today. ${localHabits.filter(h => h.completed).length}/${localHabits.length} habits completed.`
                          : "Log today's entry to see your score breakdown."}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Lane Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {props.scores.filter(s => s.key !== "overall").slice(0, 4).map((score) => {
                  const colors: Record<string, string> = {
                    physical: "var(--cat-physical)",
                    financial: "var(--cat-financial)",
                    discipline: "var(--cat-discipline)",
                    focus: "var(--blue-400)",
                    mental: "var(--cat-mental)",
                  };
                  const color = colors[score.key] || "var(--blue-400)";
                  const delta = score.prevScore !== undefined ? score.score - score.prevScore : 0;
                  return (
                    <div
                      key={score.key}
                      className="rounded-2xl p-4 relative overflow-hidden"
                      style={{
                        background: "var(--bg-elev-1)",
                        border: "1px solid var(--stroke-2)",
                      }}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span
                          className="text-[11px] uppercase"
                          style={{ letterSpacing: ".15em", color: "var(--ink-400)" }}
                        >
                          {score.title}
                        </span>
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: color, boxShadow: `0 0 10px ${color}` }}
                        />
                      </div>
                      <div
                        className="text-[44px] leading-none"
                        style={{
                          fontFamily: "var(--font-display)",
                          color: "var(--ink-100)",
                          letterSpacing: "-0.03em",
                        }}
                      >
                        {score.score}
                      </div>
                      <div
                        className="mt-3 h-1 rounded-full overflow-hidden"
                        style={{ background: "rgba(255,255,255,.05)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-1000"
                          style={{
                            width: `${(score.score / 10) * 100}%`,
                            background: color,
                          }}
                        />
                      </div>
                      <div
                        className="flex items-center gap-1 mt-2.5 text-[11px]"
                        style={{ color: delta >= 0 ? "var(--good)" : "var(--bad)" }}
                      >
                        {delta >= 0 ? "↑" : "↓"} {delta >= 0 ? "+" : ""}{delta} this week
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Meals & Routines previews */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
            <MealsPreview />
            <RoutinesPreview />
          </div>

          {/* Habits & Projects grid (Claude Design) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Habits */}
            <section
              className="rounded-[20px] overflow-hidden"
              style={{
                background: "var(--bg-elev-1)",
                border: "1px solid var(--stroke-2)",
              }}
            >
              <div
                className="flex items-center justify-between px-5 py-4"
                style={{ borderBottom: "1px solid var(--stroke-1)" }}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-6 h-6 rounded-[7px] flex items-center justify-center"
                    style={{ background: "rgba(79, 127, 255, .12)", color: "var(--blue-400)" }}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-sm font-semibold" style={{ color: "var(--ink-100)" }}>
                    Habits today
                  </span>
                  <span
                    className="text-[11px] font-mono"
                    style={{ color: "var(--ink-400)" }}
                  >
                    · {localHabits.filter(h => h.completed).length}/{localHabits.length}
                  </span>
                </div>
                <Link
                  href="/habits"
                  className="text-[12px] flex items-center gap-1 transition-colors"
                  style={{ color: "var(--blue-400)" }}
                >
                  View all →
                </Link>
              </div>
              <div className="p-3">
                {localHabits.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-sm" style={{ color: "var(--ink-400)" }}>No habits yet</p>
                    <Link href="/habits" className="text-sm mt-1 inline-block" style={{ color: "var(--blue-400)" }}>
                      Add your first habit
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {localHabits.map((habit) => (
                      <div
                        key={habit.id}
                        onClick={() => toggleHabit(habit.id)}
                        className="flex items-center gap-3.5 px-3 py-3 rounded-[10px] cursor-pointer transition-all duration-150"
                        style={{ background: "transparent" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,.02)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <div
                          className="w-[18px] h-[18px] rounded-[6px] flex-shrink-0 flex items-center justify-center"
                          style={{
                            background: habit.completed ? "var(--blue-500)" : "transparent",
                            border: habit.completed ? "none" : "1.5px solid var(--stroke-3)",
                            boxShadow: habit.completed ? "0 0 0 3px rgba(47, 100, 255, .15)" : "none",
                          }}
                        >
                          {habit.completed && (
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                              <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div
                            className="text-sm"
                            style={{ color: habit.completed ? "var(--ink-300)" : "var(--ink-200)" }}
                          >
                            {habit.name}
                          </div>
                        </div>
                        <span
                          className="text-[10px] uppercase px-2 py-0.5 rounded-[6px] font-medium"
                          style={{
                            background: `rgba(79, 127, 255, .12)`,
                            color: "var(--blue-400)",
                            letterSpacing: ".12em",
                          }}
                        >
                          {habit.category}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Projects */}
            <section
              className="rounded-[20px] overflow-hidden"
              style={{
                background: "var(--bg-elev-1)",
                border: "1px solid var(--stroke-2)",
              }}
            >
              <div
                className="flex items-center justify-between px-5 py-4"
                style={{ borderBottom: "1px solid var(--stroke-1)" }}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-6 h-6 rounded-[7px] flex items-center justify-center"
                    style={{ background: "rgba(79, 127, 255, .12)", color: "var(--blue-400)" }}
                  >
                    <FolderKanban className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-sm font-semibold" style={{ color: "var(--ink-100)" }}>
                    Active projects
                  </span>
                  <span
                    className="text-[11px] font-mono"
                    style={{ color: "var(--ink-400)" }}
                  >
                    · {props.projects.length}
                  </span>
                </div>
                <Link
                  href="/projects"
                  className="text-[12px] flex items-center gap-1 transition-colors"
                  style={{ color: "var(--blue-400)" }}
                >
                  View all →
                </Link>
              </div>
              <div className="p-3">
                {props.projects.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-sm" style={{ color: "var(--ink-400)" }}>No active projects</p>
                    <Link href="/projects" className="text-sm mt-1 inline-block" style={{ color: "var(--blue-400)" }}>
                      Create a project
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {props.projects.map((project) => {
                      const pct = project.totalTasks > 0 ? Math.round((project.doneTasks / project.totalTasks) * 100) : 0;
                      const priorityColors: Record<string, { bg: string; color: string }> = {
                        high: { bg: "rgba(255,95,109,.15)", color: "#ff7a85" },
                        medium: { bg: "rgba(255,181,71,.15)", color: "var(--cat-appearance)" },
                        low: { bg: "rgba(46,216,137,.15)", color: "var(--cat-discipline)" },
                      };
                      const pColor = priorityColors[project.priority] ?? priorityColors.low;
                      return (
                        <Link
                          key={project.id}
                          href={`/projects/${project.id}`}
                          className="block p-3.5 rounded-xl transition-all duration-150"
                          style={{
                            background: "rgba(255,255,255,.015)",
                            border: "1px solid var(--stroke-1)",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = "var(--stroke-2)";
                            e.currentTarget.style.background = "rgba(255,255,255,.025)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = "var(--stroke-1)";
                            e.currentTarget.style.background = "rgba(255,255,255,.015)";
                          }}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <span className="text-sm font-medium line-clamp-1" style={{ color: "var(--ink-100)" }}>
                              {project.title}
                            </span>
                            <span
                              className="text-[9px] uppercase px-2 py-0.5 rounded-[6px] font-medium flex-shrink-0"
                              style={{
                                background: pColor.bg,
                                color: pColor.color,
                                letterSpacing: ".12em",
                              }}
                            >
                              {project.priority}
                            </span>
                          </div>
                          <div
                            className="mt-2 h-[4px] rounded-full overflow-hidden"
                            style={{ background: "rgba(255,255,255,.05)" }}
                          >
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${pct}%`,
                                background: "linear-gradient(90deg, var(--blue-400), var(--cyan-400))",
                              }}
                            />
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-[11px]" style={{ color: "var(--ink-500)" }}>
                              {project.doneTasks}/{project.totalTasks} tasks
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>

          {props.entryNotes && (
            <section
              className="mt-5 rounded-[20px] p-5"
              style={{
                background: "var(--bg-elev-1)",
                border: "1px solid var(--stroke-2)",
              }}
            >
              <h2 className="text-base font-semibold mb-3" style={{ color: "var(--ink-100)" }}>
                Last Entry Notes
                {props.entryDate && (
                  <span className="text-xs font-normal ml-2" style={{ color: "var(--ink-500)" }}>
                    ({new Date(props.entryDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })})
                  </span>
                )}
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "var(--ink-300)" }}>{props.entryNotes}</p>
            </section>
          )}
        </div>
      )}

      {/* Analytics tab */}
      {tab === "analytics" && <AnalyticsTab />}

      {/* Progression tab */}
      {tab === "progression" && <ProgressionTab />}
    </>
  );
}
