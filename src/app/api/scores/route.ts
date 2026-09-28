import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/owner";
import prisma from "@/lib/prisma";

/** Most recent scores (newest first) — the chat screen shows the latest one. */
export async function GET() {
  const { user } = await getOwnerSession();
  const scores = await prisma.categoryScore.findMany({
    where: { userId: user.id },
    orderBy: { date: "desc" },
    take: 14,
    select: {
      date: true,
      physical: true,
      mental: true,
      financial: true,
      spiritual: true,
      overall: true,
      rationale: true,
      journalScore: true,
      journalFeedback: true,
      judgedBy: true,
    },
  });
  return NextResponse.json(scores);
}
