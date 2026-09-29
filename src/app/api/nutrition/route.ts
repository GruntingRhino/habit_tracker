import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/owner";
import prisma from "@/lib/prisma";
import { totalsOf } from "@/lib/ai/nutrition";
import { sumMicros, type Micros } from "@/lib/nutrition-micros";
import type { NutritionTargets } from "@/lib/nutrition-schema";

/** A day's eaten meals with totals and targets. ?date=YYYY-MM-DD (server time zone), default today. */
export async function GET(req: NextRequest) {
  const { user } = await getOwnerSession();
  const param = req.nextUrl.searchParams.get("date");
  const day = param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? new Date(`${param}T00:00:00`) : new Date();
  if (Number.isNaN(day.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  day.setHours(0, 0, 0, 0);
  const next = new Date(day);
  next.setDate(next.getDate() + 1);

  const [meals, owner] = await Promise.all([
    prisma.meal.findMany({ where: { userId: user.id, status: "eaten", plannedFor: { gte: day, lt: next } }, orderBy: { plannedFor: "asc" } }),
    prisma.user.findUnique({ where: { id: user.id }, select: { nutritionTargets: true } }),
  ]);
  const counted = meals.map((m) => ({ calories: m.calories ?? 0, protein: m.protein ?? 0, carbs: m.carbs ?? 0, fat: m.fat ?? 0 }));
  return NextResponse.json({
    date: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`,
    meals,
    totals: totalsOf(counted),
    micros: sumMicros(meals.map((m) => m.micros as Micros | null)),
    missing: meals.filter((m) => m.calories === null).length,
    targets: (owner?.nutritionTargets as NutritionTargets | null) ?? null,
  });
}
