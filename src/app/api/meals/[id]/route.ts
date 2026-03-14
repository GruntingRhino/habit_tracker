import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

interface RouteParams { params: Promise<{ id: string }> }

async function ownsMeal(id: string, userId: string) {
  const m = await prisma.meal.findUnique({ where: { id } });
  return m && m.userId === userId ? m : null;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const meal = await ownsMeal(id, session.user.id);
  if (!meal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const updated = await prisma.meal.update({
    where: { id },
    data: {
      name:     body.name?.trim()    ?? meal.name,
      category: body.category        ?? meal.category,
      recipe:   body.recipe          !== undefined ? body.recipe   : meal.recipe,
      calories: body.calories        !== undefined ? body.calories : meal.calories,
      servings: body.servings        !== undefined ? body.servings : meal.servings,
      notes:    body.notes           !== undefined ? body.notes    : meal.notes,
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const meal = await ownsMeal(id, session.user.id);
  if (!meal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.meal.delete({ where: { id } });
  return NextResponse.json({ message: "deleted" });
}
