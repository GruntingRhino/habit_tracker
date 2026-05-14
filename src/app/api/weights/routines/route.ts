import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";

const routinePostSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(100),
  description: z.string().trim().max(500).optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
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
  } catch (error) {
    reportError({ context: "routines GET", error, userId: session.user.id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rawBody = await req.json();
    const parsed = routinePostSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const last = await prisma.weightRoutine.findFirst({
      where: { userId: session.user.id },
      orderBy: { order: "desc" },
    });

    const routine = await prisma.weightRoutine.create({
      data: {
        userId: session.user.id,
        name: parsed.data.name,
        description: parsed.data.description,
        order: (last?.order ?? -1) + 1,
      },
      include: { exercises: true, sessions: { take: 1 }, _count: { select: { sessions: true } } },
    });

    return NextResponse.json(routine, { status: 201 });
  } catch (error) {
    reportError({ context: "routines POST", error, userId: session.user.id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
