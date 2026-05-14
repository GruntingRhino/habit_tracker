import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";

interface RouteParams { params: Promise<{ id: string }> }

const exercisePostSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(120),
  descriptor: z.string().trim().max(200).optional(),
});

const exercisePutSchema = z.object({
  exercises: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        descriptor: z.string().trim().max(200).optional(),
      })
    )
    .min(1)
    .max(50),
});

async function ownsRoutine(id: string, userId: string) {
  const r = await prisma.weightRoutine.findUnique({ where: { id } });
  return r?.userId === userId ? r : null;
}

async function ownsExercise(exerciseId: string, routineId: string) {
  const ex = await prisma.weightExercise.findUnique({ where: { id: exerciseId } });
  return ex?.routineId === routineId ? ex : null;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: routineId } = await params;

  try {
    if (!await ownsRoutine(routineId, session.user.id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const rawBody = await req.json();
    const parsed = exercisePostSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const last = await prisma.weightExercise.findFirst({
      where: { routineId },
      orderBy: { order: "desc" },
    });

    const exercise = await prisma.weightExercise.create({
      data: {
        routineId,
        name: parsed.data.name,
        descriptor: parsed.data.descriptor,
        order: (last?.order ?? -1) + 1,
      },
    });

    return NextResponse.json(exercise, { status: 201 });
  } catch (error) {
    reportError({ context: "exercises POST", error, userId: session.user.id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: routineId } = await params;

  try {
    if (!await ownsRoutine(routineId, session.user.id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const rawBody = await req.json();
    const parsed = exercisePutSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    await prisma.$transaction([
      prisma.weightExercise.deleteMany({ where: { routineId } }),
      ...parsed.data.exercises.map((ex, idx) =>
        prisma.weightExercise.create({
          data: { routineId, name: ex.name, descriptor: ex.descriptor, order: idx },
        })
      ),
    ]);

    const exercises = await prisma.weightExercise.findMany({
      where: { routineId },
      orderBy: { order: "asc" },
    });

    return NextResponse.json({ exercises, count: exercises.length });
  } catch (error) {
    reportError({ context: "exercises PUT", error, userId: session.user.id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: routineId } = await params;

  try {
    if (!await ownsRoutine(routineId, session.user.id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const exerciseId = new URL(req.url).searchParams.get("exerciseId");
    if (!exerciseId) return NextResponse.json({ error: "exerciseId required" }, { status: 400 });

    if (!await ownsExercise(exerciseId, routineId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.weightExercise.delete({ where: { id: exerciseId } });
    return NextResponse.json({ message: "deleted" });
  } catch (error) {
    reportError({ context: "exercises DELETE", error, userId: session.user.id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
