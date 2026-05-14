import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { calcStreak } from "@/lib/utils";
import { subDays } from "date-fns";

const VALID_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const VALID_CATEGORIES = [
  "general", "physical", "mental", "health",
  "productivity", "financial", "social", "spiritual",
] as const;

const habitPostSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(100),
  description: z.string().trim().max(500).optional(),
  category: z.enum(VALID_CATEGORIES).default("general"),
  targetDays: z.array(z.enum(VALID_DAYS)).min(1).max(7).default([...VALID_DAYS]),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "color must be a hex code like #3b82f6")
    .default("#3b82f6"),
});

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
    reportError({ context: "habits GET", error, userId: session.user.id });
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
    const rawBody = await req.json();
    const parsed = habitPostSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const habit = await prisma.habit.create({
      data: {
        userId: session.user.id,
        name: parsed.data.name,
        description: parsed.data.description,
        category: parsed.data.category,
        targetDays: parsed.data.targetDays,
        color: parsed.data.color,
      },
    });

    return NextResponse.json(habit, { status: 201 });
  } catch (error) {
    reportError({ context: "habits POST", error, userId: session.user.id });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
