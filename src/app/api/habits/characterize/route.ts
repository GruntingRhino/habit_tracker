import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { characterizeHabitCategory, normalizeHabitCategory } from "@/lib/habit-category";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const habits = await prisma.habit.findMany({
      where: { userId: session.user.id, isActive: true },
      select: { id: true, name: true, description: true, category: true },
    });

    const updates = habits
      .map((habit) => ({
        id: habit.id,
        nextCategory: characterizeHabitCategory(habit.name, habit.description),
        currentCategory: normalizeHabitCategory(habit.category),
      }))
      .filter((habit) => habit.currentCategory !== habit.nextCategory);

    await prisma.$transaction(
      updates.map((habit) =>
        prisma.habit.update({
          where: { id: habit.id },
          data: { category: habit.nextCategory },
        })
      )
    );

    return NextResponse.json({
      updatedCount: updates.length,
    });
  } catch (error) {
    console.error("[habits characterize POST] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
