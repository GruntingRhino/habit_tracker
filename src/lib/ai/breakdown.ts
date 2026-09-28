import { chat, parseJson } from "@/lib/ai/llm";

export interface TaskDraft {
  title: string;
  priority: "low" | "medium" | "high";
  estimatedMinutes: number | null;
}

const SCHEMA = {
  type: "object",
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          minutes: { type: "integer" },
        },
        required: ["title", "priority"],
      },
    },
  },
  required: ["tasks"],
};

const SYSTEM = `Break Abhay's project into 4-8 concrete, ordered next actions. Each title starts with a verb and is under 10 words. Put the first physical next step first. priority: high for blockers and deadline-critical steps. minutes: rough estimate. Reply with minified JSON only.`;

/** Ask the model to split a project into tasks. Returns [] if the model fails. */
export async function breakDownProject(title: string, details: string | null): Promise<TaskDraft[]> {
  const result = await chat({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Project: ${title}${details ? `\nDetails: ${details.slice(0, 1200)}` : ""}` },
    ],
    schema: SCHEMA,
    temperature: 0.3,
    maxTokens: 500,
    timeoutMs: 180_000,
  });
  const parsed = parseJson<{ tasks?: { title?: string; priority?: string; minutes?: number }[] }>(result.content);
  return (parsed?.tasks ?? [])
    .filter((t) => t.title?.trim())
    .slice(0, 10)
    .map((t) => ({
      title: t.title!.trim().slice(0, 200),
      priority: t.priority === "high" || t.priority === "low" ? t.priority : "medium",
      estimatedMinutes: t.minutes && t.minutes > 0 && t.minutes < 10000 ? Math.round(t.minutes) : null,
    }));
}
