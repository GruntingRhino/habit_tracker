/**
 * Which life area a new habit belongs to (physical / mental / financial / spiritual / work /
 * general): obvious keywords first (faith and money before generic words like "read"), otherwise a
 * tiny model call with a fixed list to pick from.
 */
import { chat, parseJson } from "@/lib/ai/llm";
import { keywordArea } from "@/lib/ai/router";
import type { Area } from "@/lib/areas";

const EXTRA: [RegExp, Area][] = [
  [/\b(pray|prayer|bible|church|god|faith|devotion|scripture|quran|worship|grateful|gratitude)\b/i, "spiritual"],
  [/\b(save|saving|budget|spend|invest|money|income|business|sales|leverage|revenue|clients?)\b/i, "financial"],
  [/\b(skin ?care|spf|sunscreen|hair|groom|posture|water|hydrat|steps?|walk|meal|eat|vegetable|fruit|cardio|push-?ups?|pull-?ups?|plank|abs|sleep|bed|floss|brush|teeth|shower|cold|sun ?light|outdoor light|stretch)\b/i, "physical"],
  [/\b(read|journal|meditat|scroll|phone|screen|focus|deep[- ]work|learn|practice|study|no social|gratitude list|plan (the|my) day)\b/i, "mental"],
  [/\b(homework|school|class|code|coding|ship|goodhours|work on)\b/i, "work"],
];

const SYSTEM = `Pick the life area a habit belongs to. physical: body, health, food, sleep, training, looks. mental: focus, learning, mood, discipline, screen time. financial: money, saving, business, income. spiritual: faith, prayer, gratitude. work: school, job, projects. general: anything else. Reply with minified JSON only: {"area":"physical"}`;
const SCHEMA = { type: "object", properties: { area: { type: "string", enum: ["physical", "mental", "financial", "spiritual", "work", "general"] } }, required: ["area"] };

export async function classifyHabit(name: string): Promise<Area> {
  for (const [re, area] of EXTRA) if (re.test(name)) return area;
  const kw = keywordArea(name);
  if (kw) return kw;
  try {
    const r = await chat({ messages: [{ role: "system", content: SYSTEM }, { role: "user", content: name.slice(0, 120) }], schema: SCHEMA, temperature: 0, maxTokens: 12, timeoutMs: 25_000 });
    const area = parseJson<{ area?: string }>(r.content)?.area;
    return (["physical", "mental", "financial", "spiritual", "work", "general"] as const).find((a) => a === area) ?? "general";
  } catch {
    return "general";
  }
}

/** The scoring category that goes with an area. */
export function categoryForArea(area: Area) {
  return area === "work" ? "focus" : area;
}

/** "Morning skincare" → morning, "Evening skincare" → evening. */
export function timeOfDayFor(name: string) {
  return /\b(morning|wake|am\b|breakfast|sunrise|outdoor light)\b/i.test(name) ? "morning" : /\b(night|evening|bed|pm\b|dinner|wind down)\b/i.test(name) ? "evening" : "any";
}
