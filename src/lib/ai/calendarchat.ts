/**
 * The calendar by chat, all in code: "what's on my calendar this week?", "what do i have friday?",
 * "when is my dentist appointment?", "move the doctor appointment to 11", "after practice" as a time.
 */
import * as chrono from "chrono-node";
import prisma from "@/lib/prisma";
import { getStartOfDay } from "@/lib/utils";
import { updateEvent } from "@/lib/calendar";

const DAY = 86_400_000;
const fmtDay = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const fmtTime = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "").replace(" ", "").toLowerCase();

const STOP = new Set(["the", "my", "a", "an", "appointment", "appt", "event", "meeting", "reminder", "one", "thing", "to-do", "todo", "meal", "with"]);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w)).map((w) => w.replace(/s$/, ""));
/** "the doctor appointment" ↔ "Doctor appointment", "dentist" ↔ "Dentist", "mr lee" ↔ "Meeting with mr lee". */
export function nameMatches(query: string, title: string) {
  const q = words(query);
  const t = new Set(words(title));
  return q.length > 0 && q.every((w) => t.has(w) || [...t].some((x) => x.startsWith(w) || w.startsWith(x)));
}

/** The range a question is about. */
export function rangeOf(text: string, now = new Date()): { from: Date; to: Date; label: string } | null {
  const today = getStartOfDay(now);
  const lc = text.toLowerCase();
  if (/\bnext week\b/.test(lc)) {
    const toMon = (8 - today.getDay()) % 7 || 7;
    const from = new Date(today.getTime() + toMon * DAY);
    return { from, to: new Date(from.getTime() + 7 * DAY), label: "next week" };
  }
  if (/\b(this week|the week|this weekend|coming up|upcoming)\b/.test(lc)) {
    if (/weekend/.test(lc)) {
      const sat = new Date(today.getTime() + ((6 - today.getDay() + 7) % 7) * DAY);
      return { from: sat, to: new Date(sat.getTime() + 2 * DAY), label: "this weekend" };
    }
    return { from: today, to: new Date(today.getTime() + 7 * DAY), label: "the next 7 days" };
  }
  if (/\btoday|tonight\b/.test(lc)) return { from: today, to: new Date(today.getTime() + DAY), label: "today" };
  const c = chrono.parse(text, now, { forwardDate: true })[0];
  if (c) {
    const d = getStartOfDay(c.start.date());
    return { from: d, to: new Date(d.getTime() + DAY), label: d.getTime() === today.getTime() + DAY ? "tomorrow" : fmtDay(d) };
  }
  return null;
}

export const CALENDAR_Q =
  /\b(what'?s|what is|whats|anything|what do i have|what have i got|do i have anything|show me)\b.{0,25}\b(on my calendar|on the calendar|my calendar|my schedule for|planned|going on|happening|coming up)\b|^\s*(what|anything)\s+(do i have|have i got|is there|'?s on)\s+(on\s+)?(today|tonight|tomorrow|this week|next week|this weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|the \d+)|\bwhat'?s on my (plate|list) (tomorrow|this week|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

/** A day named in a question ("tomorrow", "saturday", "on the 14th", "next week"), not today. */
export const DAY_WORD = /\b(tomorrow|tmrw|tmr|this week|next week|this weekend|the weekend|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|on the \d{1,2}(?:st|nd|rd|th)?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2})\b/i;
/** "what event do i have tomorrow?", "what is on the schedule tomorrow", "any plans saturday", "am i free friday?" */
export const DAY_Q = (t: string) => DAY_WORD.test(t) && /\b(events?|plans|appointments?|meetings?|schedule|calendar|going on|happening|anything|busy|free|what do i have|what have i got)\b/i.test(t);
/** Asked about the schedule (not just the calendar): his weekly blocks for that day count too. */
const WANTS_BLOCKS = /\b(schedule|busy|free|my day)\b/i;
const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const hhmm = (day: Date, t: string) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(t.slice(0, 2)), Number(t.slice(3, 5)));

export async function calendarAnswer(userId: string, text: string, now = new Date()) {
  const range = rangeOf(text, now) ?? rangeOf("this week", now)!;
  const multi = range.to.getTime() - range.from.getTime() > DAY;
  const [events, todos, blocks] = await Promise.all([
    prisma.calendarEvent.findMany({ where: { userId, status: "confirmed", start: { lt: range.to }, end: { gt: range.from } }, orderBy: { start: "asc" } }),
    prisma.todo.findMany({ where: { userId, status: "open", dueAt: { gte: range.from, lt: range.to } }, orderBy: { dueAt: "asc" } }),
    !multi && WANTS_BLOCKS.test(text) ? prisma.scheduleBlock.findMany({ where: { userId, days: { has: DOW[range.from.getDay()] } } }) : Promise.resolve([]),
  ]);
  const rows: { at: number; line: string }[] = [];
  for (const e of events) rows.push({ at: e.allDay ? 0 : e.start.getTime(), line: `📅 ${e.title} — ${multi ? `${fmtDay(e.start)} ` : ""}${e.allDay ? "all day" : `${fmtTime(e.start)}–${fmtTime(e.end)}`}` });
  for (const b of blocks) rows.push({ at: hhmm(range.from, b.start).getTime(), line: `🕒 ${b.title} — ${fmtTime(hhmm(range.from, b.start))}–${fmtTime(hhmm(range.from, b.end))}` });
  for (const t of todos) rows.push({ at: t.dueAt!.getTime(), line: `💼 ${t.title} — due ${multi ? `${fmtDay(t.dueAt!)} ` : ""}${fmtTime(t.dueAt!)}` });
  // Events and blocks by time; on a multi-day range events keep their own order and to-dos come after.
  const lines = (multi ? rows : [...rows].sort((a, b) => a.at - b.at)).map((r) => r.line);
  const when = range.label === "today" || range.label === "tomorrow" ? range.label : `for ${range.label}`;
  if (!lines.length) return `Nothing on your calendar ${when}${blocks.length === 0 && WANTS_BLOCKS.test(text) && !multi ? " (and nothing on your weekly schedule)" : ""}.`;
  const head = multi ? range.label : `${range.label === "today" || range.label === "tomorrow" ? `${range.label} (${fmtDay(range.from)})` : range.label}`;
  return [`${head.charAt(0).toUpperCase() + head.slice(1)}:`, ...lines].join("\n");
}

export const WHEN_Q = /^\s*(?:so\s+|wait\s+|and\s+)?(?:when'?s|when is|when are|what time is|what day is)\s+(?:my|the|our)\s+(.+?)\s*\??\s*$/i;

export async function whenAnswer(userId: string, what: string, now = new Date()) {
  const events = await prisma.calendarEvent.findMany({ where: { userId, status: "confirmed", end: { gte: getStartOfDay(now) } }, orderBy: { start: "asc" } });
  const e = events.find((x) => nameMatches(what, x.title));
  if (e) return `${e.title}: ${fmtDay(e.start)}${e.allDay ? " (all day)" : `, ${fmtTime(e.start)}–${fmtTime(e.end)}`}.`;
  const todos = await prisma.todo.findMany({ where: { userId, status: "open", dueAt: { not: null } } });
  const t = todos.find((x) => nameMatches(what, x.title));
  if (t) return `${t.title} is due ${fmtDay(t.dueAt!)}, ${fmtTime(t.dueAt!)}.`;
  return null;
}

/** "after practice" / "after school" → the end of that block in his week (+15 min), on that day. */
export async function afterBlock(userId: string, text: string, day: Date): Promise<Date | null> {
  const m = text.match(/\bafter\s+(?:my\s+|the\s+)?([a-z]+)/i);
  if (!m) return null;
  const name = m[1].toLowerCase();
  const block = await prisma.scheduleBlock.findFirst({ where: { userId, title: { contains: name, mode: "insensitive" } } });
  const fixed: Record<string, number> = { school: 15 * 60, practice: 17 * 60 + 30, dinner: 19 * 60, work: 17 * 60 + 30, lunch: 13 * 60, class: 15 * 60 };
  const mins = block ? Number(block.end.slice(0, 2)) * 60 + Number(block.end.slice(3, 5)) + 15 : fixed[name];
  if (mins == null) return null;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(mins / 60), mins % 60);
}

export const MOVE_EVENT = /^\s*(?:can you\s+|please\s+)?(?:move|push|reschedule|change|switch|bump)\s+(?:the\s+|my\s+)?(.+?)\s+(?:to|til|till|until|back to)\s+(.+?)[.!]*\s*$/i;

/** Move an upcoming event. Returns null when nothing on the calendar matches (so other handlers can try). */
export async function moveEvent(userId: string, what: string, to: string, now = new Date()) {
  const events = await prisma.calendarEvent.findMany({ where: { userId, status: "confirmed", end: { gte: getStartOfDay(now) } }, orderBy: { start: "asc" } });
  const e = events.find((x) => nameMatches(what, x.title));
  if (!e) return null;
  const before = { start: e.start, end: e.end, allDay: e.allDay };
  const target = await newTime(userId, to, e.start, now);
  if (!target) return { event: e, reply: `When should ${e.title} be? Say a time like "4pm" or a day like "friday at 3".`, before: null };
  const dur = e.allDay ? 3_600_000 : e.end.getTime() - e.start.getTime();
  const r = await updateEvent(userId, e.id, target.allDay ? { start: target.start, end: new Date(target.start.getTime() + DAY), allDay: true } : { start: target.start, end: new Date(target.start.getTime() + dur), allDay: false });
  if (!r) return null;
  // Its reminders follow it.
  const hourBefore = new Date(target.start.getTime() - 3_600_000);
  await prisma.reminder.updateMany({ where: { userId, status: "pending", text: { startsWith: `📅 ${e.title}` } }, data: { fireAt: target.allDay ? new Date(target.start.getFullYear(), target.start.getMonth(), target.start.getDate(), 8) : hourBefore, text: `📅 ${e.title}${target.allDay ? " today" : " in 1 hour"}` } });
  const t = r.event;
  return { event: t, before, reply: `📅 Moved ${t.title} to ${fmtDay(t.start)}${t.allDay ? " (all day)" : ` ${fmtTime(t.start)}–${fmtTime(t.end)}`}${r.onGoogle ? " (updated on Google Calendar)" : ""}.` };
}

/** "11", "4pm", "friday", "friday at 3", "after practice", "2pm not 1" → a start time. */
export async function newTime(userId: string, phrase: string, current: Date, now = new Date()): Promise<{ start: Date; allDay: boolean } | null> {
  const clean = phrase.replace(/\s+(?:not|instead of)\s+.*$/i, "").trim();
  const after = await afterBlock(userId, clean, current);
  if (after) return { start: after, allDay: false };
  if (/^\s*all ?day\s*$/i.test(clean)) return { start: getStartOfDay(current), allDay: true };
  // A bare hour: "11", "4", "4:30"
  const bare = clean.match(/^(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/i);
  const c = bare ? null : chrono.parse(clean, current, { forwardDate: true })[0];
  let day = current;
  let h: number | null = null;
  let m = 0;
  if (bare) {
    h = Number(bare[1]) % 12;
    m = Number(bare[2] ?? 0);
    const ap = bare[3]?.toLowerCase();
    if (ap ? ap.startsWith("p") : Number(bare[1]) >= 1 && Number(bare[1]) <= 6) h += 12;
    if (Number(bare[1]) === 12 && !ap) h = 12;
  } else if (c) {
    if (c.start.isCertain("day") || c.start.isCertain("weekday")) day = c.start.date();
    if (c.start.isCertain("hour")) {
      const d = c.start.date();
      h = d.getHours();
      m = d.getMinutes();
      if (!c.start.isCertain("meridiem") && h >= 1 && h <= 6) h += 12;
    } else if (!c.start.isCertain("day") && !c.start.isCertain("weekday")) return null;
  } else return null;
  if (h == null) {
    // New day, same time of day.
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), current.getHours(), current.getMinutes());
    return { start, allDay: current.getHours() === 0 && current.getMinutes() === 0 };
  }
  return { start: new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m), allDay: false };
  void now;
}
