import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { subDays } from "date-fns";
import { getOwnerSession } from "@/lib/owner";
import prisma from "@/lib/prisma";
import { recomputeCategoryScoreForDate } from "@/lib/category-score";
import { updateBody } from "@/lib/body";
import { getStartOfDay } from "@/lib/utils";

const num = (max: number) => z.number().min(0).max(max).nullable().optional();

// Partial update: only the fields sent are written, so chat-logged data (e.g. workouts) is never reset.
const patchSchema = z.object({
  notes: z.string().max(5000).nullable().optional(),
  sleepHours: num(16),
  weightLb: z.number().min(60).max(450).nullable().optional(),
  screenTimeHours: num(24),
  moneySpent: num(100000),
  moneySaved: num(100000),
  rightWithGod: z.boolean().optional(),
});

export async function GET() {
  const { user } = await getOwnerSession();
  const since = subDays(getStartOfDay(new Date()), 60);
  const [entries, scores] = await Promise.all([
    prisma.dailyEntry.findMany({
      where: { userId: user.id, date: { gte: since } },
      orderBy: { date: "desc" },
      select: { date: true, notes: true, sleepHours: true, weightLb: true, screenTimeHours: true, moneySpent: true, moneySaved: true, rightWithGod: true },
    }),
    prisma.categoryScore.findMany({
      where: { userId: user.id, date: { gte: since } },
      select: { date: true, journalScore: true, journalFeedback: true },
    }),
  ]);
  const byDay = new Map(scores.map((s) => [s.date.toISOString(), s]));
  return NextResponse.json(
    entries.map((e) => ({ ...e, journalScore: byDay.get(e.date.toISOString())?.journalScore ?? null, journalFeedback: byDay.get(e.date.toISOString())?.journalFeedback ?? null }))
  );
}

export async function PATCH(req: NextRequest) {
  const { user } = await getOwnerSession();
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });

  const date = getStartOfDay(new Date());
  const data = parsed.data;
  const entry = await prisma.dailyEntry.upsert({
    where: { userId_date: { userId: user.id, date } },
    update: data,
    create: { userId: user.id, date, ...data },
  });
  await recomputeCategoryScoreForDate(user.id, date);
  // A morning weigh-in updates protein etc. from the 7-day average (calories move only at check-ins).
  if (data.weightLb != null) await updateBody(user.id, {});
  return NextResponse.json(entry);
}
