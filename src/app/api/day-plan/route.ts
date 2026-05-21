import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Groq from "groq-sdk";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import {
  GROQ_API_KEY,
  GROQ_MODEL,
  OLLAMA_BASE_URL,
  OLLAMA_MODEL,
  OLLAMA_TIMEOUT_MS,
} from "@/lib/ai-config";

const requestSchema = z.object({
  freeTimeHours: z.number().min(0).max(16).optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  energyLevel: z.enum(["low", "medium", "high"]).default("medium"),
  bigThing: z.string().trim().max(500).optional(),
  fixedCommitments: z.string().trim().max(2000).optional(),
  planningNotes: z.string().trim().max(2000).optional(),
});

const responseSchema = z.object({
  headline: z.string().min(1).max(200),
  summary: z.string().min(1).max(1200),
  priorityOrder: z.array(z.string().min(1).max(240)).min(2).max(6),
  scheduleBlocks: z.array(
    z.object({
      time: z.string().min(1).max(80),
      title: z.string().min(1).max(120),
      detail: z.string().min(1).max(400),
    })
  ).min(2).max(8),
  mealGuidance: z.array(z.string().min(1).max(240)).min(2).max(5),
  executionRules: z.array(z.string().min(1).max(240)).min(2).max(5),
  followUpQuestions: z.array(z.string().min(1).max(240)).min(2).max(5),
});

function priorityRank(priority: string): number {
  switch (priority) {
    case "urgent":
      return 0;
    case "high":
      return 1;
    case "medium":
      return 2;
    case "low":
      return 3;
    default:
      return 4;
  }
}

function toDateLabel(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function parsePlanResponse(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in AI response");
  }

  return responseSchema.parse(JSON.parse(text.slice(start, end + 1)));
}

function buildFallbackPlan(
  input: z.infer<typeof requestSchema>,
  context: {
    activePlans: Array<{ title: string; priority: string; deadline: string | null }>;
    activeTodos: Array<{ title: string }>;
    meals: Array<{ category: string; name: string }>;
  }
) {
  const focusItem =
    input.bigThing ||
    context.activePlans[0]?.title ||
    context.activeTodos[0]?.title ||
    "protect the highest-leverage work first";
  const freeTime = input.freeTimeHours ?? 3;
  const breakfast = context.meals.find((meal) => meal.category === "breakfast");
  const lunch = context.meals.find((meal) => meal.category === "lunch");
  const dinner = context.meals.find((meal) => meal.category === "dinner");

  const scheduleBlocks =
    freeTime >= 4
      ? [
          {
            time: "First block",
            title: "Deep work on the main priority",
            detail: `Start the day by attacking ${focusItem} before reactive work gets a vote.`,
          },
          {
            time: "Midday",
            title: "Admin and commitments",
            detail: "Handle messages, logistics, and fixed obligations after the first hard block is done.",
          },
          {
            time: "Second block",
            title: "Finish or advance the next important item",
            detail: "Use the remaining free time for the next plan or to-do instead of scattering attention.",
          },
        ]
      : [
          {
            time: "First opening",
            title: "One focused sprint",
            detail: `Use your first real opening for ${focusItem}. Keep it protected and distraction-free.`,
          },
          {
            time: "Later window",
            title: "Cleanup and carry-forward",
            detail: "Close open loops, prep the next task, and avoid leaving the day ambiguous.",
          },
        ];

  return {
    headline: "Protect the important work before the day fragments.",
    summary: `You do not need a complicated plan today. Use your available time to push ${focusItem}, contain reactive work, and make meals and logistics support execution instead of compete with it.`,
    priorityOrder: [
      input.bigThing || context.activePlans[0]?.title || "Finish the most important open commitment",
      context.activeTodos[0]?.title || "Clear one small operational loose end",
      context.activePlans[1]?.title || "Leave the next major task set up cleanly",
    ].filter(Boolean),
    scheduleBlocks,
    mealGuidance: [
      breakfast ? `Use ${breakfast.name} for breakfast so you do not waste decision energy early.` : "Pick an existing breakfast option early instead of improvising.",
      lunch ? `Keep lunch simple with ${lunch.name} or another low-friction option.` : "Keep lunch light and predictable so the middle of the day stays usable.",
      dinner ? `Default dinner to ${dinner.name} if you want the evening to stay clean.` : "Pre-decide dinner so late-day fatigue does not derail the evening.",
    ],
    executionRules: [
      "Do the hardest work before checking low-value messages repeatedly.",
      "Keep one visible list of what must be done today instead of juggling it mentally.",
      input.energyLevel === "low"
        ? "Reduce ambition, not clarity. One clean win beats five vague attempts."
        : "Use your best energy on output, not setup or browsing.",
    ],
    followUpQuestions: [
      "What is the one outcome that would make today count as a win?",
      "Which fixed commitment is most likely to break your schedule if you do not plan around it now?",
      "What can be decided once now so you are not renegotiating it later?",
    ],
  };
}

async function generateWithGroq(prompt: string) {
  const groq = new Groq({ apiKey: GROQ_API_KEY });
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.5,
    max_tokens: 1800,
  });

  return parsePlanResponse(completion.choices[0]?.message?.content ?? "");
}

async function generateWithOllama(prompt: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  let res: Response;

  try {
    res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
      }),
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(`Ollama responded with status ${res.status}`);
  }

  const data = await res.json();
  return parsePlanResponse(data.response ?? "");
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rawBody = await req.json();
    const parsed = requestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const [
      habits,
      meals,
      projects,
      notes,
      routines,
      latestEntry,
      latestScore,
    ] = await Promise.all([
      prisma.habit.findMany({
        where: { userId: session.user.id, isActive: true },
        select: { name: true, category: true },
        orderBy: { createdAt: "asc" },
        take: 12,
      }),
      prisma.meal.findMany({
        where: { userId: session.user.id },
        select: { name: true, category: true, calories: true },
        orderBy: [{ category: "asc" }, { createdAt: "asc" }],
        take: 18,
      }),
      prisma.project.findMany({
        where: { userId: session.user.id, status: "active" },
        include: { tasks: { select: { status: true } } },
        take: 10,
      }),
      prisma.note.findMany({
        where: { userId: session.user.id },
        select: { title: true, content: true, type: true, status: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 12,
      }),
      prisma.weightRoutine.findMany({
        where: { userId: session.user.id },
        select: { name: true },
        orderBy: { createdAt: "asc" },
        take: 8,
      }),
      prisma.dailyEntry.findFirst({
        where: { userId: session.user.id },
        orderBy: { date: "desc" },
      }),
      prisma.categoryScore.findFirst({
        where: { userId: session.user.id },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      }),
    ]);

    const activePlans = [...projects]
      .sort((left, right) => {
        const priorityDelta = priorityRank(left.priority) - priorityRank(right.priority);
        if (priorityDelta !== 0) return priorityDelta;

        const leftDeadline = left.deadline ? new Date(left.deadline).getTime() : Number.POSITIVE_INFINITY;
        const rightDeadline = right.deadline ? new Date(right.deadline).getTime() : Number.POSITIVE_INFINITY;
        return leftDeadline - rightDeadline;
      })
      .map((project) => ({
        title: project.title,
        priority: project.priority,
        deadline: toDateLabel(project.deadline),
        remainingTasks: project.tasks.filter((task) => task.status !== "completed").length,
      }));

    const activeTodos = notes
      .filter((note) => note.type === "todo" && note.status === "active")
      .map((note) => ({
        title: note.title,
        content: note.content,
      }));

    const referenceNotes = notes
      .filter((note) => note.type === "note")
      .slice(0, 5)
      .map((note) => ({
        title: note.title,
        content: note.content,
      }));

    const compactContext = {
      latestEntry: latestEntry
        ? {
            date: latestEntry.date.toISOString().slice(0, 10),
            sleepHours: latestEntry.sleepHours,
            deepWorkHours: latestEntry.deepWorkHours,
            steps: latestEntry.steps,
            notes: latestEntry.notes,
          }
        : null,
      latestScore: latestScore
        ? {
            physical: latestScore.physical,
            discipline: latestScore.discipline,
            focus: latestScore.focus,
            mental: latestScore.mental,
            financial: latestScore.financial,
            overall: latestScore.overall,
          }
        : null,
      habits,
      meals: meals.map((meal) => ({
        category: meal.category,
        name: meal.name,
        calories: meal.calories,
      })),
      activePlans,
      activeTodos,
      referenceNotes,
      routines: routines.map((routine) => routine.name),
    };

    const fallback = buildFallbackPlan(parsed.data, {
      activePlans,
      activeTodos,
      meals: meals.map((meal) => ({ category: meal.category, name: meal.name })),
    });

    const prompt = [
      "You are a ruthless but useful day planner inside a personal operating system app.",
      "Build a realistic plan for TODAY using the user's actual context.",
      "Use their meals, active plans, active to-dos, routines, habits, and latest performance context.",
      "Do not invent commitments that are not in the input.",
      "Bias toward deep work, execution clarity, and low-friction meal choices.",
      "Return ONLY valid JSON with this exact shape:",
      JSON.stringify(fallback, null, 2).replace(
        /"Protect the important work before the day fragments\."|"You do not need a complicated plan today\.[\s\S]*?"|"First block"|"Deep work on the main priority"|"Start the day by attacking [^"]*"|"Use [^"]*"|"Do the hardest work before checking low-value messages repeatedly\."|"What is the one outcome that would make today count as a win\?"/g,
        (match) => match
      ),
      "",
      `Planner intake: ${JSON.stringify(parsed.data, null, 2)}`,
      `User context: ${JSON.stringify(compactContext, null, 2)}`,
    ].join("\n");

    try {
      const aiPlan = GROQ_API_KEY
        ? await generateWithGroq(prompt)
        : await generateWithOllama(prompt);
      return NextResponse.json(aiPlan);
    } catch {
      return NextResponse.json(fallback);
    }
  } catch (error) {
    reportError({ context: "day-plan POST", error, userId: session.user.id });
    return NextResponse.json(
      { error: "Failed to generate day plan" },
      { status: 500 }
    );
  }
}
