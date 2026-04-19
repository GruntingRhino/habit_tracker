import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { recomputeCategoryScoreForDate } from "@/lib/category-score";
import {
  dailyEntryPayloadSchema,
  normalizeDailyEntryPayload,
} from "@/lib/daily-entry";
import { getStartOfDay } from "@/lib/utils";
import { subDays } from "date-fns";

function asUpdateValue<T>(value: T | null | undefined): T | null | undefined {
  return value === null ? null : value ?? undefined;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const thirtyDaysAgo = subDays(new Date(), 30);

    const entries = await prisma.dailyEntry.findMany({
      where: {
        userId: session.user.id,
        date: { gte: thirtyDaysAgo },
      },
      orderBy: { date: "desc" },
      include: {
        categoryScores: true,
      },
    });

    return NextResponse.json(entries);
  } catch (error) {
    console.error("[daily-entries GET] error:", error);
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
    const parsedBody = dailyEntryPayloadSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: parsedBody.error.issues[0]?.message ?? "Invalid daily entry",
          issues: parsedBody.error.flatten(),
        },
        { status: 400 }
      );
    }

    const body = normalizeDailyEntryPayload(parsedBody.data);
    const userId = session.user.id;

    const entryDate = body.date
      ? getStartOfDay(new Date(body.date))
      : getStartOfDay(new Date());

    // Check for existing entry for this user on this date
    const existingEntry = await prisma.dailyEntry.findFirst({
      where: { userId, date: entryDate },
    });

    let entry;
    if (existingEntry) {
      entry = await prisma.dailyEntry.update({
        where: { id: existingEntry.id },
        data: {
          sleepHours: asUpdateValue(body.sleepHours),
          workoutCompleted: body.workoutCompleted ?? undefined,
          workoutRoutineName: asUpdateValue(body.workoutRoutineName),
          workoutDurationMinutes: asUpdateValue(body.workoutDurationMinutes),
          workoutIntensity: asUpdateValue(body.workoutIntensity),
          workoutDetails: asUpdateValue(body.workoutDetails),
          sportsTrainingMinutes: asUpdateValue(body.sportsTrainingMinutes),
          steps: asUpdateValue(body.steps),
          deepWorkHours: asUpdateValue(body.deepWorkHours),
          screenTimeHours: asUpdateValue(body.screenTimeHours),
          tasksPlanned: asUpdateValue(body.tasksPlanned),
          tasksCompleted: asUpdateValue(body.tasksCompleted),
          taskDifficultyRating: asUpdateValue(body.taskDifficultyRating),
          moneySpent: asUpdateValue(body.moneySpent),
          moneySaved: asUpdateValue(body.moneySaved),
          incomeActivity: body.incomeActivity ?? undefined,
          caloriesEaten: asUpdateValue(body.caloriesEaten),
          rightWithGod: body.rightWithGod ?? undefined,
          wakeTime: asUpdateValue(body.wakeTime),
          bedtime: asUpdateValue(body.bedtime),
          notes: asUpdateValue(body.notes),
          overallDayRating: asUpdateValue(body.overallDayRating),
        },
      });
    } else {
      entry = await prisma.dailyEntry.create({
        data: {
          userId,
          date: entryDate,
          sleepHours: body.sleepHours,
          workoutCompleted: body.workoutCompleted ?? false,
          workoutRoutineName: body.workoutRoutineName,
          workoutDurationMinutes: body.workoutDurationMinutes,
          workoutIntensity: body.workoutIntensity,
          workoutDetails: body.workoutDetails,
          sportsTrainingMinutes: body.sportsTrainingMinutes,
          steps: body.steps,
          deepWorkHours: body.deepWorkHours,
          screenTimeHours: body.screenTimeHours,
          tasksPlanned: body.tasksPlanned,
          tasksCompleted: body.tasksCompleted,
          taskDifficultyRating: body.taskDifficultyRating,
          moneySpent: body.moneySpent,
          moneySaved: body.moneySaved,
          incomeActivity: body.incomeActivity ?? false,
          caloriesEaten: body.caloriesEaten,
          rightWithGod: body.rightWithGod ?? false,
          wakeTime: body.wakeTime,
          bedtime: body.bedtime,
          notes: body.notes,
          overallDayRating: body.overallDayRating,
        },
      });
    }

    const savedScores = await recomputeCategoryScoreForDate(userId, entryDate);

    return NextResponse.json(
      { entry, scores: savedScores },
      { status: 201 }
    );
  } catch (error) {
    console.error("[daily-entries POST] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
