import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/owner";
import prisma from "@/lib/prisma";
import { blockStatus, planRoutines, todaysTraining } from "@/lib/training";

/** Coach view: today's routines with targets, per-exercise targets for every routine, block status. */
export async function GET() {
  const { user } = await getOwnerSession();
  const routines = await prisma.weightRoutine.findMany({ where: { userId: user.id }, orderBy: { order: "asc" }, select: { id: true, name: true, exercises: { orderBy: { order: "asc" }, select: { id: true, name: true, descriptor: true } } } });
  const [today, all, block] = await Promise.all([todaysTraining(user.id), planRoutines(user.id, routines), blockStatus(user.id)]);
  const byExercise: Record<string, { last: string | null; next: string; nextWeight: number | null; nextReps: string; status: string; why: string }> = {};
  for (const r of all) for (const e of r.exercises) byExercise[e.exerciseId] = e.suggestion;
  return NextResponse.json({
    today: today.plans.map((p) => ({ routineId: p.routineId, name: p.name, deload: p.deload })),
    deload: Object.fromEntries(all.map((r) => [r.routineId, r.deload])),
    byExercise,
    block,
  });
}
