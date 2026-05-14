import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";

const VALID_MEAL_CATEGORIES = ["breakfast", "lunch", "dinner", "snack"] as const;

const mealPostSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(120),
  category: z.enum(VALID_MEAL_CATEGORIES),
  recipe: z.string().trim().max(5000).optional(),
  calories: z.number().int().min(1).max(10000).optional(),
  servings: z.number().min(0.25).max(100).default(1),
  notes: z.string().trim().max(1000).optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
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
  const session = await getServerSession(authOptions);
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
        servings: parsed.data.servings,
        notes: parsed.data.notes,
        order: (last?.order ?? -1) + 1,
      },
    });

    return NextResponse.json(meal, { status: 201 });
  } catch (error) {
    reportError({ context: "meals POST", error, userId: session.user.id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
