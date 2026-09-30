import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Area } from "@/lib/areas";
import { getOwnerSession } from "@/lib/owner";
import { categoryForArea, classifyHabit, timeOfDayFor } from "@/lib/ai/habitarea";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { calcStreak } from "@/lib/utils";
import { habitCategoryToArea, normalizeHabitCategory } from "@/lib/habit-category";
import { subDays } from "date-fns";
import { strictObject } from "@/lib/validation";

const VALID_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const VALID_CATEGORIES = [
  "general", "physical", "mental", "health",
  "productivity", "financial", "finance", "social", "spiritual",
  "discipline", "focus",
] as const;

const habitPostSchema = strictObject({
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
  const session = await getOwnerSession();
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
  const session = await getOwnerSession();
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

    // No category chosen: the AI decides which area it counts toward.
    const chosen = rawBody && typeof rawBody === "object" && "category" in rawBody;
    const area = chosen ? habitCategoryToArea(parsed.data.category) : await classifyHabit(parsed.data.name);
    const habit = await prisma.habit.create({
      data: {
        userId: session.user.id,
        name: parsed.data.name,
        description: parsed.data.description,
        category: chosen ? normalizeHabitCategory(parsed.data.category) : categoryForArea(area as Area),
        area,
        timeOfDay: timeOfDayFor(parsed.data.name),
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