import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get all exercise logs for this user, ordered by date
  const logs = await prisma.workoutExerciseLog.findMany({
    where: {
      session: { userId: session.user.id },
    },
    include: {
      session: { select: { date: true, routine: { select: { name: true } } } },
    },
    orderBy: { session: { date: "asc" } },
  });

  // Group by exerciseName, build series of { date, weight, sets, reps, routineName }
  const grouped: Record<
    string,
    { date: string; weight: number | null; sets: number | null; reps: string | null; routineName: string }[]
  > = {};

  for (const log of logs) {
    const name = log.exerciseName;
    if (!grouped[name]) grouped[name] = [];
    grouped[name].push({
      date: log.session.date.toISOString(),
      weight: log.weight,
      sets: log.sets,
      reps: log.reps,
      routineName: log.session.routine.name,
    });
  }

  // Only include exercises that have at least one weight entry
  const result = Object.entries(grouped)
    .filter(([, entries]) => entries.some((e) => e.weight !== null))
    .map(([exerciseName, entries]) => ({ exerciseName, entries }))
    .sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));

  return NextResponse.json(result);
}
