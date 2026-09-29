import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/owner";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { strictObject } from "@/lib/validation";
import { microsSchema, nutritionItemSchema } from "@/lib/nutrition-schema";
import { Prisma } from "@/generated/prisma";

interface RouteParams { params: Promise<{ id: string }> }

const VALID_MEAL_CATEGORIES = ["breakfast", "lunch", "dinner", "snack"] as const;

const mealPatchSchema = strictObject({
  name: z.string().trim().min(1).max(120).optional(),
  category: z.enum(VALID_MEAL_CATEGORIES).optional(),
  recipe: z.string().trim().max(5000).optional(),
  calories: z.number().int().min(0).max(10000).nullable().optional(),
  protein: z.number().min(0).max(1000).nullable().optional(),
  carbs: z.number().min(0).max(2000).nullable().optional(),
  fat: z.number().min(0).max(1000).nullable().optional(),
  items: z.array(nutritionItemSchema).max(30).nullable().optional(),
  nutritionSource: z.enum(["ai", "manual"]).nullable().optional(),
  micros: microsSchema.nullable().optional(),
  sourceText: z.string().trim().max(600).nullable().optional(),
  servings: z.number().min(0.25).max(100).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  status: z.enum(["saved", "planned", "eaten"]).optional(),
  plannedFor: z.string().datetime({ offset: true }).nullable().optional(),
});

async function ownsMeal(id: string, userId: string) {
  const m = await prisma.meal.findUnique({ where: { id } });
  return m && m.userId === userId ? m : null;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getOwnerSession();
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
        protein: body.protein !== undefined ? body.protein : meal.protein,
        carbs: body.carbs !== undefined ? body.carbs : meal.carbs,
        fat: body.fat !== undefined ? body.fat : meal.fat,
        items: body.items !== undefined ? (body.items ?? Prisma.DbNull) : undefined,
        nutritionSource: body.nutritionSource !== undefined ? body.nutritionSource : meal.nutritionSource,
        micros: body.micros !== undefined ? (body.micros ?? Prisma.DbNull) : undefined,
        sourceText: body.sourceText !== undefined ? body.sourceText : meal.sourceText,
        servings: body.servings !== undefined ? body.servings : meal.servings,
        notes: body.notes !== undefined ? body.notes : meal.notes,
        status: body.status ?? meal.status,
        plannedFor:
          body.plannedFor !== undefined
            ? body.plannedFor && new Date(body.plannedFor)
            : body.status === "eaten" && !meal.plannedFor
              ? new Date()
              : meal.plannedFor,
      },
    });
    return NextResponse.json(updated);
  } catch (error) {
    reportError({ context: "meals PATCH", error, userId: session.user.id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await getOwnerSession();
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