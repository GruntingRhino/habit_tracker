import Groq from "groq-sdk";
import {
  GROQ_API_KEY,
  GROQ_MODEL,
  OLLAMA_BASE_URL,
  OLLAMA_MODEL,
  OLLAMA_TIMEOUT_MS,
} from "@/lib/ai-config";
import { CategoryScores } from "@/lib/scoring";

export interface ProjectTask {
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  estimatedMinutes: number;
  order: number;
}

// ── Availability checks ──────────────────────────────────────────────────────

export function isGroqAvailable(): boolean {
  return !!GROQ_API_KEY;
}

export async function isOllamaAvailable(): Promise<boolean> {
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

export async function isAIAvailable(): Promise<boolean> {
  if (isGroqAvailable()) return true;
  return isOllamaAvailable();
}

// ── Checklist generation ─────────────────────────────────────────────────────

const CHECKLIST_PROMPT = (title: string, specs: string) =>
  `You are a project planning assistant. Generate a detailed task checklist for the following project.

Project Title: ${title}
Project Specs: ${specs || "No additional specs provided."}

Return ONLY a valid JSON array of tasks with this exact structure (no markdown, no explanation):
[
  {
    "title": "Task title",
    "description": "Brief description of what needs to be done",
    "priority": "high" | "medium" | "low",
    "estimatedMinutes": number,
    "order": number
  }
]

Generate 6-10 actionable, specific tasks ordered by logical execution sequence.`;

function parseTasks(text: string): ProjectTask[] {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("No JSON array found in AI response");
  const tasks = JSON.parse(jsonMatch[0]) as Partial<ProjectTask>[];
  return tasks.map((task, idx) => ({
    title: task.title ?? `Task ${idx + 1}`,
    description: task.description ?? "",
    priority: (["low", "medium", "high"].includes(task.priority ?? "")
      ? task.priority
      : "medium") as "low" | "medium" | "high",
    estimatedMinutes:
      typeof task.estimatedMinutes === "number" ? task.estimatedMinutes : 30,
    order: task.order ?? idx,
  }));
}

async function generateWithGroq(title: string, specs: string): Promise<ProjectTask[]> {
  const groq = new Groq({ apiKey: GROQ_API_KEY });
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      {
        role: "user",
        content: CHECKLIST_PROMPT(title, specs),
      },
    ],
    temperature: 0.4,
    max_tokens: 2048,
  });
  const text = completion.choices[0]?.message?.content ?? "";
  return parseTasks(text);
}

async function generateWithOllama(title: string, specs: string): Promise<ProjectTask[]> {
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
        prompt: CHECKLIST_PROMPT(title, specs),
        stream: false,
        format: "json",
      }),
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw new Error(`Ollama responded with status ${res.status}`);
  const data = await res.json();
  return parseTasks(data.response ?? "");
}

export async function generateProjectChecklist(
  title: string,
  specs: string
): Promise<ProjectTask[]> {
  // Try Groq first (works in production / Vercel)
  if (isGroqAvailable()) {
    return generateWithGroq(title, specs);
  }
  // Fall back to local Ollama
  return generateWithOllama(title, specs);
}

// ── Insights generation ──────────────────────────────────────────────────────

const INSIGHTS_PROMPT = (scores: CategoryScores, entrySummary: string) =>
  `You are a personal productivity coach. Based on the following data, provide 3-5 concise, actionable insights to help the user improve their habits and overall score.

Current Scores (out of 10):
- Physical: ${scores.physical}
- Financial: ${scores.financial}
- Discipline: ${scores.discipline}
- Focus: ${scores.focus}
- Mental: ${scores.mental}
- Appearance: ${scores.appearance}
- Overall: ${scores.overall}

Recent Daily Entries (last 7 days):
${entrySummary}

Provide practical, encouraging insights. Focus on the lowest scoring areas and highlight what's going well. Keep each insight to 1-2 sentences.`;

async function insightsWithGroq(scores: CategoryScores, entrySummary: string): Promise<string> {
  const groq = new Groq({ apiKey: GROQ_API_KEY });
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [{ role: "user", content: INSIGHTS_PROMPT(scores, entrySummary) }],
    temperature: 0.6,
    max_tokens: 512,
  });
  return completion.choices[0]?.message?.content ?? "Unable to generate insights.";
}

async function insightsWithOllama(scores: CategoryScores, entrySummary: string): Promise<string> {
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
        prompt: INSIGHTS_PROMPT(scores, entrySummary),
        stream: false,
      }),
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw new Error(`Ollama responded with status ${res.status}`);
  const data = await res.json();
  return (data.response as string) ?? "Unable to generate insights.";
}

// ── Daily coach chat ─────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CoachContext {
  entry?: Record<string, unknown>;
  scores?: Record<string, number>;
  recentAvg?: number;
}

function buildCoachSystemPrompt(context: CoachContext): string {
  const parts: string[] = [
    "You are a strict personal performance coach inside a habit tracking app called Habit Intelligence. You give direct, honest, actionable feedback — no fluff, no sugarcoating. Keep responses to 2-4 sentences max.",
  ];
  if (context.entry) {
    parts.push(`\nToday's logged data:\n${JSON.stringify(context.entry, null, 2)}`);
  } else {
    parts.push("\nNo entry logged for today yet.");
  }
  if (context.scores) {
    parts.push(
      `\nToday's scores (0-10): ${Object.entries(context.scores)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}`
    );
  }
  if (context.recentAvg !== undefined) {
    parts.push(`30-day overall average: ${context.recentAvg}/10`);
  }
  parts.push(
    "\nBe concise. Reference the user's actual numbers. Acknowledge wins, but focus on the biggest opportunity."
  );
  return parts.join("\n");
}

async function chatWithGroq(
  messages: ChatMessage[],
  context: CoachContext
): Promise<string> {
  const groq = new Groq({ apiKey: GROQ_API_KEY });
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: buildCoachSystemPrompt(context) },
      ...messages,
    ],
    temperature: 0.6,
    max_tokens: 512,
  });
  return completion.choices[0]?.message?.content ?? "Unable to generate response.";
}

async function chatWithOllama(
  messages: ChatMessage[],
  context: CoachContext
): Promise<string> {
  const conversationText = messages
    .map((m) => `${m.role === "user" ? "User" : "Coach"}: ${m.content}`)
    .join("\n");
  const fullPrompt = `${buildCoachSystemPrompt(context)}\n\nConversation:\n${conversationText}\n\nCoach:`;
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
        prompt: fullPrompt,
        stream: false,
      }),
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw new Error(`Ollama responded with status ${res.status}`);
  const data = await res.json();
  return (data.response as string) ?? "Unable to generate response.";
}

export async function chatWithCoach(
  messages: ChatMessage[],
  context: CoachContext
): Promise<string> {
  try {
    if (isGroqAvailable()) return chatWithGroq(messages, context);
    const ollamaUp = await isOllamaAvailable();
    if (ollamaUp) return chatWithOllama(messages, context);
    return "No AI backend configured. Add a GROQ_API_KEY to enable the daily coach.";
  } catch (err) {
    console.error("[ai] chatWithCoach error:", err);
    return "Unable to connect to the AI coach at this time.";
  }
}

// ── Insights generation ──────────────────────────────────────────────────────

export async function generateInsights(
  scores: CategoryScores,
  recentEntries: Record<string, unknown>[]
): Promise<string> {
  const entrySummary =
    recentEntries.length > 0
      ? JSON.stringify(recentEntries.slice(0, 7), null, 2)
      : "No recent entries available.";

  try {
    if (isGroqAvailable()) return insightsWithGroq(scores, entrySummary);
    const ollamaUp = await isOllamaAvailable();
    if (ollamaUp) return insightsWithOllama(scores, entrySummary);
    return "No AI backend configured. Add a GROQ_API_KEY to enable insights.";
  } catch (err) {
    console.error("[ai] generateInsights error:", err);
    return "Unable to generate insights at this time.";
  }
}
