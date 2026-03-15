"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  AlertCircle,
  Bot,
  Brain,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  DollarSign,
  Dumbbell,
  Footprints,
  Loader2,
  Moon,
  Save,
  Send,
  Sparkles,
  Star,
  Wallet,
} from "lucide-react";
import { type LucideIcon } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import ScoreCard from "@/components/ScoreCard";
import {
  assessWorkout,
  type WorkoutIntensity,
  type WorkoutAssessment,
} from "@/lib/workout";

interface WeightRoutine {
  id: string;
  name: string;
}

interface CoachMessage {
  role: "user" | "assistant";
  content: string;
}

function DailyCoachChat() {
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!initialized) {
      setInitialized(true);
      void sendMessage(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(userText: string | null) {
    const newMessages: CoachMessage[] = userText
      ? [...messages, { role: "user" as const, content: userText }]
      : [{ role: "user" as const, content: "Give me a quick assessment of my day and the most important thing I should focus on tomorrow." }];

    if (userText) setMessages(newMessages);
    setLoading(true);
    try {
      const res = await fetch("/api/chat/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json() as { message: string };
      const assistantMsg: CoachMessage = { role: "assistant", content: data.message };
      setMessages((prev) => {
        const base = userText ? prev : [];
        return [...base, assistantMsg];
      });
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Failed to connect to the AI coach. Check your connection." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    void sendMessage(text);
  }

  return (
    <section className="mt-8">
      <div className="mb-4 flex items-center gap-2">
        <Bot className="h-4 w-4 text-blue-300" />
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          Daily Coach
        </h2>
      </div>
      <div className="rounded-3xl border border-[#1f2937] bg-[#0a0f1a] overflow-hidden">
        <div className="h-80 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 && !loading && (
            <p className="text-sm text-slate-500 italic">Starting session...</p>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} gap-3`}>
              {msg.role === "assistant" && (
                <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-300">
                  <Bot className="h-3.5 w-3.5" />
                </div>
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "assistant"
                    ? "rounded-tl-md border border-[#1f2937] bg-[#0f172a] text-slate-100"
                    : "rounded-tr-md bg-blue-600 text-white"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start gap-3">
              <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-300">
                <Bot className="h-3.5 w-3.5" />
              </div>
              <div className="rounded-2xl rounded-tl-md border border-[#1f2937] bg-[#0f172a] px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-blue-300" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <div className="border-t border-[#1f2937] p-4 flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Ask your coach anything about today..."
            disabled={loading}
            className="flex-1 rounded-xl border border-[#334155] bg-[#111827] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/40 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}

interface DailyEntryForm {
  date: string;
  sleepHours: number;
  workoutCompleted: boolean;
  workoutRoutineName: string;
  workoutDurationMinutes: number;
  workoutIntensity: WorkoutIntensity | "";
  workoutDetails: string;
  sportsTrainingMinutes: number;
  steps: number;
  deepWorkHours: number;
  screenTimeHours: number;
  tasksPlanned: number;
  tasksCompleted: number;
  taskDifficultyRating: number;
  moneySpent: number;
  moneySaved: number;
  incomeActivity: boolean;
  caloriesEaten: number;
  rightWithGod: boolean;
  wakeTime: string;
  bedtime: string;
  notes: string;
  overallDayRating: number;
}

interface CategoryScores {
  physical: number;
  focus: number;
  discipline: number;
  financial: number;
  mental: number;
  appearance: number;
  overall: number;
}

type StepId =
  | "date"
  | "sleep"
  | "workout"
  | "conditioning"
  | "movement"
  | "focus"
  | "tasks"
  | "finance"
  | "reflection";

const STEP_ORDER: StepId[] = [
  "date",
  "sleep",
  "workout",
  "conditioning",
  "movement",
  "focus",
  "tasks",
  "finance",
  "reflection",
];

const CUSTOM_WORKOUT_VALUE = "__custom__";

const SCORE_ICONS: Record<keyof CategoryScores, LucideIcon> = {
  physical: Activity,
  focus: Brain,
  discipline: Sparkles,
  financial: DollarSign,
  mental: Sparkles,
  appearance: Star,
  overall: Star,
};

const SCORE_LABELS: Record<keyof CategoryScores, string> = {
  physical: "Physical",
  focus: "Focus",
  discipline: "Discipline",
  financial: "Financial",
  mental: "Mental",
  appearance: "Appearance",
  overall: "Overall",
};

const STEP_META: Record<
  StepId,
  { title: string; prompt: string; hint: string; icon: LucideIcon }
> = {
  date: {
    title: "Date",
    prompt: "Which day are we scoring?",
    hint: "Entries are stored per day. Change the date only if you are backfilling.",
    icon: CalendarDays,
  },
  sleep: {
    title: "Sleep",
    prompt: "How did sleep and recovery look?",
    hint: "The scorer is strict here: under 6 hours gets almost nothing.",
    icon: Moon,
  },
  workout: {
    title: "Workout",
    prompt: "Did you actually train today?",
    hint: "Named routines are not automatic credit anymore. Duration, intensity, and detail drive the score.",
    icon: Dumbbell,
  },
  conditioning: {
    title: "Extra Training",
    prompt: "How much extra sport or conditioning did you do beyond the main workout?",
    hint: "Only structured extra training belongs here.",
    icon: Activity,
  },
  movement: {
    title: "Movement",
    prompt: "How was movement and nutrition tracking?",
    hint: "Steps and calorie awareness still feed appearance scoring.",
    icon: Footprints,
  },
  focus: {
    title: "Focus",
    prompt: "How much real focus did you get?",
    hint: "Deep work matters more than busyness. High screen time still hurts.",
    icon: Brain,
  },
  tasks: {
    title: "Execution",
    prompt: "What did execution look like?",
    hint: "Task completion feeds discipline and focus.",
    icon: Sparkles,
  },
  finance: {
    title: "Finance",
    prompt: "How disciplined were you financially?",
    hint: "Income-generating activity is the main lever here.",
    icon: Wallet,
  },
  reflection: {
    title: "Reflection",
    prompt: "How are you grading the day overall?",
    hint: "Be harsh. A 9 or 10 should be rare.",
    icon: Star,
  },
};

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTime(value: string): string {
  if (!value) return "not logged";
  const [hours, minutes] = value.split(":");
  const hour = Number(hours);
  if (Number.isNaN(hour)) return value;
  const suffix = hour >= 12 ? "PM" : "AM";
  const normalizedHour = hour % 12 || 12;
  return `${normalizedHour}:${minutes} ${suffix}`;
}

function RatingButtons({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: 10 }, (_, index) => index + 1).map((rating) => (
        <button
          key={rating}
          type="button"
          onClick={() => onChange(rating)}
          className={`h-10 w-10 rounded-xl border text-sm font-semibold transition-colors ${
            value === rating
              ? "border-blue-500 bg-blue-600 text-white"
              : "border-[#334155] bg-[#111827] text-slate-300 hover:border-[#475569] hover:text-white"
          }`}
        >
          {rating}
        </button>
      ))}
    </div>
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
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      value={value === 0 ? "" : value}
      onChange={(event) => {
        const parsed = parseFloat(event.target.value);
        onChange(Number.isNaN(parsed) ? 0 : parsed);
      }}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      className="w-full rounded-xl border border-[#334155] bg-[#111827] px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
    />
  );
}

function ChoiceCard({
  active,
  onClick,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-4 text-left transition-colors ${
        active
          ? "border-blue-500 bg-blue-500/10"
          : "border-[#334155] bg-[#111827] hover:border-[#475569]"
      }`}
    >
      <div className="mb-2 flex items-center gap-3">
        <div
          className={`flex h-5 w-5 items-center justify-center rounded-md ${
            active ? "bg-blue-500" : "bg-[#1f2937]"
          }`}
        >
          {active && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
        </div>
        <p className="text-sm font-semibold text-slate-100">{title}</p>
      </div>
      <p className="text-sm text-slate-400">{description}</p>
    </button>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
      {children}
    </label>
  );
}

function AssistantMessage({
  stepId,
}: {
  stepId: StepId;
}) {
  const { title, prompt, hint, icon: Icon } = STEP_META[stepId];

  return (
    <div className="flex gap-3">
      <div className="mt-1 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-blue-500/30 bg-blue-500/10 text-blue-300">
        <Icon className="h-4 w-4" />
      </div>
      <div className="max-w-2xl rounded-3xl rounded-tl-md border border-[#1f2937] bg-[#0f172a] px-5 py-4">
        <div className="mb-2 flex items-center gap-2">
          <Bot className="h-4 w-4 text-blue-300" />
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">
            {title}
          </p>
        </div>
        <p className="text-base font-semibold text-slate-100">{prompt}</p>
        <p className="mt-2 text-sm text-slate-400">{hint}</p>
      </div>
    </div>
  );
}

function UserAnswer({
  lines,
  onEdit,
}: {
  lines: string[];
  onEdit: () => void;
}) {
  return (
    <div className="flex justify-end">
      <div className="max-w-2xl rounded-3xl rounded-tr-md border border-emerald-500/20 bg-emerald-500/10 px-5 py-4">
        <div className="mb-2 flex items-center justify-between gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
            Your answer
          </p>
          <button
            type="button"
            onClick={onEdit}
            className="text-xs font-semibold text-emerald-300 transition-colors hover:text-emerald-200"
          >
            Edit
          </button>
        </div>
        <div className="space-y-1.5">
          {lines.map((line) => (
            <p key={line} className="text-sm text-emerald-50">
              {line}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

const defaultForm: DailyEntryForm = {
  date: getToday(),
  sleepHours: 0,
  workoutCompleted: false,
  workoutRoutineName: "",
  workoutDurationMinutes: 0,
  workoutIntensity: "",
  workoutDetails: "",
  sportsTrainingMinutes: 0,
  steps: 0,
  deepWorkHours: 0,
  screenTimeHours: 0,
  tasksPlanned: 0,
  tasksCompleted: 0,
  taskDifficultyRating: 0,
  moneySpent: 0,
  moneySaved: 0,
  incomeActivity: false,
  caloriesEaten: 0,
  rightWithGod: false,
  wakeTime: "",
  bedtime: "",
  notes: "",
  overallDayRating: 0,
};

function buildStepDraft(stepId: StepId, form: DailyEntryForm): Record<string, unknown> {
  switch (stepId) {
    case "date":
      return { date: form.date };
    case "sleep":
      return {
        sleepHours: form.sleepHours,
        wakeTime: form.wakeTime,
        bedtime: form.bedtime,
      };
    case "workout":
      return {
        workoutCompleted: form.workoutCompleted,
        workoutSelection: form.workoutCompleted
          ? form.workoutDetails
            ? CUSTOM_WORKOUT_VALUE
            : form.workoutRoutineName
          : "",
        customWorkoutName: form.workoutDetails ? form.workoutRoutineName : "",
        workoutDetails: form.workoutDetails,
        workoutDurationMinutes: form.workoutDurationMinutes,
        workoutIntensity: form.workoutIntensity,
      };
    case "conditioning":
      return {
        sportsTrainingMinutes: form.sportsTrainingMinutes,
      };
    case "movement":
      return {
        steps: form.steps,
        caloriesEaten: form.caloriesEaten,
      };
    case "focus":
      return {
        deepWorkHours: form.deepWorkHours,
        screenTimeHours: form.screenTimeHours,
      };
    case "tasks":
      return {
        tasksPlanned: form.tasksPlanned,
        tasksCompleted: form.tasksCompleted,
        taskDifficultyRating: form.taskDifficultyRating,
      };
    case "finance":
      return {
        incomeActivity: form.incomeActivity,
        moneySpent: form.moneySpent,
        moneySaved: form.moneySaved,
      };
    case "reflection":
      return {
        overallDayRating: form.overallDayRating,
        rightWithGod: form.rightWithGod,
        notes: form.notes,
      };
  }
}

function summarizeAnswer(
  stepId: StepId,
  form: DailyEntryForm
): string[] {
  switch (stepId) {
    case "date":
      return [`Scoring date: ${form.date}`];
    case "sleep":
      return [
        `${form.sleepHours}h sleep`,
        `Wake time: ${formatTime(form.wakeTime)}`,
        `Bedtime: ${formatTime(form.bedtime)}`,
      ];
    case "workout": {
      if (!form.workoutCompleted) {
        return ["No workout logged today."];
      }
      const workout = assessWorkout(form);
      return [
        `Workout: ${form.workoutRoutineName}`,
        `${form.workoutDurationMinutes} min, ${form.workoutIntensity} effort`,
        workout.summary,
      ];
    }
    case "conditioning":
      return form.sportsTrainingMinutes > 0
        ? [`Extra training: ${form.sportsTrainingMinutes} min`]
        : ["No extra sport or conditioning beyond the main workout."];
    case "movement":
      return [
        `Steps: ${form.steps.toLocaleString()}`,
        form.caloriesEaten > 0
          ? `Calories tracked: ${form.caloriesEaten}`
          : "Calories not logged.",
      ];
    case "focus":
      return [
        `Deep work: ${form.deepWorkHours}h`,
        `Screen time: ${form.screenTimeHours}h`,
      ];
    case "tasks":
      return [
        `Tasks: ${form.tasksCompleted}/${form.tasksPlanned}`,
        form.taskDifficultyRating > 0
          ? `Difficulty: ${form.taskDifficultyRating}/10`
          : "Difficulty not rated.",
      ];
    case "finance":
      return [
        form.incomeActivity
          ? "Income-generating activity: yes"
          : "Income-generating activity: no",
        `Spent: ${formatMoney(form.moneySpent)}`,
        `Saved: ${formatMoney(form.moneySaved)}`,
      ];
    case "reflection":
      return [
        form.overallDayRating > 0
          ? `Day rating: ${form.overallDayRating}/10`
          : "Day rating not set.",
        form.rightWithGod ? "Right with God: yes" : "Right with God: no",
        form.notes ? `Notes: ${form.notes}` : "No reflection notes added.",
      ];
  }
}

export default function EntryPage() {
  const [form, setForm] = useState<DailyEntryForm>({ ...defaultForm });
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [stepError, setStepError] = useState("");
  const [scores, setScores] = useState<CategoryScores | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [routines, setRoutines] = useState<WeightRoutine[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const currentStepId = STEP_ORDER[currentStepIndex] ?? null;
  const progress = Math.round(
    (Math.min(currentStepIndex, STEP_ORDER.length) / STEP_ORDER.length) * 100
  );
  const flowComplete = currentStepIndex >= STEP_ORDER.length;

  const fetchTodayEntry = useCallback(async () => {
    setLoading(true);
    try {
      const [entriesRes, routinesRes] = await Promise.all([
        fetch("/api/daily-entries", { credentials: "include" }),
        fetch("/api/weights/routines", { credentials: "include" }),
      ]);

      if (routinesRes.ok) {
        const data = await routinesRes.json();
        setRoutines(data);
      }

      if (entriesRes.ok) {
        const entries = await entriesRes.json();
        const today = getToday();
        const todayEntry = entries.find((entry: { date: string; id: string }) =>
          entry.date.startsWith(today)
        );

        if (todayEntry) {
          setExistingId(todayEntry.id);
          setForm({
            date: today,
            sleepHours: todayEntry.sleepHours ?? 0,
            workoutCompleted: todayEntry.workoutCompleted ?? false,
            workoutRoutineName: todayEntry.workoutRoutineName ?? "",
            workoutDurationMinutes: todayEntry.workoutDurationMinutes ?? 0,
            workoutIntensity: todayEntry.workoutIntensity ?? "",
            workoutDetails: todayEntry.workoutDetails ?? "",
            sportsTrainingMinutes: todayEntry.sportsTrainingMinutes ?? 0,
            steps: todayEntry.steps ?? 0,
            deepWorkHours: todayEntry.deepWorkHours ?? 0,
            screenTimeHours: todayEntry.screenTimeHours ?? 0,
            tasksPlanned: todayEntry.tasksPlanned ?? 0,
            tasksCompleted: todayEntry.tasksCompleted ?? 0,
            taskDifficultyRating: todayEntry.taskDifficultyRating ?? 0,
            moneySpent: todayEntry.moneySpent ?? 0,
            moneySaved: todayEntry.moneySaved ?? 0,
            incomeActivity: todayEntry.incomeActivity ?? false,
            caloriesEaten: todayEntry.caloriesEaten ?? 0,
            rightWithGod: todayEntry.rightWithGod ?? false,
            wakeTime: todayEntry.wakeTime ?? "",
            bedtime: todayEntry.bedtime ?? "",
            notes: todayEntry.notes ?? "",
            overallDayRating: todayEntry.overallDayRating ?? 0,
          });
          setCurrentStepIndex(STEP_ORDER.length);

          if (todayEntry.categoryScores?.length) {
            const score = todayEntry.categoryScores[0];
            setScores({
              physical: score.physical,
              focus: score.focus,
              discipline: score.discipline,
              financial: score.financial,
              mental: score.mental,
              appearance: score.appearance,
              overall: score.overall,
            });
          }
        }
      }
    } catch {
      // Ignore initial fetch failures and let the user fill manually.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTodayEntry();
  }, [fetchTodayEntry]);

  useEffect(() => {
    if (!currentStepId) return;
    setDraft(buildStepDraft(currentStepId, form));
    setStepError("");
  }, [currentStepId, form]);

  function setDraftField(key: string, value: unknown) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function getString(key: string): string {
    return typeof draft[key] === "string" ? (draft[key] as string) : "";
  }

  function getNumber(key: string): number {
    return typeof draft[key] === "number" ? (draft[key] as number) : 0;
  }

  function getBoolean(key: string): boolean {
    return draft[key] === true;
  }

  function buildWorkoutPreview(): WorkoutAssessment {
    const workoutCompleted = getBoolean("workoutCompleted");
    if (!workoutCompleted) {
      return assessWorkout({ workoutCompleted: false });
    }

    const workoutSelection = getString("workoutSelection");
    const customWorkoutName = getString("customWorkoutName");
    const routineName =
      workoutSelection === CUSTOM_WORKOUT_VALUE
        ? customWorkoutName
        : workoutSelection;

    return assessWorkout({
      workoutCompleted,
      workoutRoutineName: routineName,
      workoutDurationMinutes: getNumber("workoutDurationMinutes"),
      workoutIntensity: getString("workoutIntensity"),
      workoutDetails:
        workoutSelection === CUSTOM_WORKOUT_VALUE
          ? getString("workoutDetails")
          : "",
    });
  }

  function validateCurrentStep(): string | null {
    if (!currentStepId) return null;

    switch (currentStepId) {
      case "date":
        return getString("date") ? null : "Date is required.";
      case "sleep":
        return getNumber("sleepHours") > 0
          ? null
          : "Sleep hours are required.";
      case "workout": {
        if (!getBoolean("workoutCompleted")) return null;

        const workoutSelection = getString("workoutSelection");
        const customWorkoutName = getString("customWorkoutName").trim();
        const workoutDetails = getString("workoutDetails").trim();
        const workoutDurationMinutes = getNumber("workoutDurationMinutes");
        const workoutIntensity = getString("workoutIntensity");

        if (!workoutSelection) {
          return "Choose a routine or switch to Other / custom.";
        }
        if (
          workoutSelection === CUSTOM_WORKOUT_VALUE &&
          customWorkoutName.length === 0
        ) {
          return "Custom workouts need a short name.";
        }
        if (
          workoutSelection === CUSTOM_WORKOUT_VALUE &&
          workoutDetails.length < 8
        ) {
          return "Describe the custom workout clearly so it can be graded.";
        }
        if (workoutDurationMinutes < 10) {
          return "A workout needs at least 10 minutes to count.";
        }
        if (!workoutIntensity) {
          return "Select the workout intensity.";
        }
        return null;
      }
      case "conditioning":
      case "movement":
      case "focus":
      case "tasks":
      case "finance":
        return null;
      case "reflection":
        return getNumber("overallDayRating") > 0
          ? null
          : "Rate the day before saving.";
    }
  }

  function applyCurrentStep() {
    if (!currentStepId) return;

    setForm((current) => {
      switch (currentStepId) {
        case "date":
          return {
            ...current,
            date: getString("date"),
          };
        case "sleep":
          return {
            ...current,
            sleepHours: getNumber("sleepHours"),
            wakeTime: getString("wakeTime"),
            bedtime: getString("bedtime"),
          };
        case "workout": {
          const workoutCompleted = getBoolean("workoutCompleted");
          if (!workoutCompleted) {
            return {
              ...current,
              workoutCompleted: false,
              workoutRoutineName: "",
              workoutDurationMinutes: 0,
              workoutIntensity: "",
              workoutDetails: "",
            };
          }

          const workoutSelection = getString("workoutSelection");
          const workoutRoutineName =
            workoutSelection === CUSTOM_WORKOUT_VALUE
              ? getString("customWorkoutName").trim()
              : workoutSelection;

          return {
            ...current,
            workoutCompleted: true,
            workoutRoutineName,
            workoutDurationMinutes: getNumber("workoutDurationMinutes"),
            workoutIntensity: getString("workoutIntensity") as
              | WorkoutIntensity
              | "",
            workoutDetails:
              workoutSelection === CUSTOM_WORKOUT_VALUE
                ? getString("workoutDetails").trim()
                : "",
          };
        }
        case "conditioning":
          return {
            ...current,
            sportsTrainingMinutes: getNumber("sportsTrainingMinutes"),
          };
        case "movement":
          return {
            ...current,
            steps: getNumber("steps"),
            caloriesEaten: getNumber("caloriesEaten"),
          };
        case "focus":
          return {
            ...current,
            deepWorkHours: getNumber("deepWorkHours"),
            screenTimeHours: getNumber("screenTimeHours"),
          };
        case "tasks":
          return {
            ...current,
            tasksPlanned: getNumber("tasksPlanned"),
            tasksCompleted: getNumber("tasksCompleted"),
            taskDifficultyRating: getNumber("taskDifficultyRating"),
          };
        case "finance":
          return {
            ...current,
            incomeActivity: getBoolean("incomeActivity"),
            moneySpent: getNumber("moneySpent"),
            moneySaved: getNumber("moneySaved"),
          };
        case "reflection":
          return {
            ...current,
            overallDayRating: getNumber("overallDayRating"),
            rightWithGod: getBoolean("rightWithGod"),
            notes: getString("notes"),
          };
      }
    });
  }

  function handleContinue() {
    const validationError = validateCurrentStep();
    if (validationError) {
      setStepError(validationError);
      return;
    }

    applyCurrentStep();
    setSaved(false);
    setError("");
    setStepError("");
    setCurrentStepIndex((current) => Math.min(current + 1, STEP_ORDER.length));
  }

  function handleBack() {
    setStepError("");
    setCurrentStepIndex((current) => Math.max(0, current - 1));
  }

  function handleEdit(index: number) {
    setSaved(false);
    setStepError("");
    setCurrentStepIndex(index);
  }

  async function handleSubmit() {
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const payload = {
        date: form.date,
        sleepHours: form.sleepHours || null,
        workoutCompleted: form.workoutCompleted,
        workoutRoutineName: form.workoutCompleted
          ? form.workoutRoutineName || null
          : null,
        workoutDurationMinutes: form.workoutCompleted
          ? form.workoutDurationMinutes || null
          : null,
        workoutIntensity: form.workoutCompleted
          ? form.workoutIntensity || null
          : null,
        workoutDetails: form.workoutCompleted ? form.workoutDetails || null : null,
        sportsTrainingMinutes: form.sportsTrainingMinutes || null,
        steps: form.steps || null,
        deepWorkHours: form.deepWorkHours || null,
        screenTimeHours: form.screenTimeHours || null,
        tasksPlanned: form.tasksPlanned || null,
        tasksCompleted: form.tasksCompleted || null,
        taskDifficultyRating: form.taskDifficultyRating || null,
        moneySpent: form.moneySpent || null,
        moneySaved: form.moneySaved || null,
        incomeActivity: form.incomeActivity,
        caloriesEaten: form.caloriesEaten || null,
        rightWithGod: form.rightWithGod,
        wakeTime: form.wakeTime || null,
        bedtime: form.bedtime || null,
        notes: form.notes || null,
        overallDayRating: form.overallDayRating || null,
      };

      const response = await fetch("/api/daily-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Failed to save entry");
      }

      const data = await response.json();
      setExistingId(data.entry.id);
      if (data.scores) {
        setScores({
          physical: data.scores.physical,
          focus: data.scores.focus,
          discipline: data.scores.discipline,
          financial: data.scores.financial,
          mental: data.scores.mental,
          appearance: data.scores.appearance,
          overall: data.scores.overall,
        });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Failed to save entry"
      );
    } finally {
      setSaving(false);
    }
  }

  function renderCurrentStep() {
    if (!currentStepId) return null;

    if (currentStepId === "workout") {
      const workoutPreview = buildWorkoutPreview();
      const workoutCompleted = getBoolean("workoutCompleted");
      const workoutSelection = getString("workoutSelection");
      const isCustom = workoutSelection === CUSTOM_WORKOUT_VALUE;

      return (
        <div className="space-y-4 rounded-3xl border border-[#1f2937] bg-[#020617] px-5 py-5">
          <div className="grid gap-3 md:grid-cols-2">
            <ChoiceCard
              active={workoutCompleted}
              onClick={() => setDraftField("workoutCompleted", true)}
              title="Yes, I trained"
              description="Log the actual session and let the scorer rate it."
            />
            <ChoiceCard
              active={!workoutCompleted}
              onClick={() => {
                setDraftField("workoutCompleted", false);
                setDraftField("workoutSelection", "");
                setDraftField("customWorkoutName", "");
                setDraftField("workoutDetails", "");
                setDraftField("workoutDurationMinutes", 0);
                setDraftField("workoutIntensity", "");
              }}
              title="No workout"
              description="No workout credit. Extra conditioning can still be logged next."
            />
          </div>

          {workoutCompleted && (
            <>
              <div className="space-y-2">
                <FieldLabel>Main workout</FieldLabel>
                <select
                  value={workoutSelection}
                  onChange={(event) =>
                    setDraftField("workoutSelection", event.target.value)
                  }
                  className="w-full rounded-xl border border-[#334155] bg-[#111827] px-3 py-2.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                >
                  <option value="">Select a routine or custom workout</option>
                  {routines.map((routine) => (
                    <option key={routine.id} value={routine.name}>
                      {routine.name}
                    </option>
                  ))}
                  <option value={CUSTOM_WORKOUT_VALUE}>Other / custom</option>
                </select>
              </div>

              {isCustom && (
                <>
                  <div className="space-y-2">
                    <FieldLabel>Custom workout name</FieldLabel>
                    <input
                      type="text"
                      value={getString("customWorkoutName")}
                      onChange={(event) =>
                        setDraftField("customWorkoutName", event.target.value)
                      }
                      placeholder="Pickup basketball, hill sprints, kettlebell circuit"
                      className="w-full rounded-xl border border-[#334155] bg-[#111827] px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                    />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel>What exactly did you do?</FieldLabel>
                    <textarea
                      rows={3}
                      value={getString("workoutDetails")}
                      onChange={(event) =>
                        setDraftField("workoutDetails", event.target.value)
                      }
                      placeholder="Describe sets, sport, distance, intervals, or the actual session."
                      className="w-full resize-none rounded-xl border border-[#334155] bg-[#111827] px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                    />
                  </div>
                </>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <FieldLabel>Workout duration (minutes)</FieldLabel>
                  <NumberInput
                    value={getNumber("workoutDurationMinutes")}
                    onChange={(value) =>
                      setDraftField("workoutDurationMinutes", value)
                    }
                    min={0}
                    max={480}
                    placeholder="45"
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel>Intensity</FieldLabel>
                  <div className="grid grid-cols-3 gap-2">
                    {(["light", "moderate", "hard"] as WorkoutIntensity[]).map(
                      (intensity) => (
                        <button
                          key={intensity}
                          type="button"
                          onClick={() => setDraftField("workoutIntensity", intensity)}
                          className={`rounded-xl border px-3 py-2.5 text-sm font-semibold capitalize transition-colors ${
                            getString("workoutIntensity") === intensity
                              ? "border-blue-500 bg-blue-600 text-white"
                              : "border-[#334155] bg-[#111827] text-slate-300 hover:border-[#475569] hover:text-white"
                          }`}
                        >
                          {intensity}
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-300" />
                  <p className="text-sm font-semibold text-amber-200">
                    Strict workout grading
                  </p>
                </div>
                <p className="text-sm text-slate-100">{workoutPreview.summary}</p>
                <p className="mt-2 text-sm text-slate-400">
                  {workoutPreview.strictnessNote}
                </p>
              </div>
            </>
          )}
        </div>
      );
    }

    switch (currentStepId) {
      case "date":
        return (
          <div className="rounded-3xl border border-[#1f2937] bg-[#020617] px-5 py-5">
            <div className="space-y-2">
              <FieldLabel>Date</FieldLabel>
              <input
                type="date"
                value={getString("date")}
                onChange={(event) => setDraftField("date", event.target.value)}
                className="w-full rounded-xl border border-[#334155] bg-[#111827] px-3 py-2.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
              />
            </div>
          </div>
        );
      case "sleep":
        return (
          <div className="space-y-4 rounded-3xl border border-[#1f2937] bg-[#020617] px-5 py-5">
            <div className="space-y-2">
              <FieldLabel>Sleep hours: {getNumber("sleepHours")}h</FieldLabel>
              <input
                type="range"
                min={0}
                max={12}
                step={0.5}
                value={getNumber("sleepHours")}
                onChange={(event) =>
                  setDraftField("sleepHours", parseFloat(event.target.value))
                }
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-xs text-slate-600">
                <span>0h</span>
                <span className="text-green-500/70">7.5-8.5h is optimal</span>
                <span>12h</span>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel>Wake time</FieldLabel>
                <input
                  type="time"
                  value={getString("wakeTime")}
                  onChange={(event) =>
                    setDraftField("wakeTime", event.target.value)
                  }
                  className="w-full rounded-xl border border-[#334155] bg-[#111827] px-3 py-2.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                />
              </div>
              <div className="space-y-2">
                <FieldLabel>Bedtime</FieldLabel>
                <input
                  type="time"
                  value={getString("bedtime")}
                  onChange={(event) =>
                    setDraftField("bedtime", event.target.value)
                  }
                  className="w-full rounded-xl border border-[#334155] bg-[#111827] px-3 py-2.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                />
              </div>
            </div>
          </div>
        );
      case "conditioning":
        return (
          <div className="space-y-4 rounded-3xl border border-[#1f2937] bg-[#020617] px-5 py-5">
            <div className="space-y-2">
              <FieldLabel>Extra conditioning minutes</FieldLabel>
              <NumberInput
                value={getNumber("sportsTrainingMinutes")}
                onChange={(value) =>
                  setDraftField("sportsTrainingMinutes", value)
                }
                min={0}
                max={480}
                placeholder="0"
              />
            </div>
            <p className="text-sm text-slate-400">
              Example: additional cardio, basketball, boxing rounds, or extra field
              work that happened outside the main workout.
            </p>
          </div>
        );
      case "movement":
        return (
          <div className="grid gap-4 rounded-3xl border border-[#1f2937] bg-[#020617] px-5 py-5 md:grid-cols-2">
            <div className="space-y-2">
              <FieldLabel>Steps</FieldLabel>
              <NumberInput
                value={getNumber("steps")}
                onChange={(value) => setDraftField("steps", value)}
                min={0}
                max={100000}
                placeholder="8000"
              />
            </div>
            <div className="space-y-2">
              <FieldLabel>Calories eaten</FieldLabel>
              <NumberInput
                value={getNumber("caloriesEaten")}
                onChange={(value) => setDraftField("caloriesEaten", value)}
                min={0}
                max={10000}
                placeholder="2000"
              />
            </div>
          </div>
        );
      case "focus":
        return (
          <div className="space-y-4 rounded-3xl border border-[#1f2937] bg-[#020617] px-5 py-5">
            <div className="space-y-2">
              <FieldLabel>Deep work: {getNumber("deepWorkHours")}h</FieldLabel>
              <input
                type="range"
                min={0}
                max={16}
                step={0.5}
                value={getNumber("deepWorkHours")}
                onChange={(event) =>
                  setDraftField("deepWorkHours", parseFloat(event.target.value))
                }
                className="w-full accent-blue-500"
              />
            </div>
            <div className="space-y-2">
              <FieldLabel>Screen time: {getNumber("screenTimeHours")}h</FieldLabel>
              <input
                type="range"
                min={0}
                max={16}
                step={0.5}
                value={getNumber("screenTimeHours")}
                onChange={(event) =>
                  setDraftField(
                    "screenTimeHours",
                    parseFloat(event.target.value)
                  )
                }
                className="w-full accent-blue-500"
              />
            </div>
          </div>
        );
      case "tasks":
        return (
          <div className="space-y-4 rounded-3xl border border-[#1f2937] bg-[#020617] px-5 py-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel>Tasks planned</FieldLabel>
                <NumberInput
                  value={getNumber("tasksPlanned")}
                  onChange={(value) => setDraftField("tasksPlanned", value)}
                  min={0}
                  max={100}
                  placeholder="6"
                />
              </div>
              <div className="space-y-2">
                <FieldLabel>Tasks completed</FieldLabel>
                <NumberInput
                  value={getNumber("tasksCompleted")}
                  onChange={(value) => setDraftField("tasksCompleted", value)}
                  min={0}
                  max={100}
                  placeholder="5"
                />
              </div>
            </div>
            <div className="space-y-2">
              <FieldLabel>Task difficulty</FieldLabel>
              <RatingButtons
                value={getNumber("taskDifficultyRating")}
                onChange={(value) => setDraftField("taskDifficultyRating", value)}
              />
            </div>
          </div>
        );
      case "finance":
        return (
          <div className="space-y-4 rounded-3xl border border-[#1f2937] bg-[#020617] px-5 py-5">
            <ChoiceCard
              active={getBoolean("incomeActivity")}
              onClick={() =>
                setDraftField("incomeActivity", !getBoolean("incomeActivity"))
              }
              title="Did something to make money today?"
              description="Work, business, sales, or anything directly tied to income counts."
            />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel>Money spent</FieldLabel>
                <NumberInput
                  value={getNumber("moneySpent")}
                  onChange={(value) => setDraftField("moneySpent", value)}
                  min={0}
                  step={0.01}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <FieldLabel>Money saved</FieldLabel>
                <NumberInput
                  value={getNumber("moneySaved")}
                  onChange={(value) => setDraftField("moneySaved", value)}
                  min={0}
                  step={0.01}
                  placeholder="0"
                />
              </div>
            </div>
          </div>
        );
      case "reflection":
        return (
          <div className="space-y-4 rounded-3xl border border-[#1f2937] bg-[#020617] px-5 py-5">
            <div className="space-y-2">
              <FieldLabel>Overall day rating</FieldLabel>
              <RatingButtons
                value={getNumber("overallDayRating")}
                onChange={(value) => setDraftField("overallDayRating", value)}
              />
            </div>
            <ChoiceCard
              active={getBoolean("rightWithGod")}
              onClick={() =>
                setDraftField("rightWithGod", !getBoolean("rightWithGod"))
              }
              title="Are you right with God?"
              description="Keep this binary and honest."
            />
            <div className="space-y-2">
              <FieldLabel>Notes</FieldLabel>
              <textarea
                rows={4}
                value={getString("notes")}
                onChange={(event) => setDraftField("notes", event.target.value)}
                placeholder="Short reflection, misses, wins, context."
                className="w-full resize-none rounded-xl border border-[#334155] bg-[#111827] px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
              />
            </div>
          </div>
        );
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const workoutAssessment = assessWorkout(form);
  const displayedWorkoutAssessment =
    currentStepId === "workout" ? buildWorkoutPreview() : workoutAssessment;
  const renderedSteps = flowComplete
    ? STEP_ORDER
    : STEP_ORDER.slice(0, currentStepIndex + 1);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">
            Daily Check-In
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-100">
            Guided entry, strict scoring
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            This flow asks one block at a time, lets you log structured or custom
            workouts, and grades training quality based on what you actually did.
          </p>
        </div>

        <div className="min-w-[260px] rounded-3xl border border-[#1f2937] bg-[#0f172a] px-5 py-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Progress
            </p>
            <p className="text-sm font-semibold text-slate-100">{progress}%</p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#111827]">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-3 text-sm text-slate-400">
            {flowComplete
              ? existingId
                ? "Entry loaded and ready to update."
                : "Review the transcript, then save."
              : `Step ${currentStepIndex + 1} of ${STEP_ORDER.length}`}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-5 flex items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-400" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {saved && (
        <div className="mb-5 flex items-center gap-2 rounded-2xl border border-green-500/20 bg-green-500/10 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-green-400" />
          <p className="text-sm text-green-300">Entry saved successfully.</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {renderedSteps.map((stepId, index) => {
            const isCurrent = index === currentStepIndex && !flowComplete;
            return (
              <div key={stepId} className="space-y-3">
                <AssistantMessage stepId={stepId} />
                {isCurrent ? (
                  <>
                    {renderCurrentStep()}
                    {stepError && (
                      <div className="flex items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3">
                        <AlertCircle className="h-4 w-4 text-red-400" />
                        <p className="text-sm text-red-300">{stepError}</p>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={handleBack}
                        disabled={index === 0}
                        className="inline-flex items-center gap-2 rounded-xl border border-[#334155] bg-[#111827] px-4 py-2 text-sm font-semibold text-slate-300 transition-colors hover:border-[#475569] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={handleContinue}
                        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                      >
                        Continue
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </>
                ) : (
                  <UserAnswer
                    lines={summarizeAnswer(stepId, form)}
                    onEdit={() => handleEdit(index)}
                  />
                )}
              </div>
            );
          })}

          {flowComplete && (
            <div className="rounded-3xl border border-[#1f2937] bg-[#020617] p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-300">
                  <Save className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-100">
                    Ready to score this day
                  </h2>
                  <p className="text-sm text-slate-400">
                    Review the transcript above. Saving recalculates every category.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Dumbbell className="h-4 w-4 text-amber-300" />
                    <p className="text-sm font-semibold text-amber-200">
                      Workout grading summary
                    </p>
                  </div>
                  <p className="text-sm text-slate-100">{workoutAssessment.summary}</p>
                  <p className="mt-2 text-sm text-slate-400">
                    {workoutAssessment.strictnessNote}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#1f2937] bg-[#0f172a] p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-100">
                      Final checks
                    </p>
                  </div>
                  <div className="space-y-2 text-sm text-slate-400">
                    <p>Date: {form.date}</p>
                    <p>Sleep: {form.sleepHours}h</p>
                    <p>Deep work: {form.deepWorkHours}h</p>
                    <p>Tasks completed: {form.tasksCompleted}</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleEdit(STEP_ORDER.length - 1)}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#334155] bg-[#111827] px-4 py-2 text-sm font-semibold text-slate-300 transition-colors hover:border-[#475569] hover:text-white"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Review last step
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      {existingId ? "Update Entry" : "Save Entry"}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-[#1f2937] bg-[#0f172a] p-5">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-300" />
              <p className="text-sm font-semibold text-slate-100">
                Strict scoring rules
              </p>
            </div>
            <div className="space-y-3 text-sm text-slate-400">
              <p>Sleep peaks at 7.5-8.5 hours. Under 6 hours is heavily punished.</p>
              <p>Workout credit now depends on structured activity, duration, and intensity.</p>
              <p>Vague “other” workouts are capped unless you describe them clearly.</p>
              <p>Extra conditioning is separate from the main workout and only counts if it was real training.</p>
            </div>
          </div>

          <div className="rounded-3xl border border-[#1f2937] bg-[#0f172a] p-5">
            <div className="mb-3 flex items-center gap-2">
              <Dumbbell className="h-4 w-4 text-amber-300" />
              <p className="text-sm font-semibold text-slate-100">
                Current workout assessment
              </p>
            </div>
            <p className="text-sm text-slate-100">
              {displayedWorkoutAssessment.summary}
            </p>
            <p className="mt-2 text-sm text-slate-400">
              {displayedWorkoutAssessment.strictnessNote}
            </p>
          </div>
        </aside>
      </div>

      {scores && (
        <section className="mt-8">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Calculated Scores
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {(Object.entries(scores) as [keyof CategoryScores, number][]).map(
              ([key, value]) => (
                <ScoreCard
                  key={key}
                  title={SCORE_LABELS[key]}
                  score={value}
                  trend="stable"
                  icon={SCORE_ICONS[key]}
                />
              )
            )}
          </div>
        </section>
      )}

      {saved && <DailyCoachChat />}
    </div>
  );
}
