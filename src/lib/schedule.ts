/**
 * The built-in schedule. His fixed week (school, practice…) plus one-off events are stored; each
 * day's timeline is built from them by code (no model, always current):
 *
 *   wake → morning routine (his morning habits)
 *   fixed blocks and events
 *   workout on training days (after school, ending ≥ 2 h before bed)
 *   study sessions due today (evening, before wind-down)
 *   today's focus items (plan + anything due today), highest priority first, into free gaps
 *   evening routine (evening habits) → wind down (no screens) → bed
 *
 * Wake time comes from bedtime and his sleep target (10pm + 9 h → 7am) unless he set it.
 */
import { stateKey } from "@/lib/request-context";
import { addDays, format } from "date-fns";
import prisma from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { getDayOfWeek, getStartOfDay } from "@/lib/utils";
import { readBody } from "@/lib/body";
import { todaysTraining } from "@/lib/training";

export const SCHEDULE_PREFS_KEY = "schedule-prefs";
export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export interface SchedulePrefs {
  bedtime: string; // "22:00"
  wake?: string | null; // "06:45"; default bedtime + sleep target
  weekendBedtime?: string | null;
}

export interface Block {
  start: string;
  end: string;
  title: string;
  kind: "sleep" | "routine" | "fixed" | "event" | "workout" | "study" | "focus" | "wind-down";
  area?: string;
  /** Item it stands for, so it can be ticked off: todo/task/habit/routine id. */
  ref?: { type: "todo" | "task" | "habit" | "workout" | "event"; id: string };
  done?: boolean;
  detail?: string;
}

export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
export const toHHMM = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
export function fmt12(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const hh = h % 12 || 12;
  return `${hh}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}

export async function readPrefs(userId?: string): Promise<SchedulePrefs> {
  const row = await prisma.brainState.findUnique({ where: { key: stateKey(SCHEDULE_PREFS_KEY, userId) } });
  return { bedtime: "22:00", ...((row?.value ?? {}) as Partial<SchedulePrefs>) };
}

export async function writePrefs(p: SchedulePrefs, userId?: string) {
  const value = p as unknown as Prisma.InputJsonValue;
  await prisma.brainState.upsert({ where: { key: stateKey(SCHEDULE_PREFS_KEY, userId) }, update: { value }, create: { key: stateKey(SCHEDULE_PREFS_KEY, userId), value } });
}

/** Free gaps in [from, to) given busy intervals (minutes). */
export function gaps(busy: [number, number][], from: number, to: number) {
  const sorted = [...busy].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let cur = from;
  for (const [s, e] of sorted) {
    if (e <= cur) continue;
    if (s > cur) out.push([cur, Math.min(s, to)]);
    cur = Math.max(cur, e);
    if (cur >= to) break;
  }
  if (cur < to) out.push([cur, to]);
  return out.filter(([s, e]) => e - s >= 5);
}

/** Put a block of `len` minutes in the first gap at/after `after` (and before `before`). */
export function place(busy: [number, number][], len: number, after: number, before: number, buffer = 10): [number, number] | null {
  for (const [s, e] of gaps(busy, after, before)) {
    const start = Math.ceil((s + (busy.some(([, be]) => be === s) ? buffer : 0)) / 5) * 5;
    if (start + len <= e) return [start, start + len];
  }
  return null;
}

export interface DaySchedule {
  date: string;
  /** All-day calendar events. */
  allDay: { id: string; title: string; source: string }[];
  wake: string;
  bed: string;
  blocks: Block[];
  unscheduled: string[];
}

const PRIORITY: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/** Build a day's timeline. `now` (for today) keeps new placements in the future. */
export async function buildSchedule(userId: string, date = new Date(), now = new Date()): Promise<DaySchedule> {
  const day = getStartOfDay(date);
  const next = addDays(day, 1);
  const dow = getDayOfWeek(day);
  const weekend = dow === "sat" || dow === "sun";
  const [prefs, body, fixed, habits, plan, dueTodos, training, events] = await Promise.all([
    readPrefs(userId),
    readBody(userId),
    prisma.scheduleBlock.findMany({ where: { userId, OR: [{ days: { has: dow } }, { date: day }] } }),
    prisma.habit.findMany({ where: { userId, isActive: true, targetDays: { has: dow } }, select: { id: true, name: true, timeOfDay: true, logs: { where: { date: day }, select: { completed: true } } } }),
    prisma.dayPlan.findUnique({ where: { userId_date: { userId, date: day } } }),
    prisma.todo.findMany({ where: { userId, dueAt: { gte: day, lt: next } }, select: { id: true, title: true, area: true, priority: true, status: true, dueAt: true } }),
    todaysTraining(userId, day),
    prisma.calendarEvent.findMany({ where: { userId, status: "confirmed", start: { lt: next }, end: { gt: day } }, orderBy: { start: "asc" } }),
  ]);

  const sleepH = body.sleepTargetHours ?? 8;
  const bedStr = (weekend ? prefs.weekendBedtime : null) ?? prefs.bedtime;
  const bed = toMin(bedStr) < 12 * 60 ? toMin(bedStr) + 1440 : toMin(bedStr); // after-midnight bedtimes
  const wake = prefs.wake ? toMin(prefs.wake) : (bed - 1440 + sleepH * 60 + 1440) % 1440;
  const blocks: Block[] = [];
  const busy: [number, number][] = [];
  const add = (s: number, e: number, b: Omit<Block, "start" | "end">) => {
    blocks.push({ ...b, start: toHHMM(s), end: toHHMM(e) });
    busy.push([s, e]);
  };
  const isToday = getStartOfDay(now).getTime() === day.getTime();
  const earliest = isToday ? Math.max(wake, now.getHours() * 60 + now.getMinutes()) : wake;
  const unscheduled: string[] = [];

  // Morning routine: his morning habits in one block.
  const morning = habits.filter((h) => h.timeOfDay === "morning");
  if (morning.length) {
    add(wake, wake + Math.min(30, 5 + morning.length * 5), { title: "Morning routine", kind: "routine", detail: morning.map((h) => h.name).join(" · "), done: morning.every((h) => h.logs[0]?.completed) });
  }

  // Fixed blocks and events.
  for (const f of fixed.sort((a, b) => toMin(a.start) - toMin(b.start))) {
    add(toMin(f.start), toMin(f.end) < toMin(f.start) ? toMin(f.end) + 1440 : toMin(f.end), { title: f.title, kind: f.date ? "event" : "fixed", area: f.area });
  }

  // Calendar events (his Google Calendar + ones made here). Timed ones are fixed points in the day.
  for (const e of events.filter((e) => !e.allDay)) {
    const s0 = e.start < day ? 0 : e.start.getHours() * 60 + e.start.getMinutes();
    const e0 = e.end >= next ? 24 * 60 - 1 : e.end.getHours() * 60 + e.end.getMinutes();
    if (e0 > s0) add(s0, e0, { title: e.title, kind: "event", ref: { type: "event", id: e.id }, detail: [e.location, e.attendees.length ? `with ${e.attendees.join(", ")}` : null, e.source === "google" ? "Google Calendar" : null].filter(Boolean).join(" · ") || undefined });
  }

  // Evening: routine, then wind down before bed.
  const evening = habits.filter((h) => h.timeOfDay === "evening");
  add(bed - 30, bed, { title: "Wind down — no screens", kind: "wind-down" });
  if (evening.length) add(bed - 30 - Math.min(20, 5 + evening.length * 5), bed - 30, { title: "Evening routine", kind: "routine", detail: evening.map((h) => h.name).join(" · "), done: evening.every((h) => h.logs[0]?.completed) });

  // Workout: after 3pm (after school), finishing ≥ 2 h before bed.
  for (const p of training.plans) {
    const len = /posture|abs/i.test(p.name) ? 15 : 75;
    const slot = place(busy, len, Math.max(earliest, len > 20 ? 15 * 60 : wake), bed - (len > 20 ? 120 : 45)) ?? place(busy, len, earliest, bed - 45);
    if (slot) add(slot[0], slot[1], { title: p.name, kind: "workout", area: "physical", ref: { type: "workout", id: p.routineId }, detail: p.exercises.slice(0, 3).map((e) => `${e.name} ${e.suggestion.next}`).join(" · ") });
    else unscheduled.push(p.name);
  }

  // Study sessions due today: evening, 45 min each.
  const open = dueTodos.filter((t) => t.status === "open");
  const study = open.filter((t) => /\b(study|prep|review|outline|draft|edit|rehearse)\b/i.test(t.title));
  for (const t of study) {
    const slot = place(busy, 45, Math.max(earliest, 16 * 60), bed - 30) ?? place(busy, 45, earliest, bed - 30);
    if (slot) add(slot[0], slot[1], { title: t.title, kind: "study", area: t.area, ref: { type: "todo", id: t.id } });
    else unscheduled.push(t.title);
  }

  // Focus items: the day plan, then anything else due today.
  const planItems = ((plan?.items ?? []) as { type: string; id: string; title: string; area: string }[]).filter((i) => i.type === "todo" || i.type === "task");
  const taskMinutes = planItems.some((i) => i.type === "task")
    ? new Map((await prisma.projectTask.findMany({ where: { id: { in: planItems.filter((i) => i.type === "task").map((i) => i.id) } }, select: { id: true, estimatedMinutes: true, status: true } })).map((t) => [t.id, t]))
    : new Map();
  const doneTodos = new Set(dueTodos.filter((t) => t.status === "done").map((t) => t.id));
  const openTodoIds = new Set((await prisma.todo.findMany({ where: { id: { in: planItems.filter((i) => i.type === "todo").map((i) => i.id) } }, select: { id: true, status: true } })).filter((t) => t.status === "open").map((t) => t.id));
  const focus = [
    ...planItems.filter((i) => (i.type === "todo" ? openTodoIds.has(i.id) : taskMinutes.get(i.id)?.status !== "completed")).map((i) => ({ ...i, priority: "medium" as string, minutes: taskMinutes.get(i.id)?.estimatedMinutes ?? 30 })),
    ...open.filter((t) => !study.includes(t) && !planItems.some((i) => i.id === t.id)).map((t) => ({ type: "todo", id: t.id, title: t.title, area: t.area, priority: t.priority, minutes: 30 })),
  ].sort((a, b) => (PRIORITY[a.priority] ?? 2) - (PRIORITY[b.priority] ?? 2));
  // Focus work goes after the fixed daytime commitments (school/work), not squeezed in before them.
  const dayFixedEnd = Math.max(0, ...fixed.filter((f) => toMin(f.start) < 12 * 60 && toMin(f.end) > toMin(f.start)).map((f) => toMin(f.end)));
  const focusFrom = Math.max(earliest, dayFixedEnd || wake);
  for (const f of focus) {
    const len = Math.max(15, Math.min(120, f.minutes));
    const slot = place(busy, len, focusFrom, bed - 30) ?? place(busy, len, earliest, bed - 30);
    if (slot) add(slot[0], slot[1], { title: f.title, kind: "focus", area: f.area, ref: { type: f.type as "todo" | "task", id: f.id }, done: doneTodos.has(f.id) });
    else unscheduled.push(f.title);
  }

  // Order from wake-up; anything before wake time (after midnight) goes last.
  const key = (b: Block) => toMin(b.start) + (toMin(b.start) < wake ? 1440 : 0);
  blocks.sort((a, b) => key(a) - key(b));
  return {
    date: format(day, "yyyy-MM-dd"),
    allDay: events.filter((e) => e.allDay).map((e) => ({ id: e.id, title: e.title, source: e.source })),
    wake: toHHMM(wake),
    bed: toHHMM(bed),
    blocks,
    unscheduled,
  };
}

/** Plain-text timeline for Telegram / chat. */
export function describeSchedule(s: DaySchedule, fromNow?: Date) {
  const nowMin = fromNow ? fromNow.getHours() * 60 + fromNow.getMinutes() : -1;
  const lines = [...s.allDay.map((e) => `All day: ${e.title}`), ...s.blocks
    .filter((b) => nowMin < 0 || toMin(b.end) > nowMin || toMin(b.end) < toMin(s.wake))
    .map((b) => `${fmt12(b.start)}–${fmt12(b.end)} ${b.done ? "✓ " : ""}${b.title}`)];
  if (s.unscheduled.length) lines.push(`Didn't fit: ${s.unscheduled.join(", ")}`);
  return lines;
}

// ---- reading schedule blocks from chat ---------------------------------------------------------

const DAY_WORDS: Record<string, string> = { mon: "mon", monday: "mon", mondays: "mon", tue: "tue", tues: "tue", tuesday: "tue", tuesdays: "tue", wed: "wed", wednesday: "wed", wednesdays: "wed", thu: "thu", thur: "thu", thurs: "thu", thursday: "thu", thursdays: "thu", fri: "fri", friday: "fri", fridays: "fri", sat: "sat", saturday: "sat", saturdays: "sat", sun: "sun", sunday: "sun", sundays: "sun" };

/** "7:40", "2:20pm", "5" → minutes; `pmHint` for bare hours. */
function clock(h: string, m: string | undefined, ap: string | undefined, pmHint: boolean) {
  let hh = Number(h) % 12;
  const pm = ap ? /p/i.test(ap) : pmHint;
  if (pm) hh += 12;
  if (ap && /a/i.test(ap) && Number(h) === 12) hh = 0;
  return hh * 60 + Number(m ?? 0);
}

export interface ParsedBlock {
  title: string;
  days: string[];
  start: string;
  end: string;
}

/**
 * "i have school 7:40 to 2:20 on weekdays", "practice tuesdays and thursdays 5-7pm",
 * "gym every day 6-7am". Recurring only (needs a day pattern); one-off plans go through reminders.
 */
export function parseScheduleBlock(text: string): ParsedBlock | null {
  const t = text.toLowerCase().replace(/[–—]/g, "-").trim();
  if (t.length > 160 || /\?$/.test(t) || /\bremind\b/.test(t)) return null;
  const range = t.match(/(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?\s*(?:-|to|until|till)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?\b/);
  if (!range) return null;
  let days: string[] = [];
  if (/\bweekdays?\b|\bmon(day)?\s*(-|to|through|thru)\s*fri(day)?\b|\bschool days\b/.test(t)) days = ["mon", "tue", "wed", "thu", "fri"];
  else if (/\bweekends?\b/.test(t)) days = ["sat", "sun"];
  else if (/\b(every ?day|daily|each day)\b/.test(t)) days = [...DAYS];
  else {
    const named = [...t.matchAll(/\b(mon|tues?|wed|thu(?:rs?)?|fri|sat|sun)[a-z]*\b/g)].map((m) => DAY_WORDS[m[0]] ?? DAY_WORDS[m[1]]).filter(Boolean);
    // Plural day names ("tuesdays") or "every tuesday" mean recurring.
    if (named.length && (/\b(mon|tues|wednes|thurs|fri|satur|sun)days\b/.test(t) || /\bevery\b/.test(t))) days = [...new Set(named)];
  }
  if (!days.length) return null;

  const endAp = range[6];
  const startAp = range[3];
  const endH = Number(range[4]);
  const startH = Number(range[1]);
  // Bare hours: 1–6 are afternoon; an end earlier than the start is afternoon ("7:40 to 2:20").
  let end = clock(range[4], range[5], endAp, endH >= 1 && endH <= 6);
  let start = clock(range[1], range[2], startAp ?? (endAp && startH <= endH && /p/.test(endAp) ? "pm" : undefined), !startAp && startH >= 1 && startH <= 6);
  if (end <= start && !endAp) end += 12 * 60;
  if (end <= start) return null;
  if (end - start > 16 * 60) return null;
  start %= 1440;
  end = end > 1440 ? end - 1440 : end;

  const title =
    t
      .replace(range[0], " ")
      .replace(/\b(i have|i've got|ive got|i got|i go to|i'm at|im at|there's|there is|my|on|at|from|every|each|and|the|in the)\b/g, " ")
      .replace(/\b(weekdays?|weekends?|every ?day|daily|school days|(mon|tues?|wed(nes)?|thu(rs?)?|fri|sat(ur)?|sun)(day)?s?)\b/g, " ")
      .replace(/[^a-z0-9 &'/-]/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Busy";
  return { title: title.charAt(0).toUpperCase() + title.slice(1), days, start: toHHMM(start), end: toHHMM(end) };
}

/** "i wake up at 6:30", "bedtime 10:30", "i go to bed at 11 on weekends". */
export function parseSleepTimes(text: string): Partial<SchedulePrefs> | null {
  const t = text.toLowerCase().trim();
  if (/\?$/.test(t)) return null;
  const time = (s: string) => {
    const m = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    return m ? { h: Number(m[1]), m: Number(m[2] ?? 0), ap: m[3] } : null;
  };
  const wakeM = t.match(/\b(?:wake(?: up)?|get up|alarm)\b[^0-9]{0,12}(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/);
  const bedM = t.match(/\b(?:bed(?:time)?|go to (?:bed|sleep)|sleep at|asleep)\b[^0-9]{0,12}(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/);
  const out: Partial<SchedulePrefs> = {};
  if (wakeM) {
    const x = time(wakeM[1])!;
    out.wake = toHHMM(((x.ap === "pm" ? (x.h % 12) + 12 : x.h % 12) * 60) + x.m);
  }
  if (bedM) {
    const x = time(bedM[1])!;
    const h = x.ap === "am" ? x.h % 12 : x.ap === "pm" ? (x.h % 12) + 12 : x.h <= 4 ? x.h : (x.h % 12) + 12;
    const hhmm = toHHMM(h * 60 + x.m);
    if (/\bweekends?\b/.test(t)) out.weekendBedtime = hhmm;
    else out.bedtime = hhmm;
  }
  return Object.keys(out).length ? out : null;
}
