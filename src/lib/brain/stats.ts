/**
 * Numbers computed straight from his data: how long things take him, when he gets things done,
 * which habits stick, what he eats and trains. No model, so nothing here can be made up.
 */
import { addDays, differenceInMinutes, format } from "date-fns";
import prisma from "@/lib/prisma";
import { getDayOfWeek, getStartOfDay } from "@/lib/utils";
import type { CategoryId } from "./categories";

export function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function humanMinutes(mins: number) {
  if (mins < 90) return `${Math.round(mins)} min`;
  if (mins < 36 * 60) return `${Math.round((mins / 60) * 10) / 10} h`;
  return `${Math.round((mins / 1440) * 10) / 10} days`;
}

function clockOf(minuteOfDay: number) {
  const d = new Date(2000, 0, 1, 0, minuteOfDay);
  return format(d, d.getMinutes() ? "h:mmaaa" : "haaa");
}

/**
 * Best 90-minute window of the day, from the times he finished things. Null until there's enough
 * data (at least 8 completions on at least 4 different days).
 */
export function focusWindow(times: Date[]) {
  const days = new Set(times.map((t) => format(t, "yyyy-MM-dd")));
  if (times.length < 8 || days.size < 4) return null;
  const bins = new Array(48).fill(0);
  for (const t of times) bins[t.getHours() * 2 + (t.getMinutes() >= 30 ? 1 : 0)]++;
  let best = 0;
  let at = 0;
  for (let i = 0; i < 48; i++) {
    const sum = bins[i] + bins[(i + 1) % 48] + bins[(i + 2) % 48];
    if (sum > best) {
      best = sum;
      at = i;
    }
  }
  return { start: at * 30, end: at * 30 + 90, share: best / times.length, label: `${clockOf(at * 30)}–${clockOf(at * 30 + 90)}` };
}

export function timeBuckets(times: Date[]) {
  const b = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  for (const t of times) {
    const h = t.getHours();
    if (h >= 5 && h < 12) b.morning++;
    else if (h < 17 && h >= 12) b.afternoon++;
    else if (h >= 17 && h < 21) b.evening++;
    else b.night++;
  }
  return b;
}

const pct = (n: number, d: number) => `${Math.round((n / Math.max(1, d)) * 100)}%`;

/** Stats for each computed category, from the last `days` days. */
export async function computeStats(userId: string, now = new Date(), days = 60): Promise<Partial<Record<CategoryId, string[]>>> {
  const since = addDays(getStartOfDay(now), -days);
  const [todos, tasks, habits, meals, workouts, entries, messages] = await Promise.all([
    prisma.todo.findMany({ where: { userId, status: "done", completedAt: { gte: since } }, select: { area: true, createdAt: true, completedAt: true, dueAt: true } }),
    prisma.projectTask.findMany({ where: { project: { userId }, status: "completed", completedAt: { gte: since } }, select: { createdAt: true, completedAt: true, estimatedMinutes: true, actualMinutes: true } }),
    prisma.habit.findMany({ where: { userId, isActive: true }, select: { name: true, targetDays: true, createdAt: true, logs: { where: { date: { gte: addDays(getStartOfDay(now), -28) } }, select: { date: true, completed: true, createdAt: true } } } }),
    prisma.meal.findMany({ where: { userId, status: "eaten", plannedFor: { gte: since } }, select: { name: true, category: true, calories: true, protein: true, plannedFor: true } }),
    prisma.workoutSession.findMany({ where: { userId, date: { gte: since } }, select: { date: true, routine: { select: { name: true } }, exerciseLogs: { select: { exerciseName: true } } } }),
    prisma.dailyEntry.findMany({ where: { userId, date: { gte: since } }, select: { date: true, sleepHours: true, screenTimeHours: true, moneySpent: true, moneySaved: true, rightWithGod: true, bedtime: true, wakeTime: true } }),
    prisma.chatMessage.findMany({ where: { userId, role: "user", createdAt: { gte: addDays(now, -28) } }, select: { createdAt: true } }),
  ]);
  const out: Partial<Record<CategoryId, string[]>> = {};

  // How long things take.
  const durations: string[] = [];
  const leads = todos.map((t) => differenceInMinutes(t.completedAt!, t.createdAt));
  const m = median(leads);
  if (m != null && todos.length >= 5) {
    durations.push(`To-dos usually get done ${humanMinutes(m)} after you add them (median of ${todos.length}).`);
    durations.push(`${pct(leads.filter((x) => x < 24 * 60).length, leads.length)} are done within a day; ${pct(leads.filter((x) => x >= 7 * 24 * 60).length, leads.length)} sit a week or more.`);
    const byArea = new Map<string, number[]>();
    for (const [i, t] of todos.entries()) byArea.set(t.area, [...(byArea.get(t.area) ?? []), leads[i]]);
    const areaLines = [...byArea]
      .filter(([, xs]) => xs.length >= 3)
      .map(([a, xs]) => `${a} ${humanMinutes(median(xs)!)}`)
      .join(", ");
    if (areaLines) durations.push(`By area: ${areaLines}.`);
    const withDue = todos.filter((t) => t.dueAt);
    if (withDue.length >= 4) durations.push(`${pct(withDue.filter((t) => t.completedAt! <= new Date(t.dueAt!.getTime() + 3_600_000)).length, withDue.length)} of dated to-dos finished on time.`);
  }
  const est = tasks.filter((t) => t.estimatedMinutes && t.actualMinutes);
  if (est.length >= 3) {
    const ratio = median(est.map((t) => t.actualMinutes! / t.estimatedMinutes!))!;
    durations.push(`Project tasks take ${ratio.toFixed(1)}× your estimate (median of ${est.length}).`);
  }
  if (durations.length) out["task-durations"] = durations;

  // When he gets things done.
  const doneTimes = [...todos.map((t) => t.completedAt!), ...tasks.map((t) => t.completedAt!), ...habits.flatMap((h) => h.logs.filter((l) => l.completed).map((l) => l.createdAt))];
  const energy: string[] = [];
  if (doneTimes.length >= 8) {
    const b = timeBuckets(doneTimes);
    const order = (Object.entries(b) as [string, number][]).sort((a, c) => c[1] - a[1]);
    energy.push(`You get most done in the ${order[0][0]} (${pct(order[0][1], doneTimes.length)} of completions), least in the ${order[3][0]}.`);
    const w = focusWindow(doneTimes);
    if (w && w.share >= 0.15) energy.push(`Best 90 minutes: ${w.label} (${pct(Math.round(w.share * doneTimes.length), doneTimes.length)} of everything you finish).`);
  }
  if (energy.length) out.energy = energy;

  // Habits.
  const habitLines: string[] = [];
  const rates = habits
    .map((h) => {
      let due = 0;
      let done = 0;
      for (let i = 1; i <= 28; i++) {
        const d = addDays(getStartOfDay(now), -i);
        if (d < getStartOfDay(h.createdAt) || !h.targetDays.includes(getDayOfWeek(d))) continue;
        due++;
        if (h.logs.some((l) => l.completed && getStartOfDay(l.date).getTime() === d.getTime())) done++;
      }
      return { name: h.name, due, done };
    })
    .filter((r) => r.due >= 4)
    .sort((a, b) => b.done / b.due - a.done / a.due);
  for (const r of rates.slice(0, 8)) habitLines.push(`${r.name}: ${r.done}/${r.due} days in the last 4 weeks (${pct(r.done, r.due)}).`);
  if (habitLines.length) out.habits = habitLines;

  // Food.
  const food: string[] = [];
  if (meals.length >= 5) {
    const freq = new Map<string, number>();
    for (const x of meals) freq.set(x.name.toLowerCase(), (freq.get(x.name.toLowerCase()) ?? 0) + 1);
    const top = [...freq].sort((a, b) => b[1] - a[1]).filter(([, n]) => n >= 2).slice(0, 6);
    if (top.length) food.push(`Most eaten: ${top.map(([n, c]) => `${n} (${c}×)`).join(", ")}.`);
    const byDay = new Map<string, { kcal: number; protein: number }>();
    for (const x of meals) {
      if (!x.calories || !x.plannedFor) continue;
      const k = format(x.plannedFor, "yyyy-MM-dd");
      const d = byDay.get(k) ?? { kcal: 0, protein: 0 };
      d.kcal += x.calories;
      d.protein += x.protein ?? 0;
      byDay.set(k, d);
    }
    if (byDay.size >= 3) {
      const ds = [...byDay.values()];
      food.push(`On days you log food: ~${Math.round(median(ds.map((d) => d.kcal))!)} kcal and ~${Math.round(median(ds.map((d) => d.protein))!)} g protein (median of ${ds.length} days).`);
    }
    const cats = timeBuckets(meals.filter((x) => x.plannedFor).map((x) => x.plannedFor!));
    if (cats.night >= 3) food.push(`${cats.night} meals logged late at night.`);
  }
  if (food.length) out.food = food;

  // Training.
  const training: string[] = [];
  if (workouts.length >= 2) {
    const weeks = Math.max(1, days / 7);
    training.push(`${workouts.length} workouts in ${days} days (~${(workouts.length / weeks).toFixed(1)} a week).`);
    const r = new Map<string, number>();
    for (const w of workouts) r.set(w.routine.name, (r.get(w.routine.name) ?? 0) + 1);
    training.push(`Routines: ${[...r].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n, c]) => `${n} ${c}×`).join(", ")}.`);
    const b = timeBuckets(workouts.map((w) => w.date));
    const top = (Object.entries(b) as [string, number][]).sort((a, c) => c[1] - a[1])[0];
    if (top[1] >= 2) training.push(`Usually trains in the ${top[0]}.`);
  }
  if (training.length) out.training = training;

  // Sleep, screen, money, faith from the journal quick log.
  const sleeps = entries.filter((e) => e.sleepHours != null).map((e) => e.sleepHours!);
  if (sleeps.length >= 3) out.sleep = [`Average sleep ${(sleeps.reduce((a, b) => a + b, 0) / sleeps.length).toFixed(1)} h over ${sleeps.length} logged nights; ${pct(sleeps.filter((s) => s >= 7).length, sleeps.length)} were 7 h or more.`];
  const screens = entries.filter((e) => e.screenTimeHours != null).map((e) => e.screenTimeHours!);
  if (screens.length >= 3) out.distractions = [`Average screen time ${(screens.reduce((a, b) => a + b, 0) / screens.length).toFixed(1)} h a day over ${screens.length} logged days.`];
  const spent = entries.filter((e) => e.moneySpent != null).map((e) => e.moneySpent!);
  const saved = entries.filter((e) => e.moneySaved != null).map((e) => e.moneySaved!);
  if (spent.length + saved.length >= 3) out.money = [`Logged $${Math.round(spent.reduce((a, b) => a + b, 0))} spent and $${Math.round(saved.reduce((a, b) => a + b, 0))} saved in ${days} days.`];
  if (entries.length >= 5) out.faith = [`Marked "right with God" on ${entries.filter((e) => e.rightWithGod).length} of ${entries.length} journal days.`];

  // Daily rhythm, from when he's active in the app.
  const active = [...messages.map((x) => x.createdAt), ...doneTimes.filter((t) => t >= addDays(now, -28))];
  if (active.length >= 15) {
    const byDay = new Map<string, Date[]>();
    for (const t of active) {
      const k = format(t, "yyyy-MM-dd");
      byDay.set(k, [...(byDay.get(k) ?? []), t]);
    }
    const mins = (d: Date) => d.getHours() * 60 + d.getMinutes();
    const firsts = [...byDay.values()].map((ts) => Math.min(...ts.map(mins)));
    const lasts = [...byDay.values()].map((ts) => Math.max(...ts.map(mins)));
    if (byDay.size >= 5) out.routine = [`Usually active from about ${clockOf(Math.round(median(firsts)! / 15) * 15)} to ${clockOf(Math.round(median(lasts)! / 15) * 15)} (last 4 weeks).`];
  }
  return out;
}
