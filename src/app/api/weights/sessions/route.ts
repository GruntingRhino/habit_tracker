import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessions = await prisma.workoutSession.findMany({
    where: { userId: session.user.id },
    orderBy: { date: "desc" },
    take: 50,
    include: { routine: { select: { name: true } } },
  });

  return NextResponse.json(sessions);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.routineId) return NextResponse.json({ error: "routineId required" }, { status: 400 });

  const routine = await prisma.weightRoutine.findUnique({ where: { id: body.routineId } });
  if (!routine || routine.userId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const workoutSession = await prisma.workoutSession.create({
    data: {
      userId: session.user.id,
      routineId: body.routineId,
      date: body.date ? new Date(body.date) : new Date(),
      notes: body.notes ?? undefined,
    },
    include: { routine: { select: { name: true } } },
  });

  return NextResponse.json(workoutSession, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessionId = new URL(req.url).searchParams.get("id");
  if (!sessionId) return NextResponse.json({ error: "id required" }, { status: 400 });

  const ws = await prisma.workoutSession.findUnique({ where: { id: sessionId } });
  if (!ws || ws.userId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.workoutSession.delete({ where: { id: sessionId } });
  return NextResponse.json({ message: "deleted" });
}
