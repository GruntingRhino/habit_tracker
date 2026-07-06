"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
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
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
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
  weekEntriesLogged: number;
  weekHabitsCompleted: number;
  weekHabitsTotal: number;
  weekDeepWorkHours: number;
  coachInsight: string | null;
  userName: string;
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
  habitConsistency: number;
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
];

// ── Small shared components ───────────────────────────────────────────────────

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
      className="rounded-xl flex flex-col"
      style={{
        background: "linear-gradient(135deg, #0c1830 0%, #091222 100%)",
        border: "1px solid rgba(40,76,140,0.22)",
        minHeight: "220px",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3" style={{ borderBottom: "1px solid rgba(30,60,110,0.3)" }}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "rgba(251,146,60,0.15)" }}>
            <Utensils className="w-3 h-3" style={{ color: "#fb923c" }} />
          </div>
          <span className="text-sm font-semibold" style={{ color: "#c8deff", fontFamily: "'Syne', sans-serif" }}>Meals</span>
          {!loading && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: "rgba(40,76,140,0.3)", color: "#4a6a90" }}>{meals.length}</span>}
        </div>
        <Link
          href="/meals"
          className="flex items-center gap-1 text-xs font-medium transition-colors"
          style={{ color: "#4f72ff" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#7a9eff")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#4f72ff")}
        >
          See all <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto px-3 py-2" style={{ maxHeight: "180px" }}>
        {loading ? (
          <div className="flex items-center justify-center h-16">
            <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(40,76,140,0.3)", borderTopColor: "#4f72ff" }} />
          </div>
        ) : meals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-16 gap-1">
            <p className="text-xs" style={{ color: "#2d4a6a" }}>No meals added yet</p>
            <Link href="/meals" className="text-xs" style={{ color: "#4f72ff" }}>Add your first meal →</Link>
          </div>
        ) : (
          <div className="space-y-1">
            {meals.map((meal) => (
              <div key={meal.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: "rgba(6,13,28,0.5)" }}>
                <span
                  className="text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 capitalize"
                  style={{
                    background: `${MEAL_CATEGORY_COLORS[meal.category] ?? "#4f72ff"}18`,
                    color: MEAL_CATEGORY_COLORS[meal.category] ?? "#4f72ff",
                  }}
                >
                  {meal.category}
                </span>
                <span className="text-xs flex-1 truncate" style={{ color: "#8aadcc" }}>{meal.name}</span>
                {meal.calories && (
                  <span className="text-xs flex-shrink-0" style={{ color: "#2d4a6a" }}>{meal.calories} cal</span>
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
      className="rounded-xl flex flex-col"
      style={{
        background: "linear-gradient(135deg, #0c1830 0%, #091222 100%)",
        border: "1px solid rgba(40,76,140,0.22)",
        minHeight: "220px",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3" style={{ borderBottom: "1px solid rgba(30,60,110,0.3)" }}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "rgba(79,114,255,0.15)" }}>
            <Dumbbell className="w-3 h-3" style={{ color: "#4f72ff" }} />
          </div>
          <span className="text-sm font-semibold" style={{ color: "#c8deff", fontFamily: "'Syne', sans-serif" }}>Routines</span>
          {!loading && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: "rgba(40,76,140,0.3)", color: "#4a6a90" }}>{routines.length}</span>}
        </div>
        <Link
          href="/weights"
          className="flex items-center gap-1 text-xs font-medium transition-colors"
          style={{ color: "#4f72ff" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#7a9eff")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#4f72ff")}
        >
          See all <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto px-3 py-2" style={{ maxHeight: "180px" }}>
        {loading ? (
          <div className="flex items-center justify-center h-16">
            <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(40,76,140,0.3)", borderTopColor: "#4f72ff" }} />
          </div>
        ) : routines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-16 gap-1">
            <p className="text-xs" style={{ color: "#2d4a6a" }}>No routines yet</p>
            <Link href="/weights" className="text-xs" style={{ color: "#4f72ff" }}>Create a routine →</Link>
          </div>
        ) : (
          <div className="space-y-1">
            {routines.map((routine) => {
              const lastSession = routine.sessions[0];
              const daysSince = lastSession
                ? Math.floor((todayMs - new Date(lastSession.date).getTime()) / 86400000)
                : null;
              return (
                <div key={routine.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: "rgba(6,13,28,0.5)" }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: "#8aadcc" }}>{routine.name}</p>
                    <p className="text-xs" style={{ color: "#2d4a6a" }}>
                      {routine.exercises.length} exercise{routine.exercises.length !== 1 ? "s" : ""}
                      {" · "}
                      {routine._count.sessions} session{routine._count.sessions !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {daysSince !== null && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Flame className="w-3 h-3" style={{ color: daysSince <= 2 ? "#fb923c" : "#1e3050" }} />
                      <span className="text-xs" style={{ color: daysSince <= 2 ? "#fb923c" : "#1e3050" }}>
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

// ── Notes preview ─────────────────────────────────────────────────────────────

interface NotePreviewItem {
  id: string;
  title: string;
  content: string | null;
  type: string;
}

function NotesPreview() {
  const [notes, setNotes] = useState<NotePreviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/notes?limit=3", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setNotes(Array.isArray(d) ? d.slice(0, 3) : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div
      className="rounded-xl flex flex-col"
      style={{
        background: "linear-gradient(135deg, #0c1830 0%, #091222 100%)",
        border: "1px solid rgba(40,76,140,0.22)",
        minHeight: "220px",
      }}
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-3" style={{ borderBottom: "1px solid rgba(30,60,110,0.3)" }}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "rgba(167,139,250,0.15)" }}>
            <FolderKanban className="w-3 h-3" style={{ color: "#a78bfa" }} />
          </div>
          <span className="text-sm font-semibold" style={{ color: "#c8deff", fontFamily: "'Syne', sans-serif" }}>Notes</span>
          {!loading && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: "rgba(40,76,140,0.3)", color: "#4a6a90" }}>{notes.length}</span>}
        </div>
        <Link
          href="/notes"
          className="flex items-center gap-1 text-xs font-medium transition-colors"
          style={{ color: "#4f72ff" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#7a9eff")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#4f72ff")}
        >
          See all <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2" style={{ maxHeight: "180px" }}>
        {loading ? (
          <div className="flex items-center justify-center h-16">
            <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(40,76,140,0.3)", borderTopColor: "#4f72ff" }} />
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-16 gap-1">
            <p className="text-xs" style={{ color: "#2d4a6a" }}>No notes yet</p>
            <Link href="/notes" className="text-xs" style={{ color: "#4f72ff" }}>Add your first note →</Link>
          </div>
        ) : (
          <div className="space-y-1">
            {notes.map((note) => (
              <div key={note.id} className="flex items-start gap-2 px-2 py-1.5 rounded-lg" style={{ background: "rgba(6,13,28,0.5)" }}>
                <span
                  className="text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 capitalize mt-0.5"
                  style={{ background: note.type === "todo" ? "rgba(16,217,160,0.12)" : "rgba(167,139,250,0.12)", color: note.type === "todo" ? "#10d9a0" : "#a78bfa" }}
                >
                  {note.type}
                </span>
                <span className="text-xs flex-1 truncate" style={{ color: "#8aadcc" }}>{note.title}</span>
              </div>
            ))}
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

  const { categoryScores, habitStats, habitConsistency, projectStats } = data;
  const lineData = categoryScores.map((s) => ({
    date: new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    physical: s.physical, financial: s.financial, discipline: s.discipline,
    focus: s.focus, mental: s.mental,
  }));
  const radarData = SCORE_META.map(({ key, label }) => {
    const last7 = categoryScores.slice(-7);
    const avg = last7.length > 0 ? last7.reduce((sum, s) => sum + s[key], 0) / last7.length : 0;
    return { subject: label, value: Math.round(avg * 10) / 10, fullMark: 10 };
  });
  const planStatusData = [
    { name: "Created past month", value: projectStats.total },
    { name: "Completed", value: projectStats.completed },
    { name: "Overdue", value: projectStats.overdueCount },
  ];
  const latest = categoryScores[categoryScores.length - 1];
  const latestCategoryScores: DashboardScore[] = latest
    ? SCORE_META.map(({ key, label }) => ({
        key,
        title: label,
        score: latest[key],
      }))
    : [];

  return (
    <div>
      <CategoryScoreGrid scores={latestCategoryScores} />

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

        {/* Habit consistency */}
        <div className="rounded-xl p-5 text-center" style={{ background: "linear-gradient(135deg, #0c1830 0%, #091222 100%)", border: "1px solid rgba(40,76,140,0.22)" }}>
          <h2 className="font-semibold mb-4" style={{ color: "#c8deff", fontFamily: "'Syne', sans-serif" }}>Habit Consistency</h2>
          {habitStats.length === 0 ? (
            <div className="flex items-center justify-center h-48"><p className="text-sm" style={{ color: "#2d4a6a" }}>No habits yet</p></div>
          ) : (
            <div className="flex h-48 flex-col items-center justify-center">
              <div
                className="text-[clamp(4rem,16vw,6rem)] font-light leading-none tracking-[-0.06em] text-white"
                style={{ fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)" }}
              >
                {habitConsistency}%
              </div>
              <p className="mt-4 max-w-xs text-sm leading-6" style={{ color: "#4a6a90" }}>
                Average daily habit completion over the last 7 days.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Plans status */}
        <div className="rounded-xl p-5" style={{ background: "linear-gradient(135deg, #0c1830 0%, #091222 100%)", border: "1px solid rgba(40,76,140,0.22)" }}>
          <h2 className="font-semibold mb-4" style={{ color: "#c8deff", fontFamily: "'Syne', sans-serif" }}>Plans Status</h2>
          <div className="grid h-48 grid-cols-1 gap-3 sm:grid-cols-3">
            {planStatusData.map((entry) => (
              <div
                key={entry.name}
                className="flex flex-col items-center justify-center rounded-2xl px-3 py-4 text-center"
                style={{ background: "rgba(6,13,28,0.45)", border: "1px solid rgba(40,76,140,0.18)" }}
              >
                <div
                  className="text-5xl font-light leading-none tracking-[-0.05em] text-white"
                  style={{ fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)" }}
                >
                  {entry.value}
                </div>
                <p className="mt-3 text-xs font-medium uppercase tracking-[0.16em]" style={{ color: "#4a6a90" }}>
                  {entry.name}
                </p>
              </div>
            ))}
          </div>
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

const PRIORITY_DOT: Record<string, string> = {
  urgent: "#ff6b7a",
  high:   "#4f72ff",
  medium: "#f59e0b",
  low:    "#10d9a0",
};

function CenteredScoreRing({ score }: { score: number }) {
  const radius = 78;
  const circumference = 2 * Math.PI * radius;
  const normalizedScore = Math.max(0, Math.min(10, score));
  const dashOffset = circumference - (normalizedScore / 10) * circumference;

  return (
    <div className="relative mx-auto flex aspect-square w-full max-w-[240px] items-center justify-center sm:max-w-[280px]">
      <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 200 200" aria-hidden="true">
        <circle cx="100" cy="100" r={radius} fill="none" stroke="rgba(120,145,220,0.14)" strokeWidth="16" />
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="url(#dashboard-score-gradient)"
          strokeWidth="16"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="dashboard-score-gradient" x1="20" x2="180" y1="160" y2="30" gradientUnits="userSpaceOnUse">
            <stop stopColor="#5d7cff" />
            <stop offset="1" stopColor="#58b6ff" />
          </linearGradient>
        </defs>
      </svg>
      <span
        className="relative text-[clamp(4rem,18vw,6.5rem)] font-light leading-none tracking-[-0.06em] text-white"
        style={{ fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)" }}
      >
        {score.toFixed(1)}
      </span>
    </div>
  );
}

function CategoryScoreGrid({ scores }: { scores: DashboardScore[] }) {
  if (scores.length === 0) return null;

  return (
    <section
      className="mx-auto mb-5 grid w-full max-w-5xl gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))" }}
    >
      {scores.map((item) => (
        <div key={item.key} className="rounded-2xl p-4 text-center" style={{
          background: "linear-gradient(135deg, #0c1830 0%, #091222 100%)",
          border: "1px solid rgba(40,76,140,0.22)",
        }}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: "#6b8cb8" }}>
            {item.title}
          </p>
          <div
            className="mt-5 text-6xl font-light leading-none tracking-[-0.05em] text-white"
            style={{ fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)" }}
          >
            {item.score.toFixed(1)}
          </div>
          <div className="mx-auto mt-5 h-1.5 w-full max-w-[240px] overflow-hidden rounded-full" style={{ background: "rgba(120,145,220,0.12)" }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(0, Math.min(100, item.score * 10))}%`, background: "#5d7cff" }}
            />
          </div>
        </div>
      ))}
    </section>
  );
}

export default function DashboardTabs(props: DashboardTabsProps) {
  const {
    habits, projects, entryDate,
    hasData, scores,
    weekEntriesLogged, weekHabitsCompleted, weekHabitsTotal, weekDeepWorkHours,
    coachInsight,
  } = props;

  const [tab, setTab] = useState<Tab>("dashboard");
  const [localHabits, setLocalHabits] = useState<DashboardHabit[]>(habits);

  useEffect(() => { setLocalHabits(habits); }, [habits]);

  const toggleHabit = useCallback(async (id: string) => {
    const habit = localHabits.find((h) => h.id === id);
    if (!habit) return;
    const newCompleted = !habit.completed;
    setLocalHabits((prev) => prev.map((h) => h.id === id ? { ...h, completed: newCompleted } : h));
    try {
      await fetch(`/api/habits/${id}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ completed: newCompleted }),
      });
    } catch {
      setLocalHabits((prev) => prev.map((h) => h.id === id ? { ...h, completed: !newCompleted } : h));
    }
  }, [localHabits]);

  const overallScore = scores.find((s) => s.key === "overall");

  const cardStyle = {
    background: "linear-gradient(135deg, #0c1830 0%, #091222 100%)",
    border: "1px solid rgba(40,76,140,0.22)",
  };

  const tabBtn = useCallback((id: Tab, label: string, Icon: LucideIcon) => (
    <button
      onClick={() => setTab(id)}
      aria-label={label}
      title={label}
      className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 sm:flex-none sm:px-4"
      style={
        tab === id
          ? { background: "linear-gradient(135deg,rgba(79,114,255,0.22) 0%,rgba(79,114,255,0.1) 100%)", border: "1px solid rgba(79,114,255,0.35)", color: "#a8c4ff", boxShadow: "0 0 12px rgba(79,114,255,0.15)" }
          : { border: "1px solid transparent", color: "#3d5a7a" }
      }
      onMouseEnter={(e) => { if (tab !== id) (e.currentTarget as HTMLElement).style.color = "#6b8cb8"; }}
      onMouseLeave={(e) => { if (tab !== id) (e.currentTarget as HTMLElement).style.color = "#3d5a7a"; }}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className="sr-only">{label}</span>
    </button>
  ), [tab]);

  return (
    <>
      {/* Tab nav */}
      <div
        className="mx-auto mb-6 flex w-full max-w-3xl gap-1 rounded-xl p-1"
        style={{ background: "linear-gradient(135deg,rgba(9,18,34,0.95) 0%,rgba(6,13,28,0.9) 100%)", border: "1px solid rgba(40,76,140,0.25)", maxWidth: "100%" }}
      >
        {tabBtn("dashboard", "Dashboard", LayoutDashboard)}
        {tabBtn("analytics", "Analytics", BarChart3)}
        {tabBtn("progression", "Progression", Dumbbell)}
      </div>

      {/* ── Dashboard tab (v3 layout) ─────────────────────────────────────── */}
      {tab === "dashboard" && (
        <>
          <section className="mx-auto mb-5 flex w-full max-w-3xl justify-center">
            <div className="w-full rounded-[28px] p-5 sm:p-8" style={cardStyle}>
              {hasData && overallScore ? (
                <CenteredScoreRing score={overallScore.score} />
              ) : (
                <div className="flex min-h-[260px] flex-col items-center justify-center text-center">
                  <CenteredScoreRing score={0} />
                  <Link href="/entry" className="mt-5 text-sm font-medium" style={{ color: "#4f72ff" }}>
                    Log an entry
                  </Link>
                </div>
              )}
            </div>
          </section>

          <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
            <div className="overflow-hidden rounded-xl" style={cardStyle}>
              {/* Card header */}
              <div className="flex flex-wrap items-center justify-center gap-3 px-5 py-3.5 text-center sm:justify-between sm:text-left" style={{ borderBottom: "1px solid rgba(30,60,110,0.35)" }}>
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-sm font-semibold" style={{ color: "#c8deff" }}>Today</span>
                  {entryDate && (
                    <span className="text-xs" style={{ color: "#2d4a6a" }}>
                      {new Date(entryDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  )}
                </div>
                <Link href="/habits" className="text-xs transition-colors" style={{ color: "#4f72ff" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#7a9eff")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#4f72ff")}>
                  Manage habits →
                </Link>
              </div>

              <div className="p-5">
                {/* HABITS */}
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] mb-3" style={{ color: "#2d4a6a" }}>
                  HABITS
                </p>
                {localHabits.length === 0 ? (
                  <div className="py-4 text-center">
                    <p className="text-sm mb-1" style={{ color: "#2d4a6a" }}>No habits yet</p>
                    <Link href="/habits" className="text-xs" style={{ color: "#4f72ff" }}>Add your first habit</Link>
                  </div>
                ) : (
                  <div className="overflow-y-auto mb-5" style={{ maxHeight: "220px" }}>
                    {localHabits.map((habit) => (
                      <button
                        key={habit.id}
                        onClick={() => void toggleHabit(habit.id)}
                        className="w-full flex items-center gap-3 py-2 px-1 rounded-lg transition-all duration-150 text-left"
                        style={{ background: "transparent" }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)")}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                      >
                        {habit.completed
                          ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-green-400" />
                          : <Circle className="w-4 h-4 flex-shrink-0" style={{ color: "#1e3050" }} />}
                        <span className="text-sm flex-1" style={{ color: habit.completed ? "#334d6e" : "#c8deff", textDecoration: habit.completed ? "line-through" : "none" }}>
                          {habit.name}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* INCOMPLETE PRIORITIES */}
                {projects.filter((p) => p.totalTasks > p.doneTasks).length > 0 && (
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] mb-3" style={{ color: "#2d4a6a" }}>
                      INCOMPLETE PRIORITIES
                    </p>
                    <div className="space-y-1.5 mb-5">
                      {projects.filter((p) => p.totalTasks > p.doneTasks).map((project) => (
                        <Link
                          key={project.id}
                          href={`/projects/${project.id}`}
                          className="flex items-center justify-between py-1.5 px-1 rounded-lg transition-all duration-150"
                          style={{ background: "transparent" }}
                          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)")}
                          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: PRIORITY_DOT[project.priority] ?? "#4a6a90" }} />
                            <span className="text-sm" style={{ color: "#c8deff" }}>{project.title}</span>
                          </div>
                          <span className="text-xs flex-shrink-0 ml-4" style={{ color: "#2d4a6a" }}>
                            {project.doneTasks}/{project.totalTasks} tasks
                          </span>
                        </Link>
                      ))}
                    </div>
                  </>
                )}

                {/* COACH INSIGHT */}
                {coachInsight && (
                  <div
                    className="mb-5 px-4 py-3 rounded-xl"
                    style={{ background: "rgba(79,114,255,0.06)", borderLeft: "2px solid rgba(79,114,255,0.5)" }}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] mb-1.5" style={{ color: "#4f72ff" }}>
                      ✦ COACH INSIGHT
                    </p>
                    <p className="text-sm italic leading-relaxed" style={{ color: "#8aadcc" }}>
                      &ldquo;{coachInsight}&rdquo;
                    </p>
                  </div>
                )}

                {/* CTA */}
                <Link
                  href="/entry"
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm text-white transition-all duration-150"
                  style={{ background: "var(--accent, #4f72ff)", boxShadow: "0 0 20px rgba(79,114,255,0.2)" }}
                >
                  Start Daily Work →
                </Link>
              </div>
            </div>

            <div className="space-y-4">
              {/* Week at a glance */}
              <div className="rounded-xl p-5 text-center sm:text-left" style={cardStyle}>
                <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#2d4a6a" }}>
                  WEEK AT A GLANCE
                </p>
                <div className="space-y-3">
                  {[
                    { label: "Entries logged", value: `${weekEntriesLogged}/7 days` },
                    { label: "Habits completed", value: weekHabitsTotal > 0 ? `${weekHabitsCompleted}/${weekHabitsTotal}` : "—" },
                    { label: "Deep work hours", value: weekDeepWorkHours > 0 ? `${weekDeepWorkHours}h` : "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between gap-4">
                      <span className="text-sm" style={{ color: "#4a6a90" }}>{label}</span>
                      <span className="text-sm font-semibold" style={{ color: "#c8deff" }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom: quick-access strips */}
          <div
            className="mx-auto mt-5 grid w-full max-w-5xl gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))" }}
          >
            <MealsPreview />
            <RoutinesPreview />
            <NotesPreview />
          </div>
        </>
      )}

      {/* Analytics tab */}
      {tab === "analytics" && <AnalyticsTab />}

      {/* Progression tab */}
      {tab === "progression" && <ProgressionTab />}
    </>
  );
}
