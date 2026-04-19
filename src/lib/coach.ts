import Groq from "groq-sdk";
import { startOfDay, subDays, formatISO } from "date-fns";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  type CoachAction,
  type CoachChatMessage,
  type CoachGoalSummary,
  type CoachPriority,
  type WeekdayCode,
  WEEKDAY_CODES,
} from "@/lib/coach-types";
import { calcStreak } from "@/lib/utils";
import { assessWorkout } from "@/lib/workout";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3";
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL ?? "llama-3.1-8b-instant";

const VALID_DAY_CODES = new Set<WeekdayCode>(WEEKDAY_CODES);
const VALID_PRIORITIES = new Set(["low", "medium", "high"] as const);
const VALID_GOAL_STATUSES = new Set(["active", "completed", "paused"] as const);

const HabitActionSchema = z.object({
  type: z.literal("add_habit"),
  label: z.string().trim().min(1).max(120),
  reason: z.string().trim().max(240).nullable().optional(),
  habit: z.object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(240).nullable().optional(),
    category: z.string().trim().min(1).max(40),
    targetDays: z.array(z.enum(WEEKDAY_CODES)).min(1).max(7).optional(),
    color: z.string().trim().regex(/^#([0-9a-fA-F]{6})$/).optional(),
  }),
});

const ProjectActionSchema = z.object({
  type: z.literal("add_project"),
  label: z.string().trim().min(1).max(120),
  reason: z.string().trim().max(240).nullable().optional(),
  project: z.object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(240).nullable().optional(),
    specs: z.string().trim().max(1200).nullable().optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
    deadline: z.string().trim().max(40).nullable().optional(),
    generateTasks: z.boolean().optional(),
  }),
});

const CoachModelResponseSchema = z.object({
  message: z.string().trim().min(1).max(2400),
  profileSummary: z.string().trim().max(800).nullable().optional(),
  goals: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(120),
        description: z.string().trim().max(300).nullable().optional(),
        category: z.string().trim().min(1).max(40).optional(),
        timeframe: z.string().trim().max(80).nullable().optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        status: z.enum(["active", "completed", "paused"]).optional(),
      })
    )
    .max(6)
    .default([]),
  actions: z.array(z.union([HabitActionSchema, ProjectActionSchema])).max(4).default([]),
});

interface PersistedCoachMessage {
  id: string;
  role: string;
  content: string;
  actions: unknown;
  createdAt: Date;
}

interface CoachSnapshot {
  profileSummary: string | null;
  goals: CoachGoalSummary[];
  dataAvailability: {
    dailyEntryCount30d: number;
    habitLogCount30d: number;
    workoutSessionCount30d: number;
    hasPerformanceData: boolean;
  };
  today: Record<string, unknown> | null;
  scores: {
    latest: Record<string, number> | null;
    average30d: Record<string, number> | null;
    trend7d: Record<string, number> | null;
  };
  habits: Array<{
    name: string;
    category: string;
    description: string | null;
    targetDays: WeekdayCode[];
    streak: number;
    completionRate30d: number;
    last14: string;
  }>;
  weakestHabits: Array<{
    name: string;
    category: string;
    completionRate30d: number;
    streak: number;
  }>;
  strongestHabits: Array<{
    name: string;
    category: string;
    completionRate30d: number;
    streak: number;
  }>;
  projects: Array<{
    title: string;
    description: string | null;
    priority: string;
    status: string;
    deadline: string | null;
    completionPercentage: number;
    openTasks: string[];
  }>;
  meals: {
    total: number;
    categories: Record<string, number>;
    examples: string[];
  };
  routines: Array<{
    name: string;
    description: string | null;
    exercises: string[];
    recentSessions: string[];
  }>;
  workoutSessions: Array<{
    date: string;
    routine: string;
    exerciseCount: number;
    highlights: string[];
  }>;
  recentEntries: Array<Record<string, unknown>>;
  existingHabitNames: string[];
  existingProjectTitles: string[];
}

function isGroqAvailable(): boolean {
  return Boolean(GROQ_API_KEY);
}

async function isOllamaAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizePriority(value: string | null | undefined): CoachPriority {
  const next = normalizeText(value) as CoachPriority;
  return VALID_PRIORITIES.has(next) ? next : "medium";
}

function normalizeGoalStatus(value: string | null | undefined): "active" | "completed" | "paused" {
  const next = normalizeText(value) as "active" | "completed" | "paused";
  return VALID_GOAL_STATUSES.has(next) ? next : "active";
}

function normalizeHabitCategory(value: string | null | undefined): string {
  const category = normalizeText(value);
  if (!category) return "general";
  if (category === "finance") return "financial";
  if (category === "productivity") return "focus";
  return category;
}

function habitColorForCategory(category: string): string {
  switch (normalizeHabitCategory(category)) {
    case "physical":
      return "#22c55e";
    case "health":
      return "#06b6d4";
    case "mental":
      return "#a855f7";
    case "focus":
      return "#3b82f6";
    case "financial":
      return "#10b981";
    case "appearance":
      return "#f59e0b";
    default:
      return "#64748b";
  }
}

function cleanTargetDays(days: unknown): WeekdayCode[] {
  if (!Array.isArray(days)) return [...WEEKDAY_CODES];
  const next = days
    .map((value) => normalizeText(typeof value === "string" ? value : ""))
    .filter((value): value is WeekdayCode => VALID_DAY_CODES.has(value as WeekdayCode));
  return next.length > 0 ? Array.from(new Set(next)) : [...WEEKDAY_CODES];
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;

    if (depth === 0) {
      return text.slice(start, index + 1);
    }
  }

  return null;
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

function serializeDailyWindow(
  logs: Array<{ date: Date; completed: boolean }>,
  days = 14
): string {
  const byDate = new Map<number, boolean>();
  for (const log of logs) {
    byDate.set(startOfDay(log.date).getTime(), log.completed);
  }

  const values: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const dateKey = startOfDay(subDays(new Date(), offset)).getTime();
    values.push(byDate.get(dateKey) ? "1" : "0");
  }
  return values.join("");
}

function averageByKey<T extends Record<string, number>>(
  items: T[],
  keys: Array<keyof T>
): Record<string, number> | null {
  if (items.length === 0) return null;

  const next: Record<string, number> = {};
  for (const key of keys) {
    const sum = items.reduce((total, item) => total + (item[key] ?? 0), 0);
    next[String(key)] = roundScore(sum / items.length);
  }
  return next;
}

function computeTrend7d(
  scores: Array<Record<string, number>>,
  keys: string[]
): Record<string, number> | null {
  if (scores.length < 2) return null;

  const recent = scores.slice(-7);
  const previous = scores.slice(Math.max(0, scores.length - 14), Math.max(0, scores.length - 7));
  if (previous.length === 0) return null;

  const next: Record<string, number> = {};
  for (const key of keys) {
    const recentAvg = recent.reduce((total, score) => total + (score[key] ?? 0), 0) / recent.length;
    const previousAvg = previous.reduce((total, score) => total + (score[key] ?? 0), 0) / previous.length;
    next[key] = roundScore(recentAvg - previousAvg);
  }
  return next;
}

async function buildCoachSnapshot(userId: string): Promise<CoachSnapshot> {
  const since30d = subDays(startOfDay(new Date()), 30);
  const since14d = subDays(startOfDay(new Date()), 13);
  const todayStart = startOfDay(new Date());

  const [
    user,
    dailyEntries,
    categoryScores,
    habits,
    meals,
    projects,
    routines,
    workoutSessions,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        coachProfile: true,
        coachGoals: {
          where: { status: { in: ["active", "paused"] } },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          take: 8,
        },
      },
    }),
    prisma.dailyEntry.findMany({
      where: { userId, date: { gte: since30d } },
      orderBy: { date: "desc" },
      take: 30,
    }),
    prisma.categoryScore.findMany({
      where: { userId, date: { gte: since30d } },
      orderBy: { date: "asc" },
      take: 30,
    }),
    prisma.habit.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: "asc" },
      include: {
        logs: {
          where: { date: { gte: since30d } },
          orderBy: { date: "desc" },
        },
      },
    }),
    prisma.meal.findMany({
      where: { userId },
      orderBy: [{ category: "asc" }, { order: "asc" }, { createdAt: "asc" }],
      take: 60,
    }),
    prisma.project.findMany({
      where: { userId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        tasks: {
          orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        },
      },
      take: 25,
    }),
    prisma.weightRoutine.findMany({
      where: { userId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: {
        exercises: { orderBy: { order: "asc" } },
        sessions: { orderBy: { date: "desc" }, take: 3 },
      },
      take: 16,
    }),
    prisma.workoutSession.findMany({
      where: { userId, date: { gte: since30d } },
      orderBy: { date: "desc" },
      include: {
        routine: { select: { name: true } },
        exerciseLogs: { orderBy: { createdAt: "asc" } },
      },
      take: 12,
    }),
  ]);

  const latestEntry = dailyEntries.find(
    (entry) => startOfDay(entry.date).getTime() === todayStart.getTime()
  ) ?? dailyEntries[0] ?? null;

  const latestScoreRecord = categoryScores.at(-1) ?? null;

  const scoreKeys = [
    "physical",
    "financial",
    "discipline",
    "focus",
    "mental",
    "appearance",
    "overall",
  ] as const;

  const compactScores = categoryScores.map((score) => ({
    physical: score.physical ?? 0,
    financial: score.financial ?? 0,
    discipline: score.discipline ?? 0,
    focus: score.focus ?? 0,
    mental: score.mental ?? 0,
    appearance: score.appearance ?? 0,
    overall: score.overall ?? 0,
  }));

  const habitSummaries = habits.map((habit) => {
    const completionRate =
      habit.logs.length > 0
        ? habit.logs.filter((log) => log.completed).length / habit.logs.length
        : 0;

    return {
      name: habit.name,
      category: habit.category,
      description: habit.description,
      targetDays: cleanTargetDays(habit.targetDays),
      streak: calcStreak(
        habit.logs.map((log) => ({
          date: log.date,
          completed: log.completed,
        }))
      ),
      completionRate30d: roundScore(completionRate),
      last14: serializeDailyWindow(
        habit.logs.map((log) => ({ date: log.date, completed: log.completed })),
        14
      ),
    };
  });

  const sortedHabits = [...habitSummaries].sort(
    (left, right) => left.completionRate30d - right.completionRate30d
  );
  const habitLogCount30d = habits.reduce((sum, habit) => sum + habit.logs.length, 0);

  const projectSummaries = projects.map((project) => {
    const openTasks = project.tasks.filter((task) => task.status !== "completed");
    const completedCount = project.tasks.length - openTasks.length;
    const completionPercentage =
      project.tasks.length === 0
        ? 0
        : Math.round((completedCount / project.tasks.length) * 100);

    return {
      title: project.title,
      description: project.description,
      priority: project.priority,
      status: project.status,
      deadline: project.deadline ? formatISO(project.deadline, { representation: "date" }) : null,
      completionPercentage,
      openTasks: openTasks.slice(0, 6).map((task) => task.title),
    };
  });

  const mealCategories = meals.reduce<Record<string, number>>((result, meal) => {
    result[meal.category] = (result[meal.category] ?? 0) + 1;
    return result;
  }, {});

  const recentEntrySummaries = dailyEntries
    .filter((entry) => entry.date >= since14d)
    .slice(0, 14)
    .map((entry) => {
      const workout = assessWorkout({
        workoutCompleted: entry.workoutCompleted,
        workoutRoutineName: entry.workoutRoutineName,
        workoutDurationMinutes: entry.workoutDurationMinutes,
        workoutIntensity: entry.workoutIntensity,
        workoutDetails: entry.workoutDetails,
      });

      return {
        date: formatISO(entry.date, { representation: "date" }),
        sleepHours: entry.sleepHours,
        deepWorkHours: entry.deepWorkHours,
        screenTimeHours: entry.screenTimeHours,
        tasksCompleted: entry.tasksCompleted,
        tasksPlanned: entry.tasksPlanned,
        steps: entry.steps,
        moneySaved: entry.moneySaved,
        moneySpent: entry.moneySpent,
        caloriesEaten: entry.caloriesEaten,
        overallDayRating: entry.overallDayRating,
        incomeActivity: entry.incomeActivity,
        workoutSummary: {
          countsAsWorkout: workout.countsAsWorkout,
          routine: entry.workoutRoutineName,
          durationMinutes: entry.workoutDurationMinutes,
          intensity: entry.workoutIntensity,
        },
        notes: entry.notes,
      };
    });

  return {
    profileSummary: user?.coachProfile?.summary ?? null,
    goals:
      user?.coachGoals.map((goal) => ({
        id: goal.id,
        title: goal.title,
        description: goal.description,
        category: goal.category,
        timeframe: goal.timeframe,
        priority: normalizePriority(goal.priority),
        status: normalizeGoalStatus(goal.status),
      })) ?? [],
    dataAvailability: {
      dailyEntryCount30d: dailyEntries.length,
      habitLogCount30d,
      workoutSessionCount30d: workoutSessions.length,
      hasPerformanceData:
        dailyEntries.length > 0 || habitLogCount30d > 0 || workoutSessions.length > 0,
    },
    today:
      latestEntry
        ? {
            date: formatISO(latestEntry.date, { representation: "date" }),
            sleepHours: latestEntry.sleepHours,
            workoutCompleted: latestEntry.workoutCompleted,
            workoutRoutineName: latestEntry.workoutRoutineName,
            workoutDurationMinutes: latestEntry.workoutDurationMinutes,
            workoutIntensity: latestEntry.workoutIntensity,
            deepWorkHours: latestEntry.deepWorkHours,
            screenTimeHours: latestEntry.screenTimeHours,
            tasksCompleted: latestEntry.tasksCompleted,
            tasksPlanned: latestEntry.tasksPlanned,
            steps: latestEntry.steps,
            moneySaved: latestEntry.moneySaved,
            moneySpent: latestEntry.moneySpent,
            caloriesEaten: latestEntry.caloriesEaten,
            overallDayRating: latestEntry.overallDayRating,
            notes: latestEntry.notes,
          }
        : null,
    scores: {
      latest: latestScoreRecord
        ? {
            physical: latestScoreRecord.physical ?? 0,
            financial: latestScoreRecord.financial ?? 0,
            discipline: latestScoreRecord.discipline ?? 0,
            focus: latestScoreRecord.focus ?? 0,
            mental: latestScoreRecord.mental ?? 0,
            appearance: latestScoreRecord.appearance ?? 0,
            overall: latestScoreRecord.overall ?? 0,
          }
        : null,
      average30d: averageByKey(compactScores, [...scoreKeys]),
      trend7d: computeTrend7d(compactScores, [...scoreKeys]),
    },
    habits: habitSummaries,
    weakestHabits: sortedHabits.slice(0, 5).map((habit) => ({
      name: habit.name,
      category: habit.category,
      completionRate30d: habit.completionRate30d,
      streak: habit.streak,
    })),
    strongestHabits: [...sortedHabits]
      .reverse()
      .slice(0, 5)
      .map((habit) => ({
        name: habit.name,
        category: habit.category,
        completionRate30d: habit.completionRate30d,
        streak: habit.streak,
      })),
    projects: projectSummaries,
    meals: {
      total: meals.length,
      categories: mealCategories,
      examples: meals.slice(0, 10).map((meal) => meal.name),
    },
    routines: routines.map((routine) => ({
      name: routine.name,
      description: routine.description,
      exercises: routine.exercises.map((exercise) => exercise.name),
      recentSessions: routine.sessions.map((session) =>
        formatISO(session.date, { representation: "date" })
      ),
    })),
    workoutSessions: workoutSessions.map((session) => ({
      date: formatISO(session.date, { representation: "date" }),
      routine: session.routine.name,
      exerciseCount: session.exerciseLogs.length,
      highlights: session.exerciseLogs.slice(0, 4).map((log) => log.exerciseName),
    })),
    recentEntries: recentEntrySummaries,
    existingHabitNames: habits.map((habit) => habit.name),
    existingProjectTitles: projects.map((project) => project.title),
  };
}

function buildCoachSystemPrompt(): string {
  return [
    "You are the in-app AI coach for Habit Intelligence.",
    "You are direct, precise, and pragmatic. No fluff. No generic self-help cliches.",
    "Use the provided user data and conversation to answer questions, recommend good habits, and suggest concrete projects when appropriate.",
    "If you suggest a habit, it must be behavior-based, measurable, realistic, and clearly connected to the user's stated goals or weak spots.",
    "Never invent performance evidence. Do not claim streaks, weekly frequency, consistency, progress, missed targets, or completion patterns unless those claims are explicitly supported by the provided user data.",
    "If the user has zero daily entries and zero completion history, say that plainly and limit yourself to analyzing configured habits, routines, meals, and projects.",
    "Do not recommend a habit or project that duplicates an existing one in the user's data.",
    "When the user shares durable goals, constraints, preferences, or recurring priorities, capture them in goals or profileSummary.",
    "The goals array is only for durable memory updates learned in this turn. Leave it empty if nothing new should be remembered.",
    "Return at most 3 actions, and only when they are concrete enough to create immediately.",
    "Always return valid JSON only. No markdown. No prose outside JSON.",
    "JSON schema:",
    JSON.stringify(
      {
        message: "string",
        profileSummary: "string | null",
        goals: [
          {
            title: "string",
            description: "string | null",
            category: "string",
            timeframe: "string | null",
            priority: "low | medium | high",
            status: "active | completed | paused",
          },
        ],
        actions: [
          {
            type: "add_habit",
            label: "string",
            reason: "string | null",
            habit: {
              name: "string",
              description: "string | null",
              category: "string",
              targetDays: [...WEEKDAY_CODES],
              color: "#RRGGBB",
            },
          },
          {
            type: "add_project",
            label: "string",
            reason: "string | null",
            project: {
              title: "string",
              description: "string | null",
              specs: "string | null",
              priority: "low | medium | high",
              deadline: "YYYY-MM-DD | null",
              generateTasks: true,
            },
          },
        ],
      },
      null,
      2
    ),
  ].join("\n");
}

function buildCoachPromptPayload(
  snapshot: CoachSnapshot,
  conversation: Array<{ role: "user" | "assistant"; content: string }>,
  instruction: string
): string {
  return JSON.stringify(
    {
      instruction,
      conversation,
      userContext: snapshot,
      scoringGuide: {
        habitQuality:
          "Good habits are concrete, measurable, sustainable, and clearly tied to a goal or a repeated failure pattern in the user's data.",
        projectQuality:
          "Good projects move a goal forward through a defined outcome, not vague intention. Prefer one project over many weak projects.",
      },
    },
    null,
    2
  );
}

async function askGroqForCoachResponse(prompt: string): Promise<string> {
  const groq = new Groq({ apiKey: GROQ_API_KEY });
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: buildCoachSystemPrompt() },
      { role: "user", content: prompt },
    ],
    temperature: 0.35,
    max_tokens: 1400,
  });
  return completion.choices[0]?.message?.content ?? "";
}

async function askOllamaForCoachResponse(prompt: string): Promise<string> {
  const fullPrompt = `${buildCoachSystemPrompt()}\n\n${prompt}`;
  const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: fullPrompt,
      stream: false,
      format: "json",
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama responded with status ${res.status}`);
  }

  const data = await res.json();
  return (data.response as string) ?? "";
}

function inferGoalCategory(text: string): string {
  const normalized = normalizeText(text);
  if (/study|school|college|exam|class|sat|debate|read|learn/.test(normalized)) return "focus";
  if (/money|income|business|trade|financial|save|revenue/.test(normalized)) return "financial";
  if (/muscle|fitness|physique|workout|lift|run|health|weight/.test(normalized)) return "physical";
  if (/stress|anxiety|mental|mind|sleep|meditat/.test(normalized)) return "mental";
  return "general";
}

function inferGoalsFromMessage(
  userMessage: string | null
): z.infer<typeof CoachModelResponseSchema>["goals"] {
  if (!userMessage) return [];

  const patterns = [
    /my (?:main )?goal is to\s+([^?.!]+)/i,
    /i want to\s+([^?.!]+)/i,
    /i need to\s+([^?.!]+)/i,
    /i(?:'m| am) trying to\s+([^?.!]+)/i,
    /goal:\s*([^?.!]+)/i,
  ];

  for (const pattern of patterns) {
    const match = userMessage.match(pattern);
    if (!match?.[1]) continue;

    const title = match[1].trim().replace(/\s+/g, " ");
    if (!title) continue;
    const parsed = parseGoalRequest(title);
    const normalizedTitle =
      parsed.isMuscleGain && (parsed.targetWeightText || parsed.deadlineLabel)
        ? `Gain ${parsed.targetWeightText ?? "muscle"}${parsed.deadlineLabel ? ` by ${parsed.deadlineLabel}` : ""}`
        : title[0].toUpperCase() + title.slice(1);

    return [
      {
        title: normalizedTitle,
        description: null,
        category: parsed.category,
        timeframe: parsed.deadlineLabel,
        priority: "high",
        status: "active",
      },
    ];
  }

  return [];
}

interface ParsedGoalRequest {
  normalized: string;
  category: string;
  isMuscleGain: boolean;
  targetWeightText: string | null;
  deadlineLabel: string | null;
  deadlineIso: string | null;
  wantsProject: boolean;
  allIn: boolean;
}

function parseGoalRequest(text: string | null | undefined): ParsedGoalRequest {
  const raw = text ?? "";
  const normalized = normalizeText(raw);
  const category = inferGoalCategory(raw);
  const isMuscleGain =
    /build muscle|gain(?: as much)? muscle|put on .*muscle|muscle gain|bulk|bulking|hypertrophy|gain mass/.test(
      normalized
    );

  const targetMatch = raw.match(
    /(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(?:lb|lbs|pounds)/i
  ) ?? raw.match(/(\d+(?:\.\d+)?)\s*(?:lb|lbs|pounds)/i);

  const targetWeightText = targetMatch
    ? targetMatch[2]
      ? `${targetMatch[1]}-${targetMatch[2]} lb`
      : `${targetMatch[1]} lb`
    : null;

  const monthMatch = raw.match(
    /\b(january|february|march|april|may|june|july|august|september|sept|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i
  );

  let deadlineLabel: string | null = null;
  let deadlineIso: string | null = null;

  if (monthMatch) {
    const monthMap: Record<string, number> = {
      january: 1,
      february: 2,
      march: 3,
      april: 4,
      may: 5,
      june: 6,
      july: 7,
      august: 8,
      september: 9,
      sept: 9,
      october: 10,
      november: 11,
      december: 12,
    };

    const month = monthMap[monthMatch[1].toLowerCase()];
    const day = Number(monthMatch[2]);
    const now = new Date();
    let year = now.getFullYear();
    const candidate = new Date(year, month - 1, day);
    if (candidate.getTime() < now.getTime()) {
      year += 1;
    }
    const resolved = new Date(year, month - 1, day);
    deadlineIso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    deadlineLabel = resolved.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } else if (/end of summer/.test(normalized)) {
    const now = new Date();
    let year = now.getFullYear();
    const maybeThisYear = new Date(year, 8, 1);
    if (maybeThisYear.getTime() < now.getTime()) {
      year += 1;
    }
    deadlineIso = `${year}-09-01`;
    deadlineLabel = "September 1, " + year;
  }

  return {
    normalized,
    category,
    isMuscleGain,
    targetWeightText,
    deadlineLabel,
    deadlineIso,
    wantsProject:
      /project/i.test(raw) || Boolean(targetWeightText) || Boolean(deadlineLabel),
    allIn:
      /willing to change anything|change anything in my lifestyle|anything in my lifestyle|all in|whatever it takes|willing to do anything/.test(
        normalized
      ),
  };
}

function formatHabitList(names: string[]): string {
  if (names.length === 0) return "none";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

function selectExistingHabitNames(
  snapshot: CoachSnapshot,
  patterns: RegExp[]
): string[] {
  return snapshot.habits
    .filter((habit) => {
      const haystack = `${habit.name} ${habit.description ?? ""}`;
      return patterns.some((pattern) => pattern.test(normalizeText(haystack)));
    })
    .map((habit) => habit.name);
}

function selectExistingHabitNamesInPriorityOrder(
  snapshot: CoachSnapshot,
  groups: Array<{ patterns: RegExp[] }>
): string[] {
  const selected = new Set<string>();
  const names: string[] = [];

  for (const group of groups) {
    const matches = selectExistingHabitNames(snapshot, group.patterns);
    for (const name of matches) {
      if (selected.has(name)) continue;
      selected.add(name);
      names.push(name);
    }
  }

  return names;
}

function buildFocusNoDataResponse(
  snapshot: CoachSnapshot,
  request: ParsedGoalRequest,
  activeGoal: z.infer<typeof CoachModelResponseSchema>["goals"][number] | CoachGoalSummary | undefined
): z.infer<typeof CoachModelResponseSchema> {
  const aligned = selectExistingHabitNamesInPriorityOrder(snapshot, [
    { patterns: [/focus|deep work/] },
    { patterns: [/reading/] },
    { patterns: [/limit screen|screen off/] },
    { patterns: [/sleep/] },
  ]).slice(0, 5);

  return {
    message:
      `You have zero daily entries and zero completion logs, so I cannot tell you what is actually happening day to day yet. I can still give you a system. For this goal, the highest-leverage setup is: one protected deep-work block every day, a hard screen/distraction cutoff, and a weekly review that turns the goal into concrete work. The habits already aligned are ${formatHabitList(aligned)}. The next missing pieces are a fixed “most important task” habit and a weekly planning loop.`,
    profileSummary: snapshot.profileSummary,
    goals: activeGoal && "id" in activeGoal ? [] : activeGoal ? [activeGoal] : [],
    actions: [
      {
        type: "add_habit",
        label: "Add Daily MIT habit",
        reason: "Ambition without a single daily priority turns into scattered effort.",
        habit: {
          name: "Daily MIT Set",
          description: "Set the single most important task before starting work and finish it before low-value tasks.",
          category: "focus",
          targetDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
          color: habitColorForCategory("focus"),
        },
      },
    ],
  };
}

function buildFinancialNoDataResponse(
  snapshot: CoachSnapshot,
  request: ParsedGoalRequest,
  activeGoal: z.infer<typeof CoachModelResponseSchema>["goals"][number] | CoachGoalSummary | undefined
): z.infer<typeof CoachModelResponseSchema> {
  const aligned = selectExistingHabitNamesInPriorityOrder(snapshot, [
    { patterns: [/save|money|financial/] },
    { patterns: [/focus|deep work/] },
    { patterns: [/limit screen/] },
  ]).slice(0, 5);

  return {
    message:
      `You have zero daily entries and zero completion logs, so I cannot judge your execution yet. For this goal, the structure is simple: protect a daily revenue block, track money every day, and review the numbers weekly. The habits already aligned are ${formatHabitList(aligned)}. The missing piece is a specific income habit tied to one repeatable activity, not just vague intent.`,
    profileSummary: snapshot.profileSummary,
    goals: activeGoal && "id" in activeGoal ? [] : activeGoal ? [activeGoal] : [],
    actions: [
      {
        type: "add_habit",
        label: "Add Revenue Block habit",
        reason: "Money goals fail when income work competes with everything else.",
        habit: {
          name: "Revenue Block 60min",
          description: "Spend 60 focused minutes on the highest-probability income activity before distractions.",
          category: "financial",
          targetDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
          color: habitColorForCategory("financial"),
        },
      },
    ],
  };
}

function buildNoDataGoalResponse(
  snapshot: CoachSnapshot,
  userMessage: string | null,
  activeGoal: z.infer<typeof CoachModelResponseSchema>["goals"][number] | CoachGoalSummary | undefined
): z.infer<typeof CoachModelResponseSchema> {
  const goalText = [activeGoal?.title, userMessage].filter(Boolean).join(" ");
  const request = parseGoalRequest(goalText);
  const actions: z.infer<typeof CoachModelResponseSchema>["actions"] = [];

  if (request.isMuscleGain) {
    const supportiveHabits = selectExistingHabitNamesInPriorityOrder(snapshot, [
      { patterns: [/workout|training session/] },
      { patterns: [/protein/] },
      { patterns: [/calories eaten|3500kcal|calorie/] },
      { patterns: [/sleep 9hrs|sleep/] },
      { patterns: [/water intake/] },
      { patterns: [/stretch|mobility/] },
    ]).slice(0, 6);

    const conditionalConflicts = selectExistingHabitNamesInPriorityOrder(snapshot, [
      { patterns: [/steps|10,000/] },
      { patterns: [/shadowboxing|bag work/] },
      { patterns: [/jump|explosive movement/] },
      { patterns: [/reflex training/] },
    ]).slice(0, 4);

    actions.push(
      {
        type: "add_habit",
        label: "Add Log Every Lift habit",
        reason: "Muscle gain without progressive overload tracking is guesswork.",
        habit: {
          name: "Log Every Lift",
          description:
            "Record sets, reps, and load for every lifting session and beat last time when possible.",
          category: "physical",
          targetDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
          color: habitColorForCategory("physical"),
        },
      },
      {
        type: "add_habit",
        label: "Add Morning Bodyweight Check habit",
        reason: "Fast muscle gain needs weekly weight feedback, not guessing.",
        habit: {
          name: "Morning Bodyweight Check",
          description:
            "Weigh yourself after waking at least 4 mornings per week and track the weekly average.",
          category: "physical",
          targetDays: ["mon", "tue", "thu", "sat"],
          color: habitColorForCategory("physical"),
        },
      }
    );

    if (request.wantsProject) {
      actions.push({
        type: "add_project",
        label: "Add Summer Muscle Gain project",
        reason: "Turn the goal into a concrete training and nutrition system.",
        project: {
          title: request.deadlineLabel
            ? `Gain ${request.targetWeightText ?? "Muscle"} by ${request.deadlineLabel}`
            : "Summer Muscle Gain",
          description: "Hypertrophy-focused muscle gain plan with recovery and nutrition tracked tightly.",
          specs:
            `Optimize for ${request.targetWeightText ?? "fast muscle gain"}. Prioritize progressive overload, a controlled calorie surplus, protein adherence, recovery, weekly bodyweight tracking, and hard lifting sessions. ${request.deadlineLabel ? `Target date: ${request.deadlineLabel}. ` : ""}${request.allIn ? "User is willing to aggressively change lifestyle to support recovery, food, and training." : ""}`,
          priority: "high",
          deadline: request.deadlineIso,
          generateTasks: true,
        },
      });
    }

    const conflictText =
      conditionalConflicts.length > 0
        ? `The only conditional conflicts I see are ${formatHabitList(conditionalConflicts)} if they push fatigue too high or make it harder to stay in a calorie surplus.`
        : "I do not see a direct conflicting habit configured yet; the main risk is poor execution, not the current habit list.";

    const targetText = request.targetWeightText
      ? `${request.targetWeightText} by ${request.deadlineLabel ?? "your target date"}`
      : request.deadlineLabel
        ? `meaningful muscle gain by ${request.deadlineLabel}`
        : "fast muscle gain";

    const routineText =
      snapshot.routines.length > 0
        ? "Use your existing lifting routines as the base rather than inventing more exercises."
        : "Build your week around 4-6 hypertrophy-focused lifting sessions.";

    return {
      message:
        `You have zero daily entries and zero completion logs, so I cannot tell you what is actually consistent or inconsistent yet. I can still map the plan. To hit ${targetText}, treat this like a mass-gain block: train hard 4-6 days per week, keep a real calorie surplus every day, and make recovery non-negotiable. ${routineText} Aim to gain roughly 0.5-0.75 lb per week, not all at once. If your weekly average bodyweight is not rising after 7-10 days, increase calories. The habits already helping are ${formatHabitList(supportiveHabits)}. ${conflictText} Since ${request.allIn ? "you said you're willing to change anything, " : ""}the missing pieces are progressive overload tracking and weekly bodyweight feedback, I added those${request.wantsProject ? " plus a project" : ""}.`,
      profileSummary: snapshot.profileSummary,
      goals: activeGoal && "id" in activeGoal
        ? []
        : activeGoal
          ? [activeGoal]
          : [],
      actions,
    };
  }

  if (request.category === "focus") {
    return buildFocusNoDataResponse(snapshot, request, activeGoal);
  }

  if (request.category === "financial") {
    return buildFinancialNoDataResponse(snapshot, request, activeGoal);
  }

  const category = request.category;
  const helpfulHabits = snapshot.habits
    .filter((habit) => normalizeHabitCategory(habit.category) === normalizeHabitCategory(category))
    .map((habit) => habit.name)
    .slice(0, 5);

  return {
    message:
      `You have zero daily entries and zero completion logs, so I cannot make claims about streaks, consistency, or progress yet. I can still analyze the system you have configured. For this goal, the habits already most aligned are ${formatHabitList(helpfulHabits)}. The next step is to turn the goal into one measurable project, a small number of daily habits, and one weekly review loop. I am not blocked on more detail, but the more specific the target and deadline, the more aggressive I can make the plan.`,
    profileSummary: snapshot.profileSummary,
    goals: activeGoal && "id" in activeGoal
      ? []
      : activeGoal
        ? [activeGoal]
        : [],
    actions:
      request.wantsProject && activeGoal
        ? [
            {
              type: "add_project",
              label: `Add ${activeGoal.title} project`,
              reason: "A deadline goal without a project structure drifts.",
              project: {
                title: activeGoal.title,
                description: activeGoal.description,
                specs: `Build a concrete execution plan for: ${activeGoal.title}.${activeGoal.timeframe ? ` Target date: ${activeGoal.timeframe}.` : ""}`,
                priority: "high",
                deadline: request.deadlineIso,
                generateTasks: true,
              },
            },
          ]
        : [],
  };
}

function messageContainsUnsupportedPerformanceClaims(
  snapshot: CoachSnapshot,
  message: string
): boolean {
  if (snapshot.dataAvailability.hasPerformanceData) return false;

  const text = normalizeText(message);
  const unsupportedPatterns = [
    /\bstreak\b/,
    /\bthis week\b/,
    /\bonly \d+/,
    /\b\d+\s+days?\b/,
    /\bconsistent\b/,
    /\bmissed the mark\b/,
    /\bmade progress\b/,
    /\bprogress on\b/,
    /\bcompletion rate\b/,
    /\bper week\b/,
  ];

  return unsupportedPatterns.some((pattern) => pattern.test(text));
}

function buildFallbackCoachResponse(
  snapshot: CoachSnapshot,
  userMessage: string | null,
  instruction: string
): z.infer<typeof CoachModelResponseSchema> {
  const inferredGoals = inferGoalsFromMessage(userMessage);
  const weakest = snapshot.weakestHabits[0];
  const activeGoal = snapshot.goals.find((goal) => goal.status === "active") ?? inferredGoals[0];
  if (!snapshot.dataAvailability.hasPerformanceData) {
    return buildNoDataGoalResponse(snapshot, userMessage, activeGoal);
  }
  const lowerScore = snapshot.scores.average30d
    ? Object.entries(snapshot.scores.average30d).sort((left, right) => left[1] - right[1])[0]
    : null;

  const wantsHabits = /habit|routine|goal|project|plan/i.test(userMessage ?? "");
  const actions: z.infer<typeof CoachModelResponseSchema>["actions"] = [];

  if (wantsHabits && activeGoal) {
    const goalTitle = activeGoal.title.toLowerCase();
    if (/study|school|college|exam|class|sat|debate/.test(goalTitle)) {
      actions.push({
        type: "add_habit",
        label: "Add 90-Minute Study Block habit",
        reason: "A fixed daily study block is a stronger lever than vague intent.",
        habit: {
          name: "90-Minute Study Block",
          description: "Complete one protected 90-minute study block with phone off.",
          category: "focus",
          targetDays: ["mon", "tue", "wed", "thu", "fri"],
          color: habitColorForCategory("focus"),
        },
      });
    } else if (/money|income|business|trade|financial/.test(goalTitle)) {
      actions.push({
        type: "add_habit",
        label: "Add Daily Revenue Block habit",
        reason: "Revenue work needs a protected daily slot or it gets pushed out.",
        habit: {
          name: "Daily Revenue Block",
          description: "Spend 60 minutes on the highest-value income activity before distractions.",
          category: "financial",
          targetDays: ["mon", "tue", "wed", "thu", "fri"],
          color: habitColorForCategory("financial"),
        },
      });
    } else {
      actions.push({
        type: "add_habit",
        label: "Add Weekly Goal Review habit",
        reason: "A weekly review prevents drift between goals and daily actions.",
        habit: {
          name: "Weekly Goal Review",
          description: "Review active goals, score the week, and choose next week's top 3 actions.",
          category: "focus",
          targetDays: ["sun"],
          color: habitColorForCategory("focus"),
        },
      });
    }
  }

  const message = activeGoal
    ? `Current priority: ${activeGoal.title}. ${weakest ? `${weakest.name} is your weakest active habit at ${Math.round(weakest.completionRate30d * 100)}% over 30 days.` : "You need a tighter system around that goal."} ${actions.length > 0 ? "I gave you one concrete action you can add immediately." : "Tell me the exact outcome and timeline you want, and I’ll turn it into habits and projects."}`
    : `I can read your habits, projects, scores, and recent logs, but there is no durable goal saved yet. ${lowerScore ? `Your weakest 30-day area is ${lowerScore[0]} at ${lowerScore[1]}/10.` : ""} ${instruction.includes("overview") ? "Tell me your top 1-3 goals and timeframe, and I’ll build the system around them." : "Tell me your goal and deadline, and I’ll turn it into habits and projects."}`;

  return {
    message,
    profileSummary: snapshot.profileSummary,
    goals: inferredGoals,
    actions,
  };
}

async function generateCoachResponse(
  snapshot: CoachSnapshot,
  conversation: Array<{ role: "user" | "assistant"; content: string }>,
  userMessage: string | null,
  instruction: string
): Promise<z.infer<typeof CoachModelResponseSchema>> {
  const prompt = buildCoachPromptPayload(snapshot, conversation, instruction);

  try {
    let rawText = "";

    if (isGroqAvailable()) {
      rawText = await askGroqForCoachResponse(prompt);
    } else if (await isOllamaAvailable()) {
      rawText = await askOllamaForCoachResponse(prompt);
    } else {
      return buildFallbackCoachResponse(snapshot, userMessage, instruction);
    }

    const jsonText = extractJsonObject(rawText) ?? rawText;
    const parsed = CoachModelResponseSchema.parse(JSON.parse(jsonText));
    if (messageContainsUnsupportedPerformanceClaims(snapshot, parsed.message)) {
      return buildFallbackCoachResponse(snapshot, userMessage, instruction);
    }
    return parsed;
  } catch (error) {
    console.error("[coach] generateCoachResponse error:", error);
    return buildFallbackCoachResponse(snapshot, userMessage, instruction);
  }
}

function sanitizeCoachActions(
  actions: z.infer<typeof CoachModelResponseSchema>["actions"],
  snapshot: CoachSnapshot
): CoachAction[] {
  const existingHabits = new Set(snapshot.existingHabitNames.map(normalizeText));
  const existingProjects = new Set(snapshot.existingProjectTitles.map(normalizeText));
  const emitted = new Set<string>();
  const sanitized: CoachAction[] = [];

  for (const action of actions) {
    if (action.type === "add_habit") {
      const name = action.habit.name.trim();
      const habitKey = normalizeText(name);
      if (!habitKey || emitted.has(`habit:${habitKey}`)) continue;

      const category = normalizeHabitCategory(action.habit.category);
      sanitized.push({
        id: crypto.randomUUID(),
        type: "add_habit",
        label: action.label || `Add ${name} habit`,
        reason: action.reason ?? null,
        applied: existingHabits.has(habitKey),
        habit: {
          name,
          description: action.habit.description?.trim() || null,
          category,
          targetDays: cleanTargetDays(action.habit.targetDays),
          color: action.habit.color ?? habitColorForCategory(category),
        },
      });
      emitted.add(`habit:${habitKey}`);
      continue;
    }

    const title = action.project.title.trim();
    const projectKey = normalizeText(title);
    if (!projectKey || emitted.has(`project:${projectKey}`)) continue;

    sanitized.push({
      id: crypto.randomUUID(),
      type: "add_project",
      label: action.label || `Add ${title} project`,
      reason: action.reason ?? null,
      applied: existingProjects.has(projectKey),
      project: {
        title,
        description: action.project.description?.trim() || null,
        specs: action.project.specs?.trim() || null,
        priority: normalizePriority(action.project.priority),
        deadline: action.project.deadline?.trim() || null,
        generateTasks: action.project.generateTasks ?? true,
      },
    });
    emitted.add(`project:${projectKey}`);
  }

  return sanitized.slice(0, 3);
}

async function upsertCoachMemory(
  userId: string,
  profileSummary: string | null | undefined,
  goals: z.infer<typeof CoachModelResponseSchema>["goals"]
): Promise<void> {
  if (profileSummary && profileSummary.trim()) {
    await prisma.coachProfile.upsert({
      where: { userId },
      create: {
        userId,
        summary: profileSummary.trim(),
      },
      update: {
        summary: profileSummary.trim(),
      },
    });
  }

  for (const goal of goals) {
    const existing = await prisma.coachGoal.findFirst({
      where: {
        userId,
        title: { equals: goal.title.trim(), mode: "insensitive" },
      },
    });

    const data = {
      title: goal.title.trim(),
      description: goal.description?.trim() || null,
      category: normalizeHabitCategory(goal.category),
      timeframe: goal.timeframe?.trim() || null,
      priority: normalizePriority(goal.priority),
      status: normalizeGoalStatus(goal.status),
      source: "chat",
    };

    if (existing) {
      await prisma.coachGoal.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await prisma.coachGoal.create({
        data: {
          userId,
          ...data,
        },
      });
    }
  }
}

async function persistCoachMessage(
  userId: string,
  role: "user" | "assistant",
  content: string,
  actions: CoachAction[] = []
): Promise<PersistedCoachMessage> {
  return prisma.coachChatMessage.create({
    data: {
      userId,
      role,
      content,
      actions: JSON.parse(JSON.stringify(actions)),
    },
    select: {
      id: true,
      role: true,
      content: true,
      actions: true,
      createdAt: true,
    },
  });
}

function hydrateStoredMessages(
  messages: PersistedCoachMessage[],
  snapshot: CoachSnapshot
): CoachChatMessage[] {
  const existingHabits = new Set(snapshot.existingHabitNames.map(normalizeText));
  const existingProjects = new Set(snapshot.existingProjectTitles.map(normalizeText));

  return messages.map((message) => {
    const parsedActions = Array.isArray(message.actions)
      ? sanitizeCoachActions(
          message.actions.filter((value) => typeof value === "object"),
          snapshot
        )
      : [];

    const actions = parsedActions.map((action) => {
      if (action.type === "add_habit") {
        return {
          ...action,
          applied: existingHabits.has(normalizeText(action.habit.name)),
        };
      }

      return {
        ...action,
        applied: existingProjects.has(normalizeText(action.project.title)),
      };
    });

    return {
      id: message.id,
      role: message.role === "user" ? "user" : "assistant",
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      actions,
    };
  });
}

async function loadPersistedMessages(userId: string): Promise<PersistedCoachMessage[]> {
  const messages = await prisma.coachChatMessage.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 24,
    select: {
      id: true,
      role: true,
      content: true,
      actions: true,
      createdAt: true,
    },
  });

  return messages.reverse();
}

export async function getCoachChatState(userId: string): Promise<{
  messages: CoachChatMessage[];
  goals: CoachGoalSummary[];
}> {
  const snapshot = await buildCoachSnapshot(userId);
  const persisted = await loadPersistedMessages(userId);

  if (persisted.length > 0) {
    return {
      messages: hydrateStoredMessages(persisted, snapshot),
      goals: snapshot.goals,
    };
  }

  const response = await generateCoachResponse(
    snapshot,
    [],
    null,
    "Open the conversation. Give a short overview of the user's current situation, mention remembered goals if any, and ask one sharp follow-up about what they want next."
  );
  const actions = sanitizeCoachActions(response.actions, snapshot);
  await upsertCoachMemory(userId, response.profileSummary, response.goals);
  const assistantMessage = await persistCoachMessage(
    userId,
    "assistant",
    response.message,
    actions
  );
  const refreshedSnapshot = await buildCoachSnapshot(userId);

  return {
    messages: hydrateStoredMessages([assistantMessage], refreshedSnapshot),
    goals: refreshedSnapshot.goals,
  };
}

export async function sendCoachMessage(
  userId: string,
  rawMessage: string
): Promise<{
  message: CoachChatMessage;
  goals: CoachGoalSummary[];
}> {
  const content = rawMessage.trim();
  if (!content) {
    throw new Error("Message is required");
  }

  await persistCoachMessage(userId, "user", content);

  const beforeResponseHistory = await loadPersistedMessages(userId);
  const snapshot = await buildCoachSnapshot(userId);
  const conversation = beforeResponseHistory
    .slice(-12)
    .map((message) => ({
      role: message.role === "user" ? "user" as const : "assistant" as const,
      content: message.content,
    }));

  const response = await generateCoachResponse(
    snapshot,
    conversation,
    content,
    "Answer the user's last message. Use their data. If they ask for goals, habits, routines, or projects, give concrete recommendations and create ready-to-add actions where useful."
  );
  const actions = sanitizeCoachActions(response.actions, snapshot);

  await upsertCoachMemory(userId, response.profileSummary, response.goals);

  const assistantMessage = await persistCoachMessage(
    userId,
    "assistant",
    response.message,
    actions
  );
  const refreshedSnapshot = await buildCoachSnapshot(userId);

  return {
    message: hydrateStoredMessages([assistantMessage], refreshedSnapshot)[0],
    goals: refreshedSnapshot.goals,
  };
}
