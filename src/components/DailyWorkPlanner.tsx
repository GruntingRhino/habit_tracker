"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Brain,
  ChevronDown,
  Clock3,
  Loader2,
  Sparkles,
  Utensils,
  Zap,
} from "lucide-react";

interface DayPlanResponse {
  headline: string;
  summary: string;
  contextNotices?: string[];
  priorityOrder: string[];
  scheduleBlocks: Array<{
    time: string;
    title: string;
    detail: string;
  }>;
  mealGuidance: string[];
  executionRules: string[];
  followUpQuestions: string[];
}

const START_TIME_OPTIONS = [
  "05:00",
  "05:30",
  "06:00",
  "06:30",
  "07:00",
  "07:30",
  "08:00",
  "08:30",
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "12:00",
  "12:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
  "17:30",
  "18:00",
  "18:30",
  "19:00",
  "19:30",
  "20:00",
  "20:30",
  "21:00",
];

const START_HOUR_OPTIONS = Array.from({ length: 17 }, (_, index) => index + 5);
const START_MINUTE_OPTIONS = [0, 30];

function formatStartTimeLabel(value: string) {
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute.toString().padStart(2, "0")} ${suffix}`;
}

function formatHourOptionLabel(value: number) {
  const suffix = value >= 12 ? "PM" : "AM";
  const displayHour = value % 12 || 12;
  return `${displayHour} ${suffix}`;
}

function parseStartTime(value: string) {
  const [hourText, minuteText] = value.split(":");
  return {
    hour: Number(hourText),
    minute: Number(minuteText),
  };
}

export default function DailyWorkPlanner() {
  const [freeTimeHours, setFreeTimeHours] = useState("3");
  const [startTime, setStartTime] = useState("08:00");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftStartTime, setDraftStartTime] = useState("08:00");
  const [energyLevel, setEnergyLevel] = useState<"low" | "medium" | "high">("medium");
  const [bigThing, setBigThing] = useState("");
  const [fixedCommitments, setFixedCommitments] = useState("");
  const [planningNotes, setPlanningNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<DayPlanResponse | null>(null);
  const hourColumnRef = useRef<HTMLDivElement | null>(null);
  const minuteColumnRef = useRef<HTMLDivElement | null>(null);

  const draftHour = parseStartTime(draftStartTime).hour;
  const draftMinute = parseStartTime(draftStartTime).minute;

  useEffect(() => {
    if (!pickerOpen) return;

    const hourSelected = hourColumnRef.current?.querySelector<HTMLButtonElement>(
      `[data-hour="${draftHour}"]`
    );
    const minuteSelected = minuteColumnRef.current?.querySelector<HTMLButtonElement>(
      `[data-minute="${draftMinute}"]`
    );

    hourSelected?.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
    minuteSelected?.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
  }, [draftHour, draftMinute, pickerOpen]);

  function updateDraftStartTime(hour: number, minute: number) {
    setDraftStartTime(
      `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`
    );
  }

  function openPicker() {
    setDraftStartTime(startTime);
    setPickerOpen(true);
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/day-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          freeTimeHours: freeTimeHours ? Number(freeTimeHours) : undefined,
          startTime: startTime || undefined,
          energyLevel,
          bigThing: bigThing.trim() || undefined,
          fixedCommitments: fixedCommitments.trim() || undefined,
          planningNotes: planningNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to build plan");
      }

      setPlan(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to build plan");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
        <p className="text-sm leading-6 text-amber-100">
          If these results do not line up with your goals, values, or constraints, update{" "}
          <Link href="/settings#context" className="font-semibold text-amber-300 underline underline-offset-4 transition-colors hover:text-amber-200">
            Settings &gt; Context
          </Link>
          .
        </p>
      </div>

      <div className="rounded-3xl border border-[#1f2937] bg-[#0f172a] p-5 md:p-6">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-300">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-100">Plan Today with AI</p>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              This uses your current plans, notes, meals, habits, and recent activity to map the day before it gets noisy.
            </p>
          </div>
        </div>

        <form onSubmit={handleGenerate} className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Free time today
                </label>
                <input
                  type="number"
                  min="0"
                  max="16"
                  step="0.5"
                  value={freeTimeHours}
                  onChange={(event) => setFreeTimeHours(event.target.value)}
                  className="w-full rounded-xl border border-[#334155] bg-[#111827] px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Start time
                </label>
                <button
                  type="button"
                  onClick={openPicker}
                  className="flex w-full items-center justify-between rounded-xl border border-[#334155] bg-[#111827] px-3 py-2.5 text-left text-sm text-slate-100 transition-colors hover:border-[#475569] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                >
                  <span>{formatStartTimeLabel(startTime)}</span>
                  <ChevronDown className="h-4 w-4 text-slate-500" />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Do you have anything big today?
              </label>
              <textarea
                rows={3}
                value={bigThing}
                onChange={(event) => setBigThing(event.target.value)}
                placeholder="Interview, exam, workout block, deadline, family event, travel, practice, meeting..."
                className="w-full resize-none rounded-xl border border-[#334155] bg-[#111827] px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Fixed commitments
              </label>
              <textarea
                rows={3}
                value={fixedCommitments}
                onChange={(event) => setFixedCommitments(event.target.value)}
                placeholder="School 8-3, practice 5-6:30, meeting at 11, pickup at 4..."
                className="w-full resize-none rounded-xl border border-[#334155] bg-[#111827] px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Energy level
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["low", "Low", "Keep it realistic."],
                  ["medium", "Medium", "Normal working day."],
                  ["high", "High", "Push the big work."],
                ].map(([value, label, body]) => {
                  const active = energyLevel === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setEnergyLevel(value as "low" | "medium" | "high")}
                      className="rounded-2xl border px-3 py-3 text-left transition-all"
                      style={{
                        borderColor: active ? "rgba(59,130,246,0.5)" : "rgba(51,65,85,1)",
                        background: active ? "rgba(59,130,246,0.12)" : "rgba(15,23,42,0.9)",
                      }}
                    >
                      <p className="text-sm font-semibold text-slate-100">{label}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">{body}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Extra context
              </label>
              <textarea
                rows={6}
                value={planningNotes}
                onChange={(event) => setPlanningNotes(event.target.value)}
                placeholder="Sleep was rough, need to leave early, want a heavy workout, need low-friction meals, need two deep work blocks..."
                className="w-full resize-none rounded-xl border border-[#334155] bg-[#111827] px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Build today&apos;s plan
            </button>
          </div>
        </form>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-400" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {plan && (
        <div className="space-y-5">
          {plan.contextNotices && plan.contextNotices.length > 0 && (
            <section className="rounded-3xl border border-amber-500/20 bg-amber-500/10 p-5">
              <div className="mb-4 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-300" />
                <p className="text-sm font-semibold text-amber-100">Plan assumptions</p>
              </div>
              <div className="space-y-3">
                {plan.contextNotices.map((item, index) => (
                  <div
                    key={`${item}-${index}`}
                    className="rounded-2xl border border-amber-500/15 bg-[#120f08] px-4 py-3 text-sm leading-6 text-amber-50"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="rounded-3xl border border-blue-500/20 bg-blue-500/10 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
              Today&apos;s direction
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-100">{plan.headline}</h2>
            <p className="mt-3 text-sm leading-6 text-blue-100">{plan.summary}</p>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-3xl border border-[#1f2937] bg-[#0f172a] p-5">
              <div className="mb-4 flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-300" />
                <p className="text-sm font-semibold text-slate-100">Priority Order</p>
              </div>
              <div className="space-y-3">
                {plan.priorityOrder.map((item, index) => (
                  <div key={`${item}-${index}`} className="rounded-2xl border border-[#1f2937] bg-[#020617] px-4 py-3 text-sm text-slate-200">
                    <span className="mr-2 text-slate-500">{index + 1}.</span>
                    {item}
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-[#1f2937] bg-[#0f172a] p-5">
              <div className="mb-4 flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-blue-300" />
                <p className="text-sm font-semibold text-slate-100">Suggested Schedule</p>
              </div>
              <div className="space-y-3">
                {plan.scheduleBlocks.map((block, index) => (
                  <div key={`${block.time}-${index}`} className="rounded-2xl border border-[#1f2937] bg-[#020617] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {block.time}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-100">{block.title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{block.detail}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <section className="rounded-3xl border border-[#1f2937] bg-[#0f172a] p-5">
              <div className="mb-4 flex items-center gap-2">
                <Utensils className="h-4 w-4 text-emerald-300" />
                <p className="text-sm font-semibold text-slate-100">Meals</p>
              </div>
              <div className="space-y-3">
                {plan.mealGuidance.map((item, index) => (
                  <div key={`${item}-${index}`} className="rounded-2xl border border-[#1f2937] bg-[#020617] px-4 py-3 text-sm leading-6 text-slate-300">
                    {item}
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-[#1f2937] bg-[#0f172a] p-5">
              <div className="mb-4 flex items-center gap-2">
                <Brain className="h-4 w-4 text-violet-300" />
                <p className="text-sm font-semibold text-slate-100">Execution Rules</p>
              </div>
              <div className="space-y-3">
                {plan.executionRules.map((item, index) => (
                  <div key={`${item}-${index}`} className="rounded-2xl border border-[#1f2937] bg-[#020617] px-4 py-3 text-sm leading-6 text-slate-300">
                    {item}
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-[#1f2937] bg-[#0f172a] p-5">
              <div className="mb-4 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-rose-300" />
                <p className="text-sm font-semibold text-slate-100">Questions to settle early</p>
              </div>
              <div className="space-y-3">
                {plan.followUpQuestions.map((item, index) => (
                  <div key={`${item}-${index}`} className="rounded-2xl border border-[#1f2937] bg-[#020617] px-4 py-3 text-sm leading-6 text-slate-300">
                    {item}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}

      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70 px-4 py-6 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="w-full max-w-xl rounded-[28px] border border-[rgba(120,145,220,0.18)] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0)),#0f1525] p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Start time
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-100">
                  {formatStartTimeLabel(draftStartTime)}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Set the first real working block for today.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Hour
                </p>
                <div
                  ref={hourColumnRef}
                  className="h-64 space-y-2 overflow-y-auto rounded-3xl border border-[#1f2937] bg-[#08111f] p-3"
                >
                  {START_HOUR_OPTIONS.map((hour) => {
                    const active = draftHour === hour;
                    return (
                      <button
                        key={hour}
                        type="button"
                        data-hour={hour}
                        onClick={() => updateDraftStartTime(hour, draftMinute)}
                        className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition-all ${
                          active
                            ? "bg-blue-600 text-white shadow-[0_10px_30px_-18px_rgba(59,130,246,0.9)]"
                            : "bg-[#0f172a] text-slate-300 hover:bg-[#132033]"
                        }`}
                      >
                        <span className="text-base font-semibold">
                          {formatHourOptionLabel(hour)}
                        </span>
                        <span className={`text-xs uppercase tracking-[0.18em] ${active ? "text-blue-100" : "text-slate-500"}`}>
                          hour
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Minutes
                </p>
                <div
                  ref={minuteColumnRef}
                  className="h-64 space-y-2 overflow-y-auto rounded-3xl border border-[#1f2937] bg-[#08111f] p-3"
                >
                  {START_MINUTE_OPTIONS.map((minute) => {
                    const active = draftMinute === minute;
                    return (
                      <button
                        key={minute}
                        type="button"
                        data-minute={minute}
                        onClick={() => updateDraftStartTime(draftHour, minute)}
                        className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition-all ${
                          active
                            ? "bg-blue-600 text-white shadow-[0_10px_30px_-18px_rgba(59,130,246,0.9)]"
                            : "bg-[#0f172a] text-slate-300 hover:bg-[#132033]"
                        }`}
                      >
                        <span className="text-base font-semibold">
                          {minute.toString().padStart(2, "0")}
                        </span>
                        <span className={`text-xs uppercase tracking-[0.18em] ${active ? "text-blue-100" : "text-slate-500"}`}>
                          min
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-300 transition-colors hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (START_TIME_OPTIONS.includes(draftStartTime)) {
                    setStartTime(draftStartTime);
                  }
                  setPickerOpen(false);
                }}
                className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                Use this time
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
