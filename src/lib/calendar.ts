/**
 * His calendar: events made in the app (pushed to Google, with invites) and events pulled from
 * Google. "I have a dentist appointment Friday at 3" → an event + a prep to-do, then the chat asks
 * for what's missing (the time; who to share it with).
 */
import { addDays, addHours } from "date-fns";
import * as chrono from "chrono-node";
import prisma from "@/lib/prisma";
import { deleteGoogleEvent, pushEvent } from "@/lib/google";
import { getStartOfDay } from "@/lib/utils";
import { reportError } from "@/lib/monitoring";

const EVENT_NOUN =
  /\b(appointment|appt|meeting|game|match|practice|tournament|party|interview|test|exam|quiz|midterm|final|finals|recital|concert|show|trip|flight|dinner|lunch|brunch|call|class|event|competition|fight|sparring|session|conference|wedding|birthday|ceremony|tryouts?|scrimmage|meet|presentation|checkup|check-up|visit|orientation|service|mass|retreat|camp|lesson|shift|hangout|date|movies?|meetup|volunteering|fair|workshop|seminar|club)\b/i;
const CALENDAR_ASK = /\b(add|put|make|create|schedule|set up|book)\b.*\b(calendar|event|schedule)\b|\bcalendar event\b|\bon my calendar\b/i;
const NOT_EVENT = /\b(remind me|have to|need to|got to|gotta|should|must|want to|finish|submit|turn in|due)\b/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export interface ParsedEvent {
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  hasTime: boolean;
  attendees: string[];
}

export function emailsIn(text: string) {
  return [...new Set((text.match(EMAIL) ?? []).map((e) => e.toLowerCase()))];
}

/** "i have a dentist appointment friday at 3pm", "add soccer game to my calendar saturday 10-12 and share it with a@b.com". */
export function parseEventStatement(text: string, now = new Date()): ParsedEvent | null {
  const t = text.trim();
  if (t.length > 300 || /\?\s*$/.test(t)) return null;
  const explicit = CALENDAR_ASK.test(t);
  if (!explicit) {
    if (NOT_EVENT.test(t)) return null;
    if (!EVENT_NOUN.test(t)) return null;
    if (!/^(so |also |oh |and |yo |btw |fyi )*(i have|i've got|ive got|i got|there'?s|got|my .{2,40}\b(is|are)\b|we have|i'?m going to|going to)\b/i.test(t)) return null;
  }
  const withoutEmails = t.replace(EMAIL, " ");
  const found = chrono.parse(withoutEmails, now, { forwardDate: true })[0];
  if (!found) return null;
  let hasTime = found.start.isCertain("hour");
  const start = found.start.date();
  let end = found.end?.date() ?? null;
  let rangeText = "";
  // A bare hour with no am/pm is an afternoon/evening event when it's 1–6 ("game at 6").
  if (hasTime && !found.start.isCertain("meridiem") && start.getHours() >= 1 && start.getHours() <= 6) {
    start.setHours(start.getHours() + 12);
    if (end && !found.end?.isCertain("meridiem") && end.getHours() <= 12) end.setHours(end.getHours() + 12);
  }
  // "saturday 10-12": chrono takes the day; read the bare time range ourselves.
  if (!hasTime) {
    const r = withoutEmails.replace(found.text, " ").match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
    if (r) {
      // Start: its own am/pm, else "pm" if the end says pm, else 1–6 means afternoon.
      const sH = Number(r[1]);
      const eH = Number(r[4]);
      const startPm = r[3] ? /p/i.test(r[3]) : r[6] && /p/i.test(r[6]) && sH <= eH && sH !== 12 ? true : sH >= 1 && sH <= 6;
      const s24 = (sH % 12) + (startPm ? 12 : 0);
      // End: its own am/pm, else the first time after the start ("10-12" → noon, "7:40-2:20" → 2:20pm).
      let e24 = r[6] ? (eH % 12) + (/p/i.test(r[6]) ? 12 : 0) : (eH % 12) + (startPm ? 12 : 0);
      if (!r[6] && e24 * 60 + Number(r[5] ?? 0) <= s24 * 60 + Number(r[2] ?? 0)) e24 += 12;
      start.setHours(s24, Number(r[2] ?? 0), 0, 0);
      end = new Date(start);
      end.setHours(e24 % 24, Number(r[5] ?? 0), 0, 0);
      if (end <= start) end = addHours(start, 1);
      hasTime = true;
      rangeText = r[0];
    }
  }
  if (!hasTime) start.setHours(0, 0, 0, 0);
  if (!end || end <= start) end = hasTime ? addHours(start, 1) : addDays(start, 1);

  const title =
    withoutEmails
      .replace(found.text, " ")
      .replace(rangeText || "\u0000", " ")
      .replace(/^(so |also |oh |and |yo |btw |fyi )*/i, "")
      .replace(/\b(i have|i've got|ive got|i got|there'?s|got|we have|i'?m going to|going to)\b/i, " ")
      .replace(/\b(add|put|make|create|schedule|set up|book)\b(\s+(an?|the|my))?/i, " ")
      .replace(/\b(to|on|in|into|onto)\s+(my|the)\s+calendar\b|\bcalendar event( for)?\b|\ban event( for)?\b/gi, " ")
      .replace(/\b(and\s+)?(share|invite|send)\b.*$/i, " ")
      .replace(/\b(on|at|this|next|from|for|by)\s*$/i, " ")
      .replace(/^\s*(an?|the|my)\s+/i, "")
      .replace(/\s+(on|at|this|next|from|for|by)(\s+|$)/gi, " ")
      .replace(/[.,!]+/g, " ")
      .replace(/\s+(is|are|was)\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\s+(is|are|was)$/i, "") || "Event";
  return { title: title.charAt(0).toUpperCase() + title.slice(1), start, end, allDay: !hasTime, hasTime, attendees: emailsIn(t) };
}

/** When the prep to-do is due: the evening before at 7pm, or an hour before if that's already past. */
export function prepDue(start: Date, now = new Date()) {
  const eve = addDays(getStartOfDay(start), -1);
  eve.setHours(19, 0, 0, 0);
  if (eve > now) return eve;
  const hourBefore = addHours(start, -1);
  return hourBefore > now ? hourBefore : start;
}

async function tryPush(userId: string, id: string) {
  try {
    return await pushEvent(userId, id);
  } catch (error) {
    reportError({ context: "calendar push", error, userId });
    return null;
  }
}

export async function createEvent(userId: string, e: { title: string; start: Date; end: Date; allDay: boolean; attendees?: string[]; description?: string | null; location?: string | null; todoId?: string | null }) {
  const event = await prisma.calendarEvent.create({
    data: { userId, title: e.title.slice(0, 300), start: e.start, end: e.end, allDay: e.allDay, attendees: e.attendees ?? [], description: e.description ?? null, location: e.location ?? null, todoId: e.todoId ?? null },
  });
  const googleId = await tryPush(userId, event.id);
  return { event, onGoogle: !!googleId };
}

export async function updateEvent(userId: string, id: string, data: Partial<{ title: string; start: Date; end: Date; allDay: boolean; attendees: string[]; description: string | null; location: string | null }>) {
  const r = await prisma.calendarEvent.updateMany({ where: { id, userId }, data });
  if (!r.count) return null;
  const googleId = await tryPush(userId, id);
  return { event: await prisma.calendarEvent.findUniqueOrThrow({ where: { id } }), onGoogle: !!googleId };
}

export async function addAttendees(userId: string, id: string, emails: string[]) {
  const e = await prisma.calendarEvent.findFirst({ where: { id, userId } });
  if (!e) return null;
  return updateEvent(userId, id, { attendees: [...new Set([...e.attendees, ...emails.map((x) => x.toLowerCase())])] });
}

export async function deleteEvent(userId: string, id: string) {
  const e = await prisma.calendarEvent.findFirst({ where: { id, userId } });
  if (!e) return false;
  if (e.googleId) await deleteGoogleEvent(userId, e.googleId).catch((error) => reportError({ context: "calendar delete", error, userId }));
  await prisma.calendarEvent.delete({ where: { id } });
  return true;
}

export async function eventsBetween(userId: string, from: Date, to: Date) {
  return prisma.calendarEvent.findMany({ where: { userId, status: "confirmed", start: { lt: to }, end: { gt: from } }, orderBy: { start: "asc" } });
}

export function describeEventTime(e: { start: Date; end: Date; allDay: boolean }) {
  const day = e.start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  if (e.allDay) return `${day} (all day)`;
  const t = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "").replace(" ", "").toLowerCase();
  return `${day} ${t(e.start)}–${t(e.end)}`;
}
