/**
 * Ingest: copy what happened since the last run from the database into the day's evidence file.
 * No model involved. Event text is written by code, with descriptive words (time of day, how long
 * something took) so later claims can be checked against it.
 *
 * Private notes (the Notes tab) are deliberately not ingested: they hold things like codes and
 * passwords that don't belong in a profile.
 */
import { addDays, differenceInHours, differenceInMinutes, format } from "date-fns";
import prisma from "@/lib/prisma";
import { getDayOfWeek, getStartOfDay } from "@/lib/utils";
import { dayKey, shortHash, type BrainStore, type Evidence } from "./storage";

export function timeOfDay(d: Date) {
  const h = d.getHours();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

function clock(d: Date) {
  return format(d, "h:mmaaa");
}

export function lead(from: Date, to: Date) {
  const mins = differenceInMinutes(to, from);
  if (mins < 60) return `${Math.max(1, mins)} minutes after adding it (quick)`;
  const hours = differenceInHours(to, from);
  if (hours < 24) return `${hours} hours after adding it (same day)`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} after adding it${days >= 7 ? " (slow, put off)" : ""}`;
}

export function ev(key: string, t: Date, kind: string, text: string, src: Evidence["src"] = "data"): Evidence {
  return { id: `${dayKey(t).replace(/-/g, "")}:${shortHash(key)}`, t: t.toISOString(), kind, text: text.slice(0, 500), src };
}

const clip = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Everything that changed in (since, until]. Overlapping windows are fine: ids dedupe. */
export async function collectEvents(userId: string, since: Date, until: Date): Promise<Evidence[]> {
  const win = { gt: since, lte: until };
  const [messages, todosNew, todosDone, tasksDone, habitLogs, meals, workouts, entries, projects] = await Promise.all([
    prisma.chatMessage.findMany({ where: { userId, role: "user", createdAt: win }, select: { id: true, content: true, createdAt: true, source: true } }),
    prisma.todo.findMany({ where: { userId, createdAt: win }, select: { id: true, title: true, area: true, priority: true, dueAt: true, createdAt: true } }),
    prisma.todo.findMany({ where: { userId, status: "done", completedAt: win }, select: { id: true, title: true, area: true, createdAt: true, completedAt: true, dueAt: true } }),
    prisma.projectTask.findMany({
      where: { project: { userId }, status: "completed", completedAt: win },
      select: { id: true, title: true, createdAt: true, completedAt: true, startedAt: true, estimatedMinutes: true, actualMinutes: true, project: { select: { title: true } } },
    }),
    prisma.habitLog.findMany({ where: { habit: { userId }, completed: true, createdAt: win }, select: { id: true, createdAt: true, date: true, habit: { select: { name: true, area: true } } } }),
    prisma.meal.findMany({ where: { userId, status: "eaten", updatedAt: win }, select: { id: true, name: true, category: true, calories: true, protein: true, plannedFor: true, updatedAt: true } }),
    prisma.workoutSession.findMany({
      where: { userId, createdAt: win },
      select: { id: true, createdAt: true, routine: { select: { name: true } }, exerciseLogs: { select: { exerciseName: true, weight: true, sets: true, reps: true } } },
    }),
    prisma.dailyEntry.findMany({ where: { userId, updatedAt: win } }),
    prisma.project.findMany({ where: { userId, OR: [{ createdAt: win }, { completedAt: win }] }, select: { id: true, title: true, area: true, createdAt: true, completedAt: true, status: true } }),
  ]);

  const out: Evidence[] = [];
  for (const m of messages) {
    const text = m.content.trim();
    if (!text) continue;
    out.push(ev(`msg:${m.id}`, m.createdAt, "said", `He said (${timeOfDay(m.createdAt)}): "${clip(text, 400)}"`, "said"));
  }
  for (const t of todosNew) {
    out.push(ev(`todo-new:${t.id}`, t.createdAt, "todo-added", `Added to-do "${clip(t.title)}" (${t.area}, ${t.priority} priority${t.dueAt ? `, due ${format(t.dueAt, "EEE MMM d")}` : ""}) in the ${timeOfDay(t.createdAt)}`));
  }
  for (const t of todosDone) {
    const done = t.completedAt!;
    const late = t.dueAt && done.getTime() > t.dueAt.getTime() + 3_600_000 ? ", after its due time (late)" : t.dueAt ? ", on time" : "";
    out.push(ev(`todo-done:${t.id}`, done, "task-done", `Finished to-do task "${clip(t.title)}" (${t.area}) in the ${timeOfDay(done)} at ${clock(done)}, ${lead(t.createdAt, done)}${late}`));
  }
  for (const t of tasksDone) {
    const done = t.completedAt!;
    const effort =
      t.actualMinutes != null
        ? `; took ${t.actualMinutes} minutes${t.estimatedMinutes ? ` vs ${t.estimatedMinutes} estimated` : ""}`
        : t.startedAt
          ? `; took ${differenceInMinutes(done, t.startedAt)} minutes from start`
          : "";
    out.push(ev(`task-done:${t.id}`, done, "task-done", `Finished project task "${clip(t.title)}" in project "${clip(t.project.title, 50)}" in the ${timeOfDay(done)} at ${clock(done)}, ${lead(t.createdAt, done)}${effort}`));
  }
  for (const p of projects) {
    if (p.createdAt > since) out.push(ev(`project-new:${p.id}`, p.createdAt, "goal", `Started project / goal "${clip(p.title)}" (${p.area})`));
    if (p.completedAt && p.completedAt > since) out.push(ev(`project-done:${p.id}`, p.completedAt, "goal", `Completed project / goal "${clip(p.title)}" (${p.area})`));
  }
  for (const h of habitLogs) {
    out.push(ev(`habit:${h.id}`, h.createdAt, "habit-done", `Did habit "${h.habit.name}" (${h.habit.area}) in the ${timeOfDay(h.createdAt)} at ${clock(h.createdAt)}`));
  }
  for (const m of meals) {
    const at = m.plannedFor ?? m.updatedAt;
    out.push(ev(`meal:${m.id}`, at, "ate", `Ate food "${clip(m.name)}" for ${m.category}${m.calories ? ` (${m.calories} kcal${m.protein ? `, ${Math.round(m.protein)}g protein` : ""})` : ""} in the ${timeOfDay(at)}`));
  }
  for (const w of workouts) {
    const lifts = w.exerciseLogs.map((x) => `${x.exerciseName}${x.weight ? ` ${x.weight}` : ""}${x.sets ? ` ${x.sets}x${x.reps ?? ""}` : ""}`).join(", ");
    out.push(ev(`workout:${w.id}`, w.createdAt, "workout", `Workout training session "${w.routine.name}" in the ${timeOfDay(w.createdAt)}${lifts ? `: ${clip(lifts, 200)}` : ""}`));
  }
  for (const e of entries) {
    const at = e.updatedAt;
    const day = format(e.date, "EEE MMM d");
    // Keyed on content so an edited journal becomes new evidence, an unchanged one doesn't repeat.
    if (e.notes?.trim()) out.push(ev(`journal:${e.id}:${shortHash(e.notes)}`, at, "journal", `Journal for ${day}, he wrote: "${clip(e.notes.trim(), 450)}"`, "said"));
    if (e.sleepHours != null) out.push(ev(`sleep:${e.id}:${e.sleepHours}`, at, "sleep", `Slept ${e.sleepHours} hours of sleep the night before ${day}${e.sleepHours < 7 ? " (short, under 7)" : e.sleepHours > 9 ? " (long, over 9)" : " (good, 7-9)"}`));
    if (e.screenTimeHours != null) out.push(ev(`screen:${e.id}:${e.screenTimeHours}`, at, "screen", `Screen time on phone ${e.screenTimeHours} hours on ${day}${e.screenTimeHours > 4 ? " (high)" : ""}`));
    if (e.moneySpent != null) out.push(ev(`spent:${e.id}:${e.moneySpent}`, at, "money", `Money: spent $${e.moneySpent} on ${day}`));
    if (e.moneySaved != null) out.push(ev(`saved:${e.id}:${e.moneySaved}`, at, "money", `Money: saved $${e.moneySaved} on ${day}`));
    if (e.rightWithGod) out.push(ev(`god:${e.id}`, at, "faith", `Faith: felt right with God on ${day}`));
  }
  return out;
}

/** Things only knowable once a day is over: missed habits and the final scores. */
export async function collectDayClose(userId: string, date: Date): Promise<Evidence[]> {
  const day = getStartOfDay(date);
  const end = new Date(addDays(day, 1).getTime() - 60_000);
  const dow = getDayOfWeek(day);
  const [habits, score] = await Promise.all([
    prisma.habit.findMany({
      where: { userId, isActive: true, targetDays: { has: dow }, createdAt: { lt: addDays(day, 1) } },
      select: { id: true, name: true, area: true, logs: { where: { date: day }, select: { completed: true } } },
    }),
    prisma.categoryScore.findUnique({ where: { userId_date: { userId, date: day } } }),
  ]);
  const out: Evidence[] = [];
  const label = format(day, "EEE MMM d");
  for (const h of habits) {
    if (!h.logs[0]?.completed) out.push(ev(`habit-missed:${h.id}:${dayKey(day)}`, end, "habit-missed", `Missed habit "${h.name}" (${h.area}) on ${label}`));
  }
  if (score && score.judgedBy) {
    out.push(
      ev(
        `score:${dayKey(day)}`,
        end,
        "score",
        `Day scores for ${label}: physical ${Math.round(score.physical)}, mental ${Math.round(score.mental)}, financial ${Math.round(score.financial)}, spiritual ${Math.round(score.spiritual)}, overall ${score.overall.toFixed(1)}`
      )
    );
  }
  return out;
}

export interface IngestState {
  ingestedUntil?: string;
  closedDays?: string[];
}

/** Ingest everything new. Pauses (returns 0) if the store is at its hard cap. */
export async function ingest(store: BrainStore, userId: string, state: IngestState, now = new Date()) {
  if (store.manifest().total >= store.caps.hard) return { added: [] as Evidence[], paused: true };
  // Small overlap covers rows committed out of order; ids dedupe.
  const since = state.ingestedUntil ? new Date(new Date(state.ingestedUntil).getTime() - 120_000) : addDays(now, -30);
  const events = await collectEvents(userId, since, now);

  // Close out any finished days not yet closed (yesterday, or days missed while down).
  const closed = new Set(state.closedDays ?? []);
  for (let d = addDays(getStartOfDay(now), -3); d < getStartOfDay(now); d = addDays(d, 1)) {
    const key = dayKey(d);
    if (closed.has(key)) continue;
    // Wait until the nightly judge (23:30) has had its chance, i.e. close days only after 00:30.
    if (now.getTime() - addDays(d, 1).getTime() < 30 * 60_000) continue;
    events.push(...(await collectDayClose(userId, d)));
    closed.add(key);
  }

  const added = store.appendEvidence(events);
  state.ingestedUntil = now.toISOString();
  state.closedDays = [...closed].sort().slice(-14);
  return { added, paused: false };
}
