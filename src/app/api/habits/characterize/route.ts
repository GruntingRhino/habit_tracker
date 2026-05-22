import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { characterizeHabitCategory, normalizeHabitCategory } from "@/lib/habit-category";
import { markCoachContextDirty } from "@/lib/coach-context-cache";

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
    if (updates.length > 0) {
      await markCoachContextDirty(session.user.id);
    }

    return NextResponse.json({
      updatedCount: updates.length,
    });
  } catch (error) {
    reportError({ context: "habits characterize POST", error, userId: session.user.id });
    return NextResponse.json(
      { error: "Failed to characterize habits" },
      { status: 500 }
    );
  }
}
