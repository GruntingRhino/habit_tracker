import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * DELETE /api/reset
 *
 * Deletes all tracking data for the current user while preserving:
 *   - User account
 *   - Habits (definitions)
 *   - Projects + tasks
 *   - Meals
 *   - Weight routines + exercises
 *
 * Deletes (in dependency order):
 *   1. WorkoutExerciseLog  (child of WorkoutSession)
 *   2. WorkoutSession      (child of User / WeightRoutine)
 *   3. HabitLog            (child of Habit)
 *   4. CategoryScore       (child of User / DailyEntry)
 *   5. DailyEntry          (child of User)
 */
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  await prisma.$transaction([
    // 1. Exercise logs inside workout sessions
    prisma.workoutExerciseLog.deleteMany({
      where: { session: { userId } },
    }),
    // 2. Workout sessions
    prisma.workoutSession.deleteMany({ where: { userId } }),
    // 3. Habit completion logs
    prisma.habitLog.deleteMany({ where: { habit: { userId } } }),
    // 4. Category scores
    prisma.categoryScore.deleteMany({ where: { userId } }),
    // 5. Daily entries
    prisma.dailyEntry.deleteMany({ where: { userId } }),
  ]);

  return NextResponse.json({ ok: true });
}
