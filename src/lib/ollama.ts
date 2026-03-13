import { CategoryScores } from "@/lib/scoring";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3";

export interface ProjectTask {
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  estimatedMinutes: number;
  order: number;
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

export async function generateProjectChecklist(
  title: string,
  specs: string
): Promise<ProjectTask[]> {
  const prompt = `You are a project planning assistant. Generate a detailed task checklist for the following project.

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

Generate 5-10 actionable tasks. Ensure the tasks are specific, logical and ordered correctly.`;

  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        format: "json",
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama responded with status ${res.status}`);
    }

    const data = await res.json();
    const responseText: string = data.response ?? "";

    // Extract JSON array from response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("No JSON array found in Ollama response");
    }

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
  } catch (err) {
    console.error("[ollama] generateProjectChecklist error:", err);
    throw err;
  }
}

export async function generateInsights(
  scores: CategoryScores,
  recentEntries: Record<string, unknown>[]
): Promise<string> {
  const entrySummary =
    recentEntries.length > 0
      ? JSON.stringify(recentEntries.slice(0, 7), null, 2)
      : "No recent entries available.";

  const prompt = `You are a personal productivity coach. Based on the following data, provide 3-5 concise, actionable insights to help the user improve their habits and overall score.

Current Scores (out of 10):
- Physical: ${scores.physical}
- Focus: ${scores.focus}
- Consistency: ${scores.consistency}
- Financial: ${scores.financial}
- Responsibility: ${scores.responsibility}
- Overall: ${scores.overall}

Recent Daily Entries (last 7 days):
${entrySummary}

Provide practical, encouraging insights. Focus on the lowest scoring areas and highlight what's going well. Keep each insight to 1-2 sentences.`;

  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama responded with status ${res.status}`);
    }

    const data = await res.json();
    return (data.response as string) ?? "Unable to generate insights at this time.";
  } catch (err) {
    console.error("[ollama] generateInsights error:", err);
    return "Unable to generate insights at this time. Please ensure Ollama is running.";
  }
}
