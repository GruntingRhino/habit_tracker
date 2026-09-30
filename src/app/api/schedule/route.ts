import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseISO } from "date-fns";
import { getOwnerSession } from "@/lib/owner";
import prisma from "@/lib/prisma";
import { buildSchedule, DAYS, readPrefs, writePrefs } from "@/lib/schedule";

/** A day's timeline (default today) + his fixed week + sleep times. */
export async function GET(req: NextRequest) {
  const { user } = await getOwnerSession();
  const d = req.nextUrl.searchParams.get("date");
  const date = d ? parseISO(d) : new Date();
  const [schedule, week, prefs] = await Promise.all([
    buildSchedule(user.id, date),
    prisma.scheduleBlock.findMany({ where: { userId: user.id, date: null }, orderBy: { start: "asc" } }),
    readPrefs(),
  ]);
  return NextResponse.json({ schedule, week, prefs });
}

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const blockSchema = z.object({ title: z.string().trim().min(1).max(80), days: z.array(z.enum(DAYS)).min(1).max(7), start: hhmm, end: hhmm, area: z.string().max(20).optional() });

export async function POST(req: NextRequest) {
  const { user } = await getOwnerSession();
  const parsed = blockSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  const block = await prisma.scheduleBlock.create({ data: { userId: user.id, ...parsed.data } });
  return NextResponse.json(block, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { user } = await getOwnerSession();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const r = await prisma.scheduleBlock.deleteMany({ where: { id, userId: user.id } });
  return r.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

const prefsSchema = z.object({ bedtime: hhmm.optional(), wake: hhmm.nullable().optional(), weekendBedtime: hhmm.nullable().optional() });

/** Sleep times the schedule is built around. */
export async function PATCH(req: NextRequest) {
  await getOwnerSession();
  const parsed = prefsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const next = { ...(await readPrefs()), ...parsed.data };
  await writePrefs(next);
  return NextResponse.json(next);
}
