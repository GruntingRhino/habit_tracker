import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/owner";
import prisma from "@/lib/prisma";
import { MEASURE_KEYS, measurementTrend } from "@/lib/body";

export async function GET() {
  const { user } = await getOwnerSession();
  const [trend, history] = await Promise.all([
    measurementTrend(user.id),
    prisma.bodyMeasurement.findMany({ where: { userId: user.id }, orderBy: { date: "desc" }, take: 24 }),
  ]);
  return NextResponse.json({ ...trend, history });
}

const inches = z.number().min(5).max(70).nullable().optional();
const schema = z.object(Object.fromEntries(MEASURE_KEYS.map((k) => [k, inches])) as Record<(typeof MEASURE_KEYS)[number], typeof inches>);

export async function POST(req: NextRequest) {
  const { user } = await getOwnerSession();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const data = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v != null));
  if (!Object.keys(data).length) return NextResponse.json({ error: "Nothing to log" }, { status: 400 });
  const row = await prisma.bodyMeasurement.create({ data: { userId: user.id, ...data } });
  return NextResponse.json(row, { status: 201 });
}
