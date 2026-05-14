import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";

interface RouteParams { params: Promise<{ id: string }> }

const VALID_MEAL_CATEGORIES = ["breakfast", "lunch", "dinner", "snack"] as const;

const mealPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  category: z.enum(VALID_MEAL_CATEGORIES).optional(),
  recipe: z.string().trim().max(5000).optional(),
  calories: z.number().int().min(1).max(10000).nullable().optional(),
  servings: z.number().min(0.25).max(100).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

async function ownsMeal(id: string, userId: string) {
  const m = await prisma.meal.findUnique({ where: { id } });
  return m && m.userId === userId ? m : null;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const meal = await ownsMeal(id, session.user.id);
    if (!meal) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const rawBody = await req.json();
    const parsed = mealPatchSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const body = parsed.data;
    const updated = await prisma.meal.update({
      where: { id },
      data: {
        name: body.name ?? meal.name,
        category: body.category ?? meal.category,
        recipe: body.recipe !== undefined ? body.recipe : meal.recipe,
        calories: body.calories !== undefined ? body.calories : meal.calories,
        servings: body.servings !== undefined ? body.servings : meal.servings,
        notes: body.notes !== undefined ? body.notes : meal.notes,
      },
    });
    return NextResponse.json(updated);
  } catch (error) {
    reportError({ context: "meals PATCH", error, userId: session.user.id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const meal = await ownsMeal(id, session.user.id);
    if (!meal) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.meal.delete({ where: { id } });
    return NextResponse.json({ message: "deleted" });
  } catch (error) {
    reportError({ context: "meals DELETE", error, userId: session.user.id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
