import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";

const exerciseLogSchema = z.object({
  exerciseId: z.string().cuid().optional(),
  exerciseName: z.string().trim().min(1).max(120),
  weight: z.number().min(0).max(10000).optional(),
  sets: z.number().int().min(1).max(100).optional(),
  reps: z.string().trim().max(50).optional(),
  notes: z.string().trim().max(500).optional(),
});

const sessionPostSchema = z.object({
  routineId: z.string().cuid("routineId is required"),
  date: z.string().datetime({ offset: true }).optional(),
  notes: z.string().trim().max(1000).optional(),
  exerciseLogs: z.array(exerciseLogSchema).max(50).optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sessions = await prisma.workoutSession.findMany({
      where: { userId: session.user.id },
      orderBy: { date: "desc" },
      take: 100,
      include: {
        routine: { select: { id: true, name: true } },
        exerciseLogs: { orderBy: { createdAt: "asc" } },
      },
    });
    return NextResponse.json(sessions);
  } catch (error) {
    reportError({ context: "sessions GET", error, userId: session.user.id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rawBody = await req.json();
    const parsed = sessionPostSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const routine = await prisma.weightRoutine.findUnique({
      where: { id: parsed.data.routineId },
    });
    if (!routine || routine.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const workoutSession = await prisma.workoutSession.create({
      data: {
        userId: session.user.id,
        routineId: parsed.data.routineId,
        date: parsed.data.date ? new Date(parsed.data.date) : new Date(),
        notes: parsed.data.notes,
        exerciseLogs: parsed.data.exerciseLogs?.length
          ? {
              create: parsed.data.exerciseLogs.map((l) => ({
                exerciseId: l.exerciseId,
                exerciseName: l.exerciseName,
                weight: l.weight,
                sets: l.sets,
                reps: l.reps,
                notes: l.notes,
              })),
            }
          : undefined,
      },
      include: {
        routine: { select: { id: true, name: true } },
        exerciseLogs: true,
      },
    });

    return NextResponse.json(workoutSession, { status: 201 });
  } catch (error) {
    reportError({ context: "sessions POST", error, userId: session.user.id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sessionId = new URL(req.url).searchParams.get("id");
    if (!sessionId) return NextResponse.json({ error: "id required" }, { status: 400 });

    const ws = await prisma.workoutSession.findUnique({ where: { id: sessionId } });
    if (!ws || ws.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.workoutSession.delete({ where: { id: sessionId } });
    return NextResponse.json({ message: "deleted" });
  } catch (error) {
    reportError({ context: "sessions DELETE", error, userId: session.user.id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
