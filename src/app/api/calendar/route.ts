import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addDays } from "date-fns";
import { getOwnerSession } from "@/lib/owner";
import prisma from "@/lib/prisma";
import { createEvent, eventsBetween, prepDue } from "@/lib/calendar";
import { getStartOfDay } from "@/lib/utils";

/** Events overlapping [from, to) (default: this week). */
export async function GET(req: NextRequest) {
  const { user } = await getOwnerSession();
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const start = from ? new Date(from) : getStartOfDay(new Date());
  const end = to ? new Date(to) : addDays(start, 7);
  return NextResponse.json(await eventsBetween(user.id, start, end));
}

const schema = z.object({
  title: z.string().trim().min(1).max(300),
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  allDay: z.boolean().default(false),
  attendees: z.array(z.string().email()).max(50).default([]),
  description: z.string().max(5000).nullable().optional(),
  location: z.string().max(300).nullable().optional(),
  prep: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  const { user } = await getOwnerSession();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  const d = parsed.data;
  const start = new Date(d.start);
  let end = new Date(d.end);
  if (end <= start) end = new Date(start.getTime() + (d.allDay ? 86_400_000 : 3_600_000));
  let todoId: string | null = null;
  if (d.prep) {
    const due = prepDue(start);
    const todo = await prisma.todo.create({ data: { userId: user.id, title: `Prepare for ${d.title}`, area: "work", priority: "high", dueAt: due } });
    await prisma.reminder.create({ data: { userId: user.id, text: todo.title, fireAt: due, todoId: todo.id } });
    todoId = todo.id;
  }
  else {
    // No prep: just a reminder an hour before (8am for all-day).
    const fireAt = d.allDay ? new Date(start.getFullYear(), start.getMonth(), start.getDate(), 8) : new Date(start.getTime() - 3_600_000);
    if (fireAt > new Date()) await prisma.reminder.create({ data: { userId: user.id, text: `📅 ${d.title}${d.allDay ? " today" : " in 1 hour"}`, fireAt } });
  }
  const r = await createEvent(user.id, { title: d.title, start, end, allDay: d.allDay, attendees: d.attendees, description: d.description, location: d.location, todoId });
  return NextResponse.json({ ...r.event, onGoogle: r.onGoogle }, { status: 201 });
}
