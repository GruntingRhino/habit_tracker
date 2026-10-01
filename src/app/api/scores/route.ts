import { stateKey } from "@/lib/request-context";
import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/owner";
import prisma from "@/lib/prisma";
import { LIVE_STATE_KEY, type LiveScoreState } from "@/lib/brain/scores";
import { weekScore } from "@/lib/weekly";

/**
 * Most recent scores (newest first) — the chat screen shows the latest one.
 * `?live=1` wraps them with the brain's live status: {scores, live: {pending, gradedAt, brainUp}}.
 */
export async function GET(req: NextRequest) {
  const { user } = await getOwnerSession();
  const [scores, live, beat] = await Promise.all([
    prisma.categoryScore.findMany({
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
        finalized: true,
      },
    }),
    req.nextUrl.searchParams.get("live") ? prisma.brainState.findUnique({ where: { key: stateKey(LIVE_STATE_KEY) } }) : null,
    req.nextUrl.searchParams.get("live") ? prisma.brainState.findUnique({ where: { key: stateKey("brain") } }) : null,
  ]);
  if (!req.nextUrl.searchParams.get("live")) return NextResponse.json(scores);
  const state = (live?.value ?? { pending: false }) as unknown as LiveScoreState;
  const beatAt = (beat?.value as { at?: string } | null)?.at;
  return NextResponse.json({
    scores,
    week: await weekScore(user.id),
    live: { pending: !!state.pending, since: state.since ?? null, gradedAt: state.gradedAt ?? null, brainUp: !!beatAt && Date.now() - new Date(beatAt).getTime() < 15 * 60_000 },
  });
}
