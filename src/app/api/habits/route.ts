import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { calcStreak, getStartOfDay } from "@/lib/utils";
import { subDays } from "date-fns";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const thirtyDaysAgo = subDays(new Date(), 30);

    const habits = await prisma.habit.findMany({
      where: {
        userId: session.user.id,
        isActive: true,
      },
      include: {
        logs: {
          where: {
            date: { gte: thirtyDaysAgo },
          },
          orderBy: { date: "desc" },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const habitsWithStreak = habits.map((habit) => {
      const streakLogs = habit.logs.map((log) => ({
        date: log.date,
        completed: log.completed,
      }));

      return {
        ...habit,
        streak: calcStreak(streakLogs),
        completionRate:
          habit.logs.length > 0
            ? habit.logs.filter((l) => l.completed).length / habit.logs.length
            : 0,
      };
    });

    return NextResponse.json(habitsWithStreak);
  } catch (error) {
    console.error("[habits GET] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    if (!body.name || typeof body.name !== "string") {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    const habit = await prisma.habit.create({
      data: {
        userId: session.user.id,
        name: body.name.trim(),
        description: body.description ?? undefined,
        category: body.category ?? "general",
        targetDays: body.targetDays ?? ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        color: body.color ?? "#3b82f6",
      },
    });

    return NextResponse.json(habit, { status: 201 });
  } catch (error) {
    console.error("[habits POST] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
