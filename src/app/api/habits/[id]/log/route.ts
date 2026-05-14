import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { recomputeCategoryScoreForDate } from "@/lib/category-score";
import { getStartOfDay } from "@/lib/utils";
import { reportError } from "@/lib/monitoring";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const habitLogPostSchema = z.object({
  date: z.string().datetime({ offset: true }).optional(),
  completed: z.boolean().optional(),
  notes: z.string().trim().max(1000).optional(),
});

export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: habitId } = await params;
    const rawBody = await req.json();
    const parsed = habitLogPostSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const body = parsed.data;

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

    const { log, scores } = await prisma.$transaction(async (tx) => {
      let nextLog;
      if (existing) {
        // Toggle: flip completed state
        const newCompleted =
          body.completed !== undefined ? body.completed : !existing.completed;

        nextLog = await tx.habitLog.update({
          where: { id: existing.id },
          data: {
            completed: newCompleted,
            notes: body.notes ?? existing.notes,
          },
        });
      } else {
        nextLog = await tx.habitLog.create({
          data: {
            habitId,
            date: logDate,
            completed: body.completed ?? true,
            notes: body.notes ?? undefined,
          },
        });
      }

      const nextScores = await recomputeCategoryScoreForDate(
        session.user.id,
        logDate,
        tx
      );

      return { log: nextLog, scores: nextScores };
    });

    return NextResponse.json({ log, scores }, { status: 201 });
  } catch (error) {
    reportError({ context: "habit log POST", error, userId: session.user.id });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
