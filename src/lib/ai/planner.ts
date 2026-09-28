import prisma from "@/lib/prisma";
import { chat, parseJson, LLM_MODEL } from "@/lib/ai/llm";
import { describeItem, getOpenItems, type OpenItem } from "@/lib/ai/context";
import { getStartOfDay } from "@/lib/utils";
import { reportError } from "@/lib/monitoring";
import { addDays, format } from "date-fns";

export interface PlanItem {
  type: OpenItem["type"];
  id: string;
  title: string;
  area: string;
  reason?: string;
  projectId?: string;
}

export interface PlanResult {
  items: PlanItem[];
  summary: string | null;
}

const MAX_FOCUS = 6;

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    picks: {
      type: "array",
      items: {
        type: "object",
        properties: { n: { type: "integer" }, reason: { type: "string" } },
        required: ["n", "reason"],
      },
    },
    summary: { type: "string" },
  },
  required: ["picks", "summary"],
};

const PLAN_SYSTEM = `You plan Abhay's day. From his numbered open items, pick at most ${MAX_FOCUS} to focus on TODAY, in the order he should do them.
Rules:
- Overdue and due-today items come first, then urgent/high priority, then items due in the next few days.
- Balance areas: if a life area scored low recently, include one item from it when possible.
- Prefer concrete next actions over vague projects. Don't overload: fewer, finishable items.
- reason: max 8 words, why it's on today's list.
- summary: one encouraging sentence about the day's focus.
Reply with minified JSON only: {"picks":[{"n":3,"reason":"due today"}],"summary":"..."}`;

export function fallbackPlan(candidates: OpenItem[]): PlanItem[] {
  return candidates.slice(0, MAX_FOCUS).map((c) => ({
    type: c.type,
    id: c.id,
    title: c.title,
    area: c.area,
    projectId: c.projectId,
    reason: c.due && c.due.getTime() < Date.now() ? "overdue" : c.priority === "urgent" || c.priority === "high" ? `${c.priority} priority` : undefined,
  }));
}

export async function planDay(
  userId: string,
  opts: { force?: boolean; think?: boolean; note?: string; date?: Date } = {}
): Promise<PlanResult> {
  const day = getStartOfDay(opts.date ?? new Date());
  if (!opts.force) {
    const existing = await prisma.dayPlan.findUnique({ where: { userId_date: { userId, date: day } } });
    if (existing) return { items: existing.items as unknown as PlanItem[], summary: existing.summary };
  }

  const horizon = addDays(day, 7).getTime();
  const all = await getOpenItems(userId, 60);
  // Candidate pool: anything with a date inside a week, plus the highest-priority undated items.
  const candidates = [
    ...all.filter((i) => i.due && i.due.getTime() <= horizon),
    ...all.filter((i) => !i.due || i.due.getTime() > horizon),
  ].slice(0, 20);

  if (candidates.length === 0) {
    return savePlan(userId, day, [], "Nothing open — a clean slate. Add what matters in chat.", "none");
  }

  const lastScore = await prisma.categoryScore.findFirst({ where: { userId, date: { lt: day } }, orderBy: { date: "desc" } });
  const weak = lastScore
    ? (["physical", "mental", "financial", "spiritual", "work"] as const)
        .map((a) => [a, lastScore[a]] as const)
        .sort((a, b) => a[1] - b[1])
        .slice(0, 2)
        .map(([a, v]) => `${a} ${v.toFixed(1)}/10`)
        .join(", ")
    : "unknown";

  const numbered = candidates
    .map((c, i) => `${i + 1}. ${describeItem(c)}${c.due && c.due.getTime() < day.getTime() ? " OVERDUE" : ""}`)
    .join("\n");
  const user = `Today: ${format(day, "EEEE MMM d")}\nWeakest areas lately: ${weak}${opts.note ? `\nHis note: ${opts.note}` : ""}\n\nOpen items:\n${numbered}`;

  try {
    const result = await chat({
      messages: [
        { role: "system", content: PLAN_SYSTEM },
        { role: "user", content: user },
      ],
      schema: PLAN_SCHEMA,
      think: opts.think ?? false,
      maxTokens: opts.think ? 1500 : 400,
      timeoutMs: opts.think ? 10 * 60_000 : 150_000,
    });
    const parsed = parseJson<{ picks?: { n: number; reason?: string }[]; summary?: string }>(result.content);
    const seen = new Set<number>();
    const items: PlanItem[] = [];
    for (const p of parsed?.picks ?? []) {
      const c = candidates[p.n - 1];
      if (!c || seen.has(p.n) || items.length >= MAX_FOCUS) continue;
      seen.add(p.n);
      items.push({ type: c.type, id: c.id, title: c.title, area: c.area, projectId: c.projectId, reason: p.reason?.slice(0, 80) });
    }
    // A tiny model sometimes under-picks; top up from the priority-sorted pool.
    const minItems = Math.min(4, candidates.length);
    for (const c of candidates) {
      if (items.length >= minItems) break;
      if (!items.some((i) => i.id === c.id)) items.push({ type: c.type, id: c.id, title: c.title, area: c.area, projectId: c.projectId, reason: c.priority === "urgent" || c.priority === "high" ? `${c.priority} priority` : "next up" });
    }
    // Overdue items are never allowed to silently drop off the plan.
    for (const c of candidates.filter((c) => c.due && c.due.getTime() < day.getTime())) {
      if (items.length >= MAX_FOCUS + 2) break;
      if (!items.some((i) => i.id === c.id)) items.unshift({ type: c.type, id: c.id, title: c.title, area: c.area, projectId: c.projectId, reason: "overdue" });
    }
    if (!items.length) throw new Error("empty plan");
    return savePlan(userId, day, items, parsed?.summary?.slice(0, 300) ?? null, LLM_MODEL);
  } catch (error) {
    reportError({ context: "planner", error, userId });
    return savePlan(userId, day, fallbackPlan(candidates), null, "fallback");
  }
}

async function savePlan(userId: string, date: Date, items: PlanItem[], summary: string | null, model: string): Promise<PlanResult> {
  await prisma.dayPlan.upsert({
    where: { userId_date: { userId, date } },
    update: { items: items as object[], summary, model, generatedAt: new Date() },
    create: { userId, date, items: items as object[], summary, model },
  });
  return { items, summary };
}
