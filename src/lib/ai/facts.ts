/**
 * Questions with exact answers in the database: answered by code, never by the model
 * (a 1.7B model reading a snapshot invented scores and missed to-dos).
 */
import prisma from "@/lib/prisma";
import { getStartOfDay } from "@/lib/utils";
import { computeTargets, readBody } from "@/lib/body";

export const NUTRITION_Q = /\b(how (much|many)|what'?s|whats|what is|total)\b.{0,25}\b(protein|calories|cals|kcal|carbs|fat|fiber|macros)\b|\b(protein|calories|cals|macros)\b.{0,20}\b(so far|today)\b.*\?/i;
export const SCORE_Q = /\b(score|scored|grade|graded|rating)\b/i;
export const PLATE_Q = /\b(on my plate|what (else )?do i (still )?(have|need|got) (left )?to do|what'?s (still )?left to do|what('?s| is) (still )?(open|pending) on my|what'?s (left|due|on)( for)? today|what should i do today|what'?s on (my|the) (list|to-?do list|todo)|my to-?dos?\b.*\?|what'?s on my to-?do)/i;

const r0 = (n: number) => Math.round(n);

export async function nutritionAnswer(userId: string, text: string, now = new Date()) {
  const day = getStartOfDay(now);
  const meals = await prisma.meal.findMany({ where: { userId, status: "eaten", createdAt: { gte: day } }, select: { name: true, calories: true, protein: true, carbs: true, fat: true, micros: true } });
  if (!meals.length) return "Nothing logged to eat today yet.";
  const sum = (k: "calories" | "protein" | "carbs" | "fat") => meals.reduce((s, m) => s + (m[k] ?? 0), 0);
  const fiber = meals.reduce((s, m) => s + Number((m.micros as { fiber?: number } | null)?.fiber ?? 0), 0);
  const pending = meals.filter((m) => m.calories == null).length;
  const body = await readBody();
  const t = body.weightLb ? computeTargets(body, body.weightLb, now).targets : null;
  const of = (v: number, target?: number, unit = "g") => `${r0(v)}${unit}${target ? ` of ${r0(target)}${unit}` : ""}`;
  const lc = text.toLowerCase();
  const parts: string[] = [];
  if (/protein/.test(lc)) parts.push(`protein ${of(sum("protein"), t?.protein)}`);
  if (/calor|cals|kcal/.test(lc)) parts.push(`calories ${of(sum("calories"), t?.calories, " kcal")}`);
  if (/carb/.test(lc)) parts.push(`carbs ${of(sum("carbs"), t?.carbs)}`);
  if (/\bfat\b/.test(lc)) parts.push(`fat ${of(sum("fat"), t?.fat)}`);
  if (/fiber/.test(lc)) parts.push(`fiber ${of(fiber, t?.fiber)}`);
  if (!parts.length) parts.push(`calories ${of(sum("calories"), t?.calories, " kcal")}`, `protein ${of(sum("protein"), t?.protein)}`, `carbs ${r0(sum("carbs"))}g`, `fat ${r0(sum("fat"))}g`);
  const left = /protein/.test(lc) && t?.protein ? t.protein - sum("protein") : null;
  return [
    `Today so far (${meals.length} meal${meals.length === 1 ? "" : "s"}): ${parts.join(" · ")}.`,
    left == null ? "" : left > 0 ? `${r0(left)}g protein to go.` : "Protein target hit ✅",
    pending ? `(${pending} meal${pending === 1 ? " is" : "s are"} still being estimated.)` : "",
  ].filter(Boolean).join(" ");
}

const AREAS = ["physical", "mental", "discipline", "focus", "work", "financial", "spiritual", "appearance"] as const;

export async function scoreAnswer(userId: string, text: string, now = new Date()) {
  const lc = text.toLowerCase();
  const today = getStartOfDay(now);
  const week = /\b(week|weekly)\b/.test(lc);
  const day = /\byesterday\b/.test(lc) ? new Date(today.getTime() - 86_400_000) : today;
  if (week) {
    const from = new Date(today.getTime() - 6 * 86_400_000);
    const rows = await prisma.categoryScore.findMany({ where: { userId, date: { gte: from } }, select: { overall: true } });
    if (!rows.length) return "No scores this week yet.";
    return `This week so far: ${(rows.reduce((s, r) => s + r.overall, 0) / rows.length).toFixed(1)}/10 average over ${rows.length} day${rows.length === 1 ? "" : "s"}.`;
  }
  const row = await prisma.categoryScore.findFirst({ where: { userId, date: day }, orderBy: { createdAt: "desc" } });
  const label = day.getTime() === today.getTime() ? "Today" : "Yesterday";
  if (!row) return `${label} doesn't have a score yet.`;
  const areas = AREAS.filter((a) => row[a] > 0).map((a) => `${a} ${row[a].toFixed(1)}`);
  return `${label}: ${row.overall.toFixed(1)}/10 overall${areas.length ? ` — ${areas.join(", ")}` : ""}. Tap a score on Home for why and how to raise it.`;
}

export async function plateAnswer(userId: string, now = new Date(), verdict = false) {
  const day = getStartOfDay(now);
  const end = new Date(day.getTime() + 86_400_000);
  const dow = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][now.getDay()];
  const [todos, habits, events] = await Promise.all([
    prisma.todo.findMany({ where: { userId, status: "open" }, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }], select: { title: true, dueAt: true, priority: true } }),
    prisma.habit.findMany({ where: { userId, isActive: true, targetDays: { has: dow } }, select: { name: true, logs: { where: { date: day }, select: { completed: true } } } }),
    prisma.calendarEvent.findMany({ where: { userId, start: { gte: day, lt: end } }, orderBy: { start: "asc" }, select: { title: true, start: true, allDay: true } }).catch(() => []),
  ]);
  const t = (d: Date) => d.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "");
  const due = (d: Date | null) => (!d ? "" : d < day ? " — overdue" : d < end ? ` — due today ${t(d)}` : ` — due ${d.toLocaleDateString("en-US", { weekday: "short" })}`);
  const lines: string[] = [];
  if (events.length) lines.push("📅 " + events.map((e) => `${e.title}${e.allDay ? "" : ` ${t(e.start)}`}`).join(" · "));
  const soon = todos.filter((x) => !x.dueAt || x.dueAt < new Date(end.getTime() + 2 * 86_400_000)).slice(0, 8);
  if (soon.length) lines.push("To-dos:", ...soon.map((x) => `- ${x.title}${due(x.dueAt)}`));
  if (todos.length > soon.length) lines.push(`(+${todos.length - soon.length} more later)`);
  const left = habits.filter((h) => !h.logs[0]?.completed).map((h) => h.name);
  const done = habits.length - left.length;
  if (habits.length) lines.push(left.length ? `Habits left (${done}/${habits.length} done): ${left.join(", ")}` : `All ${habits.length} habits done today 💪`);
  if (verdict) {
    const dueToday = todos.filter((x) => x.dueAt && x.dueAt < end).length;
    const open = left.length + dueToday;
    const head = !open ? "Yes — every habit's done and nothing's due today 💪" : `Not quite: ${[left.length ? `${left.length} habit${left.length === 1 ? "" : "s"} left (${left.join(", ")})` : "", dueToday ? `${dueToday} to-do${dueToday === 1 ? "" : "s"} due today` : ""].filter(Boolean).join(" and ")}.`;
    const later = todos.filter((x) => !x.dueAt || x.dueAt >= end).slice(0, 5).map((x) => `- ${x.title}${due(x.dueAt)}`);
    return [head, ...(later.length ? ["Coming up:", ...later] : [])].join("\n");
  }
  return lines.length ? lines.join("\n") : "Nothing on your plate today — no to-dos, events or habits.";
}

export const DID_I_Q = /^\s*(?:so\s+|wait\s+)?did i (?:do|finish|complete|hit|read|drink|get|log)\s+(?:my\s+|the\s+)?(.+?)(?:\s+(?:today|yet))*\s*\?*\s*$/i;

/** "did i do my posture routine today?" → from his habit log (null if it isn't one of his habits). */
export async function habitStatusAnswer(userId: string, text: string, now = new Date()) {
  const { mentions } = await import("@/lib/ai/habitcheck");
  const day = getStartOfDay(now);
  const habits = await prisma.habit.findMany({ where: { userId, isActive: true }, select: { id: true, name: true, logs: { where: { date: day }, select: { completed: true, notes: true } } } });
  const h = habits.find((x) => mentions(x, text));
  if (!h) return null;
  const log = h.logs[0];
  if (log?.completed) return `Yes — ${h.name} is done today ✅${log.notes ? ` (${log.notes})` : ""}.`;
  if (log?.notes) return `Not yet — ${h.name}: ${log.notes} so far.`;
  return `Not yet — ${h.name} isn't checked off today.`;
}

export const MEALS_Q = /\bwhat (did|have) i (eat|eaten|had)\b|\bwhat i ate\b|\bmy meals (today|so far)\b/i;
export async function mealsAnswer(userId: string, now = new Date()) {
  const day = getStartOfDay(now);
  const meals = await prisma.meal.findMany({ where: { userId, status: "eaten", createdAt: { gte: day } }, orderBy: { createdAt: "asc" }, select: { name: true, category: true, calories: true, protein: true } });
  if (!meals.length) return "Nothing logged to eat today yet.";
  const kcal = meals.reduce((s, m) => s + (m.calories ?? 0), 0);
  const p = meals.reduce((s, m) => s + (m.protein ?? 0), 0);
  return [`Today (${r0(kcal)} kcal · ${r0(p)}g protein):`, ...meals.map((m) => `- ${m.category ? `${m.category}: ` : ""}${m.name}${m.calories != null ? ` — ${r0(m.calories)} kcal, ${r0(m.protein ?? 0)}g P` : ""}`)].join("\n");
}

export const TARGET_Q = /\b(what'?s|what is|whats|how (much|many))\b.{0,30}\b(my )?(calorie|calories|protein|carb|carbs|fat|macro|macros)\b.{0,20}\b(target|goal|should i (be )?(eat|eating|get|have|hit))|\b(calorie|protein|macro) (target|goal)s?\b/i;
export async function targetsAnswer(userId: string, now = new Date()) {
  const body = await readBody();
  if (!body.weightLb) return "I don't have your weight yet — say something like \"I weigh 134\" and I'll set your targets.";
  const t = computeTargets(body, body.weightLb, now);
  return [`Your daily targets (${body.goal ?? "maintain"}): ${t.targets.calories.toLocaleString("en-US")} kcal · ${t.targets.protein}g protein · ${t.targets.carbs}g carbs · ${t.targets.fat}g fat · ${t.targets.fiber}g fiber.`, ...t.lines].join("\n");
  void userId;
}

export const REMINDERS_Q = /\b(what|which|show|list|any)\b.{0,15}\breminders?\b.{0,20}(\?|$)|\bmy reminders\b/i;
export async function remindersAnswer(userId: string) {
  const r = await prisma.reminder.findMany({ where: { userId, status: "pending" }, orderBy: { fireAt: "asc" }, take: 15 });
  if (!r.length) return "No reminders set.";
  const f = (d: Date) => d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).replace(":00", "");
  return ["Your reminders:", ...r.map((x) => `⏰ ${x.text} — ${f(x.fireAt)}${x.recurrence !== "none" ? ` (${x.recurrence})` : ""}`)].join("\n");
}

export const WEEK_Q = /\bhow (was|is|did|'?s) (my|the) week\b|\bhow did i do this week\b|\bmy week so far\b|\bweekly score\b/i;
export async function weekAnswer(userId: string, now = new Date()) {
  const { describeWeek, weekScore } = await import("@/lib/weekly");
  return describeWeek(await weekScore(userId, now));
}
