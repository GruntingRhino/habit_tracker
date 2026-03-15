import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { chatWithCoach, type ChatMessage } from "@/lib/ollama";
import { startOfDay, addDays, subDays } from "date-fns";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as { messages: ChatMessage[] };
  const messages: ChatMessage[] = body.messages ?? [];
  const userId = session.user.id;

  const todayStart = startOfDay(new Date());
  const todayEnd = addDays(todayStart, 1);

  const [todayEntry, todayScore, recentScores] = await Promise.all([
    prisma.dailyEntry.findFirst({
      where: { userId, date: { gte: todayStart, lt: todayEnd } },
    }),
    prisma.categoryScore.findFirst({
      where: { userId, date: { gte: todayStart, lt: todayEnd } },
    }),
    prisma.categoryScore.findMany({
      where: { userId, date: { gte: subDays(new Date(), 30) } },
      orderBy: { date: "desc" },
    }),
  ]);

  const recentAvg =
    recentScores.length > 0
      ? Math.round(
          (recentScores.reduce((s, r) => s + (r.overall ?? 0), 0) /
            recentScores.length) *
            10
        ) / 10
      : undefined;

  const reply = await chatWithCoach(messages, {
    entry: todayEntry
      ? {
          sleepHours: todayEntry.sleepHours,
          workoutCompleted: todayEntry.workoutCompleted,
          workoutRoutineName: todayEntry.workoutRoutineName,
          workoutDurationMinutes: todayEntry.workoutDurationMinutes,
          workoutIntensity: todayEntry.workoutIntensity,
          deepWorkHours: todayEntry.deepWorkHours,
          screenTimeHours: todayEntry.screenTimeHours,
          tasksPlanned: todayEntry.tasksPlanned,
          tasksCompleted: todayEntry.tasksCompleted,
          moneySpent: todayEntry.moneySpent,
          moneySaved: todayEntry.moneySaved,
          incomeActivity: todayEntry.incomeActivity,
          steps: todayEntry.steps,
          caloriesEaten: todayEntry.caloriesEaten,
          overallDayRating: todayEntry.overallDayRating,
          notes: todayEntry.notes,
        }
      : undefined,
    scores: todayScore
      ? {
          physical: todayScore.physical ?? 0,
          focus: todayScore.focus ?? 0,
          discipline: todayScore.discipline ?? 0,
          financial: todayScore.financial ?? 0,
          mental: todayScore.mental ?? 0,
          appearance: todayScore.appearance ?? 0,
          overall: todayScore.overall ?? 0,
        }
      : undefined,
    recentAvg,
  });

  return NextResponse.json({ message: reply });
}
