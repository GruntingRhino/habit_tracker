"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Plus,
  Flame,
  CheckCircle2,
  Circle,
  X,
  Loader2,
  CheckSquare,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";

interface HabitLog {
  id: string;
  habitId: string;
  date: string;
  completed: boolean;
  notes: string | null;
}

interface Habit {
  id: string;
  name: string;
  description: string | null;
  category: string;
  targetDays: string[];
  color: string;
  isActive: boolean;
  streak: number;
  completionRate: number;
  logs: HabitLog[];
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const CATEGORIES = [
  "general",
  "physical",
  "mental",
  "health",
  "productivity",
  "finance",
  "social",
];

const COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

function getLast7Days(): Date[] {
  const days: Date[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  return days;
}

function formatDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getDayLabel(d: Date): string {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
}

interface AddHabitModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function AddHabitModal({ onClose, onSaved }: AddHabitModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [color, setColor] = useState("#3b82f6");
  const [targetDays, setTargetDays] = useState<string[]>([
    "mon", "tue", "wed", "thu", "fri", "sat", "sun",
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleDay(day: string) {
    setTargetDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/habits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: name.trim(), description, category, color, targetDays }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to create habit");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-slate-100">Add Habit</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Morning Run"
              className="w-full bg-[#1e293b] border border-[#334155] text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional description"
              className="w-full bg-[#1e293b] border border-[#334155] text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-[#1e293b] border border-[#334155] text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c} className="bg-[#0f172a] capitalize">
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${
                    color === c ? "border-white scale-110" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
              Target Days
            </label>
            <div className="flex gap-1.5">
              {DAYS.map((day, i) => {
                const key = DAY_KEYS[i];
                const active = targetDays.includes(key);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(key)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      active
                        ? "bg-blue-600 text-white"
                        : "bg-[#1e293b] text-slate-400 hover:bg-[#334155]"
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-[#1e293b] hover:bg-[#334155] text-slate-300 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Add Habit"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0f172a] border border-[#1e293b] rounded-lg px-3 py-2 text-xs">
      <p className="text-slate-400 mb-1">{label}</p>
      <p className="text-blue-400 font-semibold">{payload[0].value} completed</p>
    </div>
  );
}

export default function HabitsPage() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const last7Days = getLast7Days();
  const todayStr = formatDay(new Date());

  const fetchHabits = useCallback(async () => {
    try {
      const res = await fetch("/api/habits", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setHabits(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHabits();
  }, [fetchHabits]);

  async function toggleToday(habit: Habit) {
    setTogglingId(habit.id);
    try {
      const res = await fetch(`/api/habits/${habit.id}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ date: todayStr }),
      });
      if (res.ok) {
        fetchHabits();
      }
    } catch {
      // ignore
    } finally {
      setTogglingId(null);
    }
  }

  // Build chart data: last 30 days completion count
  const chartData = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    d.setHours(0, 0, 0, 0);
    const dateStr = formatDay(d);
    const completed = habits.reduce((acc, habit) => {
      const log = habit.logs.find((l) => l.date.startsWith(dateStr));
      return acc + (log?.completed ? 1 : 0);
    }, 0);
    return {
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      completed,
    };
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="px-4 py-5 md:px-6 md:py-6 max-w-5xl mx-auto pb-20 lg:pb-6">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm mb-5 transition-colors" style={{ color: "#3d5a7a" }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#7a9eff")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#3d5a7a")}>
        <ArrowLeft className="w-4 h-4" /> Dashboard
      </Link>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Habits</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {habits.length} active habit{habits.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Habit
        </button>
      </div>

      {habits.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="No habits yet"
          description="Start building your habits by adding your first one."
          ctaLabel="Add your first habit"
          onCtaClick={() => setShowModal(true)}
        />
      ) : (
        <>
          {/* Habit List with weekly grid */}
          <div className="space-y-3 mb-8">
            {habits.map((habit) => {
              const todayLog = habit.logs.find((l) =>
                l.date.startsWith(todayStr)
              );
              const todayDone = todayLog?.completed === true;
              const isToggling = togglingId === habit.id;

              return (
                <div
                  key={habit.id}
                  className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4"
                >
                  <div className="flex items-start gap-4">
                    {/* Color dot + info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: habit.color }}
                        />
                        <span className="font-medium text-slate-100 text-sm">
                          {habit.name}
                        </span>
                        <span className="text-slate-600 text-xs capitalize ml-1">
                          {habit.category}
                        </span>
                      </div>
                      {habit.description && (
                        <p className="text-slate-500 text-xs ml-5 mb-2">
                          {habit.description}
                        </p>
                      )}

                      {/* Weekly grid */}
                      <div className="flex gap-1.5 ml-5 mt-2">
                        {last7Days.map((day) => {
                          const dateStr = formatDay(day);
                          const log = habit.logs.find((l) =>
                            l.date.startsWith(dateStr)
                          );
                          const done = log?.completed === true;
                          const isToday = dateStr === todayStr;

                          return (
                            <div key={dateStr} className="flex flex-col items-center gap-1">
                              <span className="text-slate-600 text-xs">
                                {getDayLabel(day)}
                              </span>
                              <div
                                className={`w-6 h-6 rounded flex items-center justify-center ${
                                  done
                                    ? "bg-green-500/20 border border-green-500/40"
                                    : isToday
                                    ? "bg-[#1e293b] border border-[#334155] border-dashed"
                                    : "bg-[#0a0f1e] border border-[#1e293b]"
                                }`}
                              >
                                {done && (
                                  <div
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: habit.color }}
                                  />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Stats + toggle */}
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      {habit.streak > 0 && (
                        <div className="flex items-center gap-1 text-orange-400">
                          <Flame className="w-3.5 h-3.5" />
                          <span className="text-xs font-semibold">
                            {habit.streak}
                          </span>
                        </div>
                      )}
                      <div className="text-xs text-slate-500">
                        {Math.round(habit.completionRate * 100)}% rate
                      </div>
                      <button
                        onClick={() => toggleToday(habit)}
                        disabled={isToggling}
                        title={todayDone ? "Mark incomplete" : "Mark complete"}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          todayDone
                            ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                            : "bg-[#1e293b] text-slate-400 hover:bg-[#334155] hover:text-slate-100"
                        }`}
                      >
                        {isToggling ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : todayDone ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <Circle className="w-3.5 h-3.5" />
                        )}
                        {todayDone ? "Done" : "Mark Done"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Chart */}
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5">
            <h2 className="font-semibold text-slate-100 mb-4">
              Last 30 Days Completion
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={chartData}
                margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
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
                  interval={4}
                />
                <YAxis
                  tick={{ fill: "#475569", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="completed"
                  fill="#3b82f6"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {showModal && (
        <AddHabitModal
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            fetchHabits();
          }}
        />
      )}
    </div>
  );
}
