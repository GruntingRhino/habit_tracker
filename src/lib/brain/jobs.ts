/**
 * Background jobs: small, useful things the always-on brain notices. Each one is plain code over
 * his data (no model), so a nudge can only mention things that exist. Results are BrainNudge rows
 * (listed in the app) and, when worth it, a Telegram message outside quiet hours.
 */
import { addDays, differenceInCalendarDays, format, startOfWeek } from "date-fns";
import prisma from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { findFood } from "@/lib/nutrition-foods";
import { MICRO_KEYS, MICRO_META, microsFor, sumMicros, type MicroKey, type Micros } from "@/lib/nutrition-micros";
import { getDayOfWeek, getStartOfDay } from "@/lib/utils";
import { focusWindow, median } from "./stats";
import { similarity } from "./extract";
import { dayKey } from "./storage";

export interface NewNudge {
  kind: string;
  key: string;
  title: string;
  body?: string;
  action?: { type: "todo-done" | "todo-delete" | "reminder-done" | "open"; id?: string; href?: string; label: string };
  /** Also send on Telegram (outside quiet hours). */
  telegram?: boolean;
}

const DAILY_KINDS = new Set(["streak", "nutrient-gap", "nutrient-over"]);

export const QUIET = { from: 22, to: 7 };
export function isQuietHour(d = new Date()) {
  const h = d.getHours();
  return h >= QUIET.from || h < QUIET.to;
}

/**
 * Save nudges, one per kind+key+day. Returns the ones that are new today (so only they get sent).
 */
export async function saveNudges(userId: string, list: NewNudge[], now = new Date()) {
  const day = dayKey(now);
  const fresh: (NewNudge & { id: string })[] = [];
  for (const n of list) {
    // Dismissed or done stays gone (for 30 days); daily kinds come back the next day by design.
    if (!DAILY_KINDS.has(n.kind)) {
      const closed = await prisma.brainNudge.findFirst({ where: { userId, kind: n.kind, key: n.key, status: { not: "active" }, createdAt: { gte: addDays(now, -30) } }, select: { id: true } });
      if (closed) continue;
    }
    try {
      const row = await prisma.brainNudge.create({
        data: { userId, kind: n.kind, key: n.key, day, title: n.title, body: n.body ?? null, action: (n.action ?? undefined) as Prisma.InputJsonValue | undefined },
      });
      fresh.push({ ...n, id: row.id });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
  }
  return fresh;
}

// ---- 2. Stuck-project rescue -------------------------------------------------------------------

export async function stuckProjects(userId: string, now = new Date()): Promise<NewNudge[]> {
  // 5–13 days idle gets a first step; 14+ days is goal-pulse's ("still going for it?").
  const cutoff = addDays(now, -5);
  const projects = await prisma.project.findMany({
    where: { userId, status: "active", updatedAt: { lt: cutoff }, OR: [{ updatedAt: { gte: addDays(now, -14) } }, { tasks: { some: { updatedAt: { gte: addDays(now, -14) } } } }] },
    select: { id: true, title: true, tasks: { where: { status: { not: "completed" } }, orderBy: { order: "asc" }, select: { title: true, updatedAt: true } } },
  });
  const out: NewNudge[] = [];
  for (const p of projects) {
    if (p.tasks.some((t) => t.updatedAt >= cutoff)) continue;
    const first = p.tasks[0];
    out.push({
      kind: "stuck-project",
      key: `${p.id}:${format(startOfWeek(now), "yyyy-MM-dd")}`,
      title: `“${p.title}” hasn't moved in 5+ days`,
      body: first ? `Tiny first step (10 min): start “${first.title}”.` : "Tiny first step (10 min): write down the very next thing to do for it.",
      action: { type: "open", href: "/todos", label: "Open" },
      telegram: true,
    });
  }
  return out.slice(0, 2);
}

// ---- 3. Streak saver ---------------------------------------------------------------------------

export function streakBefore(logs: { date: Date; completed: boolean }[], targetDays: string[], today: Date) {
  const done = new Set(logs.filter((l) => l.completed).map((l) => getStartOfDay(l.date).getTime()));
  let streak = 0;
  for (let i = 1; i <= 60; i++) {
    const d = addDays(today, -i);
    if (!targetDays.includes(getDayOfWeek(d))) continue;
    if (!done.has(d.getTime())) break;
    streak++;
  }
  return streak;
}

export async function streakSaver(userId: string, now = new Date()): Promise<NewNudge[]> {
  const today = getStartOfDay(now);
  const habits = await prisma.habit.findMany({
    where: { userId, isActive: true, targetDays: { has: getDayOfWeek(today) } },
    select: { id: true, name: true, targetDays: true, logs: { where: { date: { gte: addDays(today, -60) } }, select: { date: true, completed: true } } },
  });
  const out: NewNudge[] = [];
  for (const h of habits) {
    if (h.logs.some((l) => l.completed && getStartOfDay(l.date).getTime() === today.getTime())) continue;
    const streak = streakBefore(h.logs, h.targetDays, today);
    if (streak < 2) continue;
    out.push({ kind: "streak", key: h.id, title: `Keep your ${streak}-day “${h.name}” streak alive`, body: "It's still open today.", action: { type: "open", href: "/habits", label: "Habits" }, telegram: true });
  }
  return out;
}

// ---- 4. Nutrient gap coach ---------------------------------------------------------------------

/** Foods he has logged before, ranked by how much of `key` they carry per 100 g. */
export function richFoods(names: string[], key: MicroKey, limit = 3) {
  const seen = new Map<string, number>();
  for (const n of names) {
    const food = findFood(n);
    if (!food || seen.has(food.name)) continue;
    const m = microsFor(food.name);
    const v = m?.[key] ?? 0;
    if (v > 0) seen.set(food.name, v / MICRO_META[key].target);
  }
  return [...seen].sort((a, b) => b[1] - a[1]).filter(([, r]) => r >= 0.05).slice(0, limit).map(([n]) => n);
}

export async function nutrientGaps(userId: string, now = new Date()): Promise<NewNudge[]> {
  const today = getStartOfDay(now);
  const [todayMeals, history] = await Promise.all([
    prisma.meal.findMany({ where: { userId, status: "eaten", plannedFor: { gte: today, lt: addDays(today, 1) } }, select: { micros: true } }),
    prisma.meal.findMany({ where: { userId, status: "eaten", plannedFor: { gte: addDays(today, -60) } }, select: { items: true, name: true } }),
  ]);
  if (!todayMeals.length) return [];
  const totals = sumMicros(todayMeals.map((m) => m.micros as Micros | null));
  if (!Object.keys(totals).length) return [];
  const names = history.flatMap((m) => [m.name, ...(((m.items ?? []) as { name?: string }[]).map((i) => i.name ?? ""))]).filter(Boolean);
  const out: NewNudge[] = [];
  const gaps = MICRO_KEYS.filter((k) => !MICRO_META[k].limit && k !== "vitaminD")
    .map((k) => ({ k, ratio: (totals[k] ?? 0) / MICRO_META[k].target }))
    .filter((g) => g.ratio < 0.4)
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 2);
  for (const g of gaps) {
    const meta = MICRO_META[g.k];
    const foods = richFoods(names, g.k);
    out.push({
      kind: "nutrient-gap",
      key: g.k,
      title: `${meta.label} is low today: ${Math.round(totals[g.k] ?? 0)}/${meta.target} ${meta.unit}`,
      body: foods.length ? `Foods you already eat that help: ${foods.join(", ")}.` : undefined,
      telegram: true,
    });
  }
  for (const k of MICRO_KEYS.filter((k) => MICRO_META[k].limit)) {
    const v = totals[k] ?? 0;
    if (v > MICRO_META[k].target) out.push({ kind: "nutrient-over", key: k, title: `${MICRO_META[k].label} is over the daily limit: ${Math.round(v)}/${MICRO_META[k].target} ${MICRO_META[k].unit}` });
  }
  return out;
}

// ---- 5. Focus windows --------------------------------------------------------------------------

export async function bestWindow(userId: string, now = new Date()) {
  const since = addDays(now, -28);
  const [todos, tasks, logs] = await Promise.all([
    prisma.todo.findMany({ where: { userId, status: "done", completedAt: { gte: since } }, select: { completedAt: true } }),
    prisma.projectTask.findMany({ where: { project: { userId }, status: "completed", completedAt: { gte: since } }, select: { completedAt: true } }),
    prisma.habitLog.findMany({ where: { habit: { userId }, completed: true, createdAt: { gte: since } }, select: { createdAt: true } }),
  ]);
  return focusWindow([...todos.map((t) => t.completedAt!), ...tasks.map((t) => t.completedAt!), ...logs.map((l) => l.createdAt)]);
}

// ---- 6. Goal pulse -----------------------------------------------------------------------------

export async function goalPulse(userId: string, now = new Date()): Promise<NewNudge[]> {
  const cutoff = addDays(now, -14);
  const projects = await prisma.project.findMany({
    where: { userId, status: "active", createdAt: { lt: cutoff } },
    select: { id: true, title: true, updatedAt: true, tasks: { select: { updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 1 } },
  });
  const out: NewNudge[] = [];
  for (const p of projects) {
    const last = [p.updatedAt, p.tasks[0]?.updatedAt].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0]!;
    if (last >= cutoff) continue;
    out.push({
      kind: "goal-pulse",
      key: `${p.id}:${format(startOfWeek(now), "yyyy-MM-dd")}`,
      title: `Still going for “${p.title}”?`,
      body: `Nothing on it for ${differenceInCalendarDays(now, last)} days. Keep it, shrink it, or drop it — all fine.`,
      action: { type: "open", href: "/todos", label: "Open" },
      telegram: true,
    });
  }
  return out.slice(0, 1);
}

// ---- 9. Tidy-up --------------------------------------------------------------------------------

export async function tidyUp(userId: string, now = new Date()): Promise<NewNudge[]> {
  const [open, sent] = await Promise.all([
    prisma.todo.findMany({ where: { userId, status: "open" }, select: { id: true, title: true, createdAt: true, updatedAt: true, dueAt: true }, orderBy: { createdAt: "asc" } }),
    prisma.reminder.findMany({ where: { userId, status: "sent", recurrence: "none", sentAt: { lt: addDays(now, -7) } }, select: { id: true, text: true } }),
  ]);
  const out: NewNudge[] = [];
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  for (let i = 0; i < open.length; i++)
    for (let j = i + 1; j < open.length; j++) {
      const a = open[i];
      const b = open[j];
      if (norm(a.title) === norm(b.title) || similarity(a.title, b.title) >= 0.8) {
        out.push({ kind: "tidy", key: `dup:${b.id}`, title: `Duplicate to-do: “${b.title}”`, body: `Same as “${a.title}”.`, action: { type: "todo-delete", id: b.id, label: "Remove duplicate" } });
      }
    }
  for (const t of open) {
    if (t.updatedAt < addDays(now, -21) && (!t.dueAt || t.dueAt < addDays(now, -21))) {
      out.push({ kind: "tidy", key: `stale:${t.id}`, title: `Untouched for 3+ weeks: “${t.title}”`, body: "Still relevant? Clear it if not.", action: { type: "todo-delete", id: t.id, label: "Clear it" } });
    }
  }
  for (const r of sent) out.push({ kind: "tidy", key: `reminder:${r.id}`, title: `Old reminder never marked done: “${r.text}”`, action: { type: "reminder-done", id: r.id, label: "Mark done" } });
  return out.slice(0, 8);
}

// ---- 8. Personal journal prompt (evening check-in) ----------------------------------------------

export async function journalPrompt(userId: string, now = new Date()) {
  const today = getStartOfDay(now);
  const next = addDays(today, 1);
  const [missed, done, entry] = await Promise.all([
    prisma.habit.findMany({ where: { userId, isActive: true, targetDays: { has: getDayOfWeek(today) }, logs: { none: { date: today, completed: true } } }, select: { name: true }, take: 1 }),
    prisma.todo.count({ where: { userId, status: "done", completedAt: { gte: today, lt: next } } }),
    prisma.dailyEntry.findUnique({ where: { userId_date: { userId, date: today } }, select: { sleepHours: true, screenTimeHours: true } }),
  ]);
  if (entry?.screenTimeHours != null && entry.screenTimeHours > 4) return `📝 Screen time hit ${entry.screenTimeHours}h today. What pulled you in, and what would've been worth that time instead?`;
  if (missed.length) return `📝 “${missed[0].name}” didn't happen today. What got in the way — and what would make it easier tomorrow?`;
  if (done >= 4) return `📝 You finished ${done} things today. What made today work that you could repeat?`;
  if (entry?.sleepHours != null && entry.sleepHours < 6.5) return `📝 You slept ${entry.sleepHours}h last night. How did it show up today?`;
  return "📝 How did today go? One win, one miss, one thing for tomorrow.";
}

// ---- 10. Sleep / training vs score links --------------------------------------------------------

/** Honest weekly correlations: only stated with ≥10 days of data and a clear gap. */
export async function scoreLinks(userId: string, now = new Date()) {
  const since = addDays(getStartOfDay(now), -60);
  const [scores, entries, workouts] = await Promise.all([
    prisma.categoryScore.findMany({ where: { userId, date: { gte: since }, finalized: true, judgedBy: { not: null } }, select: { date: true, overall: true } }),
    prisma.dailyEntry.findMany({ where: { userId, date: { gte: since } }, select: { date: true, sleepHours: true, screenTimeHours: true } }),
    prisma.workoutSession.findMany({ where: { userId, date: { gte: since } }, select: { date: true } }),
  ]);
  const scoreByDay = new Map(scores.map((s) => [dayKey(s.date), s.overall]));
  const lines: string[] = [];
  const compare = (label: string, yes: number[], no: number[], yesLabel: string, noLabel: string) => {
    if (yes.length + no.length < 10 || yes.length < 3 || no.length < 3) return;
    const a = median(yes)!;
    const b = median(no)!;
    if (Math.abs(a - b) >= 1) lines.push(`${label}: your day scores ${a.toFixed(1)} ${yesLabel} vs ${b.toFixed(1)} ${noLabel} (median of ${yes.length} vs ${no.length} days).`);
  };
  const sleepYes: number[] = [];
  const sleepNo: number[] = [];
  const screenHi: number[] = [];
  const screenLo: number[] = [];
  for (const e of entries) {
    const s = scoreByDay.get(dayKey(e.date));
    if (s == null) continue;
    if (e.sleepHours != null) (e.sleepHours >= 7 ? sleepYes : sleepNo).push(s);
    if (e.screenTimeHours != null) (e.screenTimeHours > 4 ? screenHi : screenLo).push(s);
  }
  compare("Sleep", sleepYes, sleepNo, "after 7h+ of sleep", "after less");
  compare("Screen time", screenHi, screenLo, "on 4h+ screen days", "on lighter days");
  const trained = new Set(workouts.map((w) => dayKey(w.date)));
  const wYes = scores.filter((s) => trained.has(dayKey(s.date))).map((s) => s.overall);
  const wNo = scores.filter((s) => !trained.has(dayKey(s.date))).map((s) => s.overall);
  compare("Training", wYes, wNo, "on workout days", "on rest days");
  return lines;
}

/** Jobs that run on their own schedule, with the hours they may run in. */
export const SCHEDULED: { name: string; from: number; to: number; run: (userId: string, now: Date) => Promise<NewNudge[]> }[] = [
  { name: "stuck-projects", from: 10, to: 20, run: stuckProjects },
  { name: "goal-pulse", from: 11, to: 20, run: goalPulse },
  { name: "tidy", from: 9, to: 21, run: tidyUp },
  { name: "nutrient-gap", from: 18, to: 20, run: nutrientGaps },
  { name: "streak", from: 20, to: 21, run: streakSaver },
];
