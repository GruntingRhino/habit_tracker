import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";

interface RouteParams { params: Promise<{ id: string }> }

const routinePatchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).nullable().optional(),
});

async function getRoutine(id: string, userId: string) {
  const r = await prisma.weightRoutine.findUnique({ where: { id } });
  if (!r || r.userId !== userId) return null;
  return r;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const routine = await prisma.weightRoutine.findUnique({
    where: { id },
    include: {
      exercises: { orderBy: { order: "asc" } },
      sessions: { orderBy: { date: "desc" }, take: 10 },
      _count: { select: { sessions: true } },
    },
  });
  if (!routine || routine.userId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(routine);
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const routine = await getRoutine(id, session.user.id);
    if (!routine) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const rawBody = await req.json();
    const parsed = routinePatchSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const body = parsed.data;
    const updated = await prisma.weightRoutine.update({
      where: { id },
      data: {
        name: body.name ?? routine.name,
        description: body.description !== undefined ? body.description : routine.description,
      },
    });
    return NextResponse.json(updated);
  } catch (error) {
    reportError({ context: "routines PATCH", error, userId: session.user.id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const routine = await getRoutine(id, session.user.id);
    if (!routine) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.weightRoutine.delete({ where: { id } });
    return NextResponse.json({ message: "deleted" });
  } catch (error) {
    reportError({ context: "routines DELETE", error, userId: session.user.id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
