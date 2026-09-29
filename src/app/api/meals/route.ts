import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/owner";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { strictObject } from "@/lib/validation";
import { microsSchema, nutritionItemSchema } from "@/lib/nutrition-schema";

const VALID_MEAL_CATEGORIES = ["breakfast", "lunch", "dinner", "snack"] as const;

const mealPostSchema = strictObject({
  name: z.string().trim().min(1, "name is required").max(120),
  category: z.enum(VALID_MEAL_CATEGORIES),
  recipe: z.string().trim().max(5000).optional(),
  calories: z.number().int().min(0).max(10000).optional(),
  protein: z.number().min(0).max(1000).optional(),
  carbs: z.number().min(0).max(2000).optional(),
  fat: z.number().min(0).max(1000).optional(),
  items: z.array(nutritionItemSchema).max(30).optional(),
  nutritionSource: z.enum(["ai", "manual"]).optional(),
  micros: microsSchema.optional(),
  sourceText: z.string().trim().max(600).optional(),
  servings: z.number().min(0.25).max(100).default(1),
  notes: z.string().trim().max(1000).optional(),
  status: z.enum(["saved", "planned", "eaten"]).optional(),
  plannedFor: z.string().datetime({ offset: true }).optional(),
});

export async function GET() {
  const session = await getOwnerSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const meals = await prisma.meal.findMany({
      where: { userId: session.user.id },
      orderBy: [{ category: "asc" }, { order: "asc" }],
    });
    return NextResponse.json(meals);
  } catch (error) {
    reportError({ context: "meals GET", error, userId: session.user.id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getOwnerSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rawBody = await req.json();
    const parsed = mealPostSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const last = await prisma.meal.findFirst({
      where: { userId: session.user.id, category: parsed.data.category },
      orderBy: { order: "desc" },
    });

    const meal = await prisma.meal.create({
      data: {
        userId: session.user.id,
        name: parsed.data.name,
        category: parsed.data.category,
        recipe: parsed.data.recipe,
        calories: parsed.data.calories,
        protein: parsed.data.protein,
        carbs: parsed.data.carbs,
        fat: parsed.data.fat,
        items: parsed.data.items,
        nutritionSource: parsed.data.nutritionSource,
        micros: parsed.data.micros,
        sourceText: parsed.data.sourceText,
        servings: parsed.data.servings,
        notes: parsed.data.notes,
        status: parsed.data.status,
        plannedFor: parsed.data.plannedFor ? new Date(parsed.data.plannedFor) : parsed.data.status === "eaten" ? new Date() : undefined,
        order: (last?.order ?? -1) + 1,
      },
    });

    return NextResponse.json(meal, { status: 201 });
  } catch (error) {
    reportError({ context: "meals POST", error, userId: session.user.id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}