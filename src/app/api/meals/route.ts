import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const meals = await prisma.meal.findMany({
    where: { userId: session.user.id },
    orderBy: [{ category: "asc" }, { order: "asc" }],
  });

  return NextResponse.json(meals);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const validCategories = ["breakfast", "lunch", "dinner", "snack"];
  if (!validCategories.includes(body.category))
    return NextResponse.json({ error: "category must be breakfast, lunch, dinner, or snack" }, { status: 400 });

  const last = await prisma.meal.findFirst({
    where: { userId: session.user.id, category: body.category },
    orderBy: { order: "desc" },
  });

  const meal = await prisma.meal.create({
    data: {
      userId: session.user.id,
      name: body.name.trim(),
      category: body.category,
      recipe: body.recipe ?? undefined,
      calories: body.calories ? parseInt(body.calories) : undefined,
      servings: body.servings ?? 1,
      notes: body.notes ?? undefined,
      order: (last?.order ?? -1) + 1,
    },
  });

  return NextResponse.json(meal, { status: 201 });
}
