"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Save,
  CheckCircle2,
  AlertCircle,
  Moon,
  Sun,
  Dumbbell,
  Timer,
  Footprints,
  Brain,
  Monitor,
  ListChecks,
  Wallet,
  PiggyBank,
  Star,
  Loader2,
} from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import ScoreCard from "@/components/ScoreCard";
import { Activity, RefreshCw, DollarSign, ClipboardCheck } from "lucide-react";
import { type LucideIcon } from "lucide-react";

interface DailyEntryForm {
  date: string;
  sleepHours: number;
  workoutCompleted: boolean;
  sportsTrainingMinutes: number;
  steps: number;
  deepWorkHours: number;
  screenTimeHours: number;
  tasksPlanned: number;
  tasksCompleted: number;
  taskDifficultyRating: number;
  moneySpent: number;
  moneySaved: number;
  wakeTime: string;
  bedtime: string;
  notes: string;
  overallDayRating: number;
}

interface CategoryScores {
  physical: number;
  focus: number;
  consistency: number;
  financial: number;
  responsibility: number;
  overall: number;
}

const SCORE_ICONS: Record<keyof CategoryScores, LucideIcon> = {
  physical: Activity,
  focus: Brain,
  consistency: RefreshCw,
  financial: DollarSign,
  responsibility: ClipboardCheck,
  overall: Star,
};

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

function RatingButtons({
  value,
  max = 10,
  onChange,
}: {
  value: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors ${
            value === n
              ? "bg-blue-600 text-white"
              : "bg-[#1e293b] text-slate-400 hover:bg-[#334155] hover:text-slate-100"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? "bg-blue-600" : "bg-[#334155]"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function NumberInput({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  placeholder = "0",
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      value={value === 0 ? "" : value}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        onChange(isNaN(v) ? 0 : v);
      }}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      className="w-full bg-[#1e293b] border border-[#334155] text-slate-100 placeholder-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50"
    />
  );
}

function FormSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-blue-400" />
        <h3 className="font-semibold text-slate-100 text-sm">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  );
}

const defaultForm: DailyEntryForm = {
  date: getToday(),
  sleepHours: 0,
  workoutCompleted: false,
  sportsTrainingMinutes: 0,
  steps: 0,
  deepWorkHours: 0,
  screenTimeHours: 0,
  tasksPlanned: 0,
  tasksCompleted: 0,
  taskDifficultyRating: 0,
  moneySpent: 0,
  moneySaved: 0,
  wakeTime: "",
  bedtime: "",
  notes: "",
  overallDayRating: 0,
};

export default function EntryPage() {
  const [form, setForm] = useState<DailyEntryForm>({ ...defaultForm });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [scores, setScores] = useState<CategoryScores | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);

  const fetchTodayEntry = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/daily-entries", { credentials: "include" });
      if (res.ok) {
        const entries = await res.json();
        const today = getToday();
        const todayEntry = entries.find((e: { date: string; id: string }) =>
          e.date.startsWith(today)
        );
        if (todayEntry) {
          setExistingId(todayEntry.id);
          setForm({
            date: today,
            sleepHours: todayEntry.sleepHours ?? 0,
            workoutCompleted: todayEntry.workoutCompleted ?? false,
            sportsTrainingMinutes: todayEntry.sportsTrainingMinutes ?? 0,
            steps: todayEntry.steps ?? 0,
            deepWorkHours: todayEntry.deepWorkHours ?? 0,
            screenTimeHours: todayEntry.screenTimeHours ?? 0,
            tasksPlanned: todayEntry.tasksPlanned ?? 0,
            tasksCompleted: todayEntry.tasksCompleted ?? 0,
            taskDifficultyRating: todayEntry.taskDifficultyRating ?? 0,
            moneySpent: todayEntry.moneySpent ?? 0,
            moneySaved: todayEntry.moneySaved ?? 0,
            wakeTime: todayEntry.wakeTime ?? "",
            bedtime: todayEntry.bedtime ?? "",
            notes: todayEntry.notes ?? "",
            overallDayRating: todayEntry.overallDayRating ?? 0,
          });
          if (todayEntry.categoryScores?.length) {
            const s = todayEntry.categoryScores[0];
            setScores({
              physical: s.physical,
              focus: s.focus,
              consistency: s.consistency,
              financial: s.financial,
              responsibility: s.responsibility,
              overall: s.overall,
            });
          }
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTodayEntry();
  }, [fetchTodayEntry]);

  function setField<K extends keyof DailyEntryForm>(
    key: K,
    value: DailyEntryForm[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const payload = {
        date: form.date,
        sleepHours: form.sleepHours || null,
        workoutCompleted: form.workoutCompleted,
        sportsTrainingMinutes: form.sportsTrainingMinutes || null,
        steps: form.steps || null,
        deepWorkHours: form.deepWorkHours || null,
        screenTimeHours: form.screenTimeHours || null,
        tasksPlanned: form.tasksPlanned || null,
        tasksCompleted: form.tasksCompleted || null,
        taskDifficultyRating: form.taskDifficultyRating || null,
        moneySpent: form.moneySpent || null,
        moneySaved: form.moneySaved || null,
        wakeTime: form.wakeTime || null,
        bedtime: form.bedtime || null,
        notes: form.notes || null,
        overallDayRating: form.overallDayRating || null,
      };

      const res = await fetch("/api/daily-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save entry");
      }

      const data = await res.json();
      setExistingId(data.entry.id);
      if (data.scores) {
        setScores({
          physical: data.scores.physical,
          focus: data.scores.focus,
          consistency: data.scores.consistency,
          financial: data.scores.financial,
          responsibility: data.scores.responsibility,
          overall: data.scores.overall,
        });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Daily Entry</h1>
        <p className="text-slate-400 text-sm mt-1">
          {existingId ? "Update today's entry" : "Log your day"}
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 mb-5">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {saved && (
        <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3 mb-5">
          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
          <p className="text-green-400 text-sm">Entry saved successfully!</p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Date */}
        <div className="mb-5">
          <FormField label="Date">
            <input
              type="date"
              value={form.date}
              onChange={(e) => setField("date", e.target.value)}
              className="bg-[#1e293b] border border-[#334155] text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50"
            />
          </FormField>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Sleep & Physical */}
          <FormSection title="Sleep & Recovery" icon={Moon}>
            <div className="space-y-4">
              <FormField label={`Sleep Hours: ${form.sleepHours}h`}>
                <input
                  type="range"
                  min={0}
                  max={12}
                  step={0.5}
                  value={form.sleepHours}
                  onChange={(e) =>
                    setField("sleepHours", parseFloat(e.target.value))
                  }
                  className="w-full accent-blue-500"
                />
                <div className="flex justify-between text-xs text-slate-600">
                  <span>0h</span>
                  <span>6h</span>
                  <span>12h</span>
                </div>
              </FormField>
              <FormField label="Wake Time">
                <input
                  type="time"
                  value={form.wakeTime}
                  onChange={(e) => setField("wakeTime", e.target.value)}
                  className="w-full bg-[#1e293b] border border-[#334155] text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </FormField>
              <FormField label="Bedtime">
                <input
                  type="time"
                  value={form.bedtime}
                  onChange={(e) => setField("bedtime", e.target.value)}
                  className="w-full bg-[#1e293b] border border-[#334155] text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </FormField>
            </div>
          </FormSection>

          {/* Physical Activity */}
          <FormSection title="Physical Activity" icon={Dumbbell}>
            <div className="space-y-4">
              <FormField label="Workout Completed">
                <div className="flex items-center gap-3">
                  <Toggle
                    checked={form.workoutCompleted}
                    onChange={(v) => setField("workoutCompleted", v)}
                  />
                  <span className="text-sm text-slate-400">
                    {form.workoutCompleted ? "Yes" : "No"}
                  </span>
                </div>
              </FormField>
              <FormField label="Sports Training (minutes)">
                <NumberInput
                  value={form.sportsTrainingMinutes}
                  onChange={(v) => setField("sportsTrainingMinutes", v)}
                  min={0}
                  max={480}
                  placeholder="0"
                />
              </FormField>
              <FormField label="Steps (optional)">
                <div className="relative">
                  <Footprints className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="number"
                    value={form.steps === 0 ? "" : form.steps}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      setField("steps", isNaN(v) ? 0 : v);
                    }}
                    min={0}
                    placeholder="e.g. 8000"
                    className="w-full bg-[#1e293b] border border-[#334155] text-slate-100 placeholder-slate-600 rounded-lg pl-10 pr-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </FormField>
            </div>
          </FormSection>

          {/* Focus & Work */}
          <FormSection title="Focus & Work" icon={Brain}>
            <div className="space-y-4">
              <FormField label={`Deep Work Hours: ${form.deepWorkHours}h`}>
                <input
                  type="range"
                  min={0}
                  max={16}
                  step={0.5}
                  value={form.deepWorkHours}
                  onChange={(e) =>
                    setField("deepWorkHours", parseFloat(e.target.value))
                  }
                  className="w-full accent-blue-500"
                />
                <div className="flex justify-between text-xs text-slate-600">
                  <span>0h</span>
                  <span>8h</span>
                  <span>16h</span>
                </div>
              </FormField>
              <FormField label={`Screen Time: ${form.screenTimeHours}h`}>
                <input
                  type="range"
                  min={0}
                  max={16}
                  step={0.5}
                  value={form.screenTimeHours}
                  onChange={(e) =>
                    setField("screenTimeHours", parseFloat(e.target.value))
                  }
                  className="w-full accent-blue-500"
                />
                <div className="flex justify-between text-xs text-slate-600">
                  <span>0h</span>
                  <span>8h</span>
                  <span>16h</span>
                </div>
              </FormField>
            </div>
          </FormSection>

          {/* Tasks */}
          <FormSection title="Tasks & Productivity" icon={ListChecks}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Tasks Planned">
                  <NumberInput
                    value={form.tasksPlanned}
                    onChange={(v) => setField("tasksPlanned", v)}
                    min={0}
                    placeholder="0"
                  />
                </FormField>
                <FormField label="Tasks Completed">
                  <NumberInput
                    value={form.tasksCompleted}
                    onChange={(v) => setField("tasksCompleted", v)}
                    min={0}
                    placeholder="0"
                  />
                </FormField>
              </div>
              <FormField label="Task Difficulty (1-10)">
                <RatingButtons
                  value={form.taskDifficultyRating}
                  onChange={(v) => setField("taskDifficultyRating", v)}
                />
              </FormField>
            </div>
          </FormSection>

          {/* Finance */}
          <FormSection title="Finance" icon={Wallet}>
            <div className="space-y-4">
              <FormField label="Money Spent ($)">
                <div className="relative">
                  <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="number"
                    value={form.moneySpent === 0 ? "" : form.moneySpent}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setField("moneySpent", isNaN(v) ? 0 : v);
                    }}
                    min={0}
                    step={0.01}
                    placeholder="0.00"
                    className="w-full bg-[#1e293b] border border-[#334155] text-slate-100 placeholder-slate-600 rounded-lg pl-10 pr-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </FormField>
              <FormField label="Money Saved ($)">
                <div className="relative">
                  <PiggyBank className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="number"
                    value={form.moneySaved === 0 ? "" : form.moneySaved}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setField("moneySaved", isNaN(v) ? 0 : v);
                    }}
                    min={0}
                    step={0.01}
                    placeholder="0.00"
                    className="w-full bg-[#1e293b] border border-[#334155] text-slate-100 placeholder-slate-600 rounded-lg pl-10 pr-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </FormField>
            </div>
          </FormSection>

          {/* Day Rating */}
          <FormSection title="Day Rating" icon={Star}>
            <div className="space-y-4">
              <FormField label="Overall Day Rating (1-10)">
                <RatingButtons
                  value={form.overallDayRating}
                  onChange={(v) => setField("overallDayRating", v)}
                />
              </FormField>
            </div>
          </FormSection>
        </div>

        {/* Notes */}
        <div className="mt-5 bg-[#0f172a] border border-[#1e293b] rounded-xl p-5">
          <FormField label="Notes / Reflections">
            <textarea
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              rows={4}
              placeholder="How was your day? Any reflections or thoughts..."
              className="w-full bg-[#1e293b] border border-[#334155] text-slate-100 placeholder-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 resize-none"
            />
          </FormField>
        </div>

        {/* Submit */}
        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-6 py-2.5 rounded-lg text-sm transition-colors"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {existingId ? "Update Entry" : "Save Entry"}
              </>
            )}
          </button>
        </div>
      </form>

      {/* Scores after saving */}
      {scores && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">
            Calculated Scores
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {(
              Object.entries(scores) as [keyof CategoryScores, number][]
            ).map(([key, value]) => {
              const labels: Record<keyof CategoryScores, string> = {
                physical: "Physical",
                focus: "Focus",
                consistency: "Consistency",
                financial: "Financial",
                responsibility: "Responsibility",
                overall: "Overall",
              };
              return (
                <ScoreCard
                  key={key}
                  title={labels[key]}
                  score={value}
                  trend="stable"
                  icon={SCORE_ICONS[key]}
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
