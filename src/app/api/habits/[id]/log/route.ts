import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getStartOfDay } from "@/lib/utils";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: habitId } = await params;
    const body = await req.json();

    // Verify habit belongs to user
    const habit = await prisma.habit.findUnique({ where: { id: habitId } });
    if (!habit || habit.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const logDate = body.date
      ? getStartOfDay(new Date(body.date))
      : getStartOfDay(new Date());

    // Find existing log
    const existing = await prisma.habitLog.findUnique({
      where: {
        habitId_date: {
          habitId,
          date: logDate,
        },
      },
    });

    let log;
    if (existing) {
      // Toggle: flip completed state
      const newCompleted =
        body.completed !== undefined ? body.completed : !existing.completed;

      log = await prisma.habitLog.update({
        where: { id: existing.id },
        data: {
          completed: newCompleted,
          notes: body.notes ?? existing.notes,
        },
      });
    } else {
      log = await prisma.habitLog.create({
        data: {
          habitId,
          date: logDate,
          completed: body.completed ?? true,
          notes: body.notes ?? undefined,
        },
      });
    }

    return NextResponse.json(log, { status: 201 });
  } catch (error) {
    console.error("[habit log POST] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
