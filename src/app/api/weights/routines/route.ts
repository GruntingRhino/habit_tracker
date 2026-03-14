import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const routines = await prisma.weightRoutine.findMany({
    where: { userId: session.user.id },
    orderBy: { order: "asc" },
    include: {
      exercises: { orderBy: { order: "asc" } },
      sessions: { orderBy: { date: "desc" }, take: 1 },
      _count: { select: { sessions: true } },
    },
  });

  return NextResponse.json(routines);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const last = await prisma.weightRoutine.findFirst({
    where: { userId: session.user.id },
    orderBy: { order: "desc" },
  });

  const routine = await prisma.weightRoutine.create({
    data: {
      userId: session.user.id,
      name: body.name.trim(),
      description: body.description ?? undefined,
      order: (last?.order ?? -1) + 1,
    },
    include: { exercises: true, sessions: { take: 1 }, _count: { select: { sessions: true } } },
  });

  return NextResponse.json(routine, { status: 201 });
}
