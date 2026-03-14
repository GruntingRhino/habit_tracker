import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

interface RouteParams { params: Promise<{ id: string }> }

async function ownsRoutine(id: string, userId: string) {
  const r = await prisma.weightRoutine.findUnique({ where: { id } });
  return r && r.userId === userId ? r : null;
}

// POST — add single exercise
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: routineId } = await params;
  if (!await ownsRoutine(routineId, session.user.id))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  if (!body.name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const last = await prisma.weightExercise.findFirst({
    where: { routineId },
    orderBy: { order: "desc" },
  });

  const exercise = await prisma.weightExercise.create({
    data: {
      routineId,
      name: body.name.trim(),
      sets: body.sets ?? undefined,
      reps: body.reps ?? undefined,
      weight: body.weight ?? undefined,
      notes: body.notes ?? undefined,
      order: (last?.order ?? -1) + 1,
    },
  });

  return NextResponse.json(exercise, { status: 201 });
}

// PUT — bulk replace exercises (paste import)
export async function PUT(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: routineId } = await params;
  if (!await ownsRoutine(routineId, session.user.id))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  if (!Array.isArray(body.exercises))
    return NextResponse.json({ error: "exercises array required" }, { status: 400 });

  type ExerciseInput = { name: string; sets?: number; reps?: string; weight?: number; notes?: string };

  await prisma.$transaction([
    prisma.weightExercise.deleteMany({ where: { routineId } }),
    ...( body.exercises as ExerciseInput[]).map((ex, idx) =>
      prisma.weightExercise.create({
        data: {
          routineId,
          name: ex.name.trim(),
          sets: ex.sets ?? undefined,
          reps: ex.reps ?? undefined,
          weight: ex.weight ?? undefined,
          notes: ex.notes ?? undefined,
          order: idx,
        },
      })
    ),
  ]);

  const exercises = await prisma.weightExercise.findMany({
    where: { routineId },
    orderBy: { order: "asc" },
  });

  return NextResponse.json({ exercises, count: exercises.length });
}

// DELETE a single exercise — id passed as query param
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: routineId } = await params;
  if (!await ownsRoutine(routineId, session.user.id))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const exerciseId = new URL(req.url).searchParams.get("exerciseId");
  if (!exerciseId) return NextResponse.json({ error: "exerciseId required" }, { status: 400 });

  await prisma.weightExercise.delete({ where: { id: exerciseId } });
  return NextResponse.json({ message: "deleted" });
}
