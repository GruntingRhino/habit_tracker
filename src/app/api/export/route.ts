import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/owner";
import prisma from "@/lib/prisma";

export async function GET() {
  const { user } = await getOwnerSession();
  const userId = user.id;
  const [todos, projects, habits, meals, notes, entries, scores, reminders, routines, sessions] = await Promise.all([
    prisma.todo.findMany({ where: { userId } }),
    prisma.project.findMany({ where: { userId }, include: { tasks: true } }),
    prisma.habit.findMany({ where: { userId }, include: { logs: true } }),
    prisma.meal.findMany({ where: { userId } }),
    prisma.note.findMany({ where: { userId } }),
    prisma.dailyEntry.findMany({ where: { userId } }),
    prisma.categoryScore.findMany({ where: { userId } }),
    prisma.reminder.findMany({ where: { userId } }),
    prisma.weightRoutine.findMany({ where: { userId }, include: { exercises: true } }),
    prisma.workoutSession.findMany({ where: { userId }, include: { exerciseLogs: true } }),
  ]);
  const body = JSON.stringify({ exportedAt: new Date(), todos, projects, habits, meals, notes, entries, scores, reminders, routines, sessions }, null, 2);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="liveimproved-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
