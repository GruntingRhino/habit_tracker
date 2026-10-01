import { stateKey } from "@/lib/request-context";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma";
import { getOwnerSession } from "@/lib/owner";
import prisma from "@/lib/prisma";
import { QUIZ } from "@/lib/brain/quiz";

export async function GET() {
  return NextResponse.json(QUIZ);
}

const answer = z.union([z.string().trim().min(1).max(200), z.array(z.string().trim().min(1).max(200)).min(1).max(8)]);
const schema = z.object({ answers: z.record(z.string(), answer) });

/** Save quiz answers (merged with earlier ones). The brain turns them into profile beliefs within a minute. */
export async function POST(req: NextRequest) {
  await getOwnerSession();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid answers" }, { status: 400 });
  const known = new Set(QUIZ.map((q) => q.id));
  const incoming = Object.fromEntries(Object.entries(parsed.data.answers).filter(([k]) => known.has(k)));
  if (!Object.keys(incoming).length) return NextResponse.json({ error: "No known questions answered" }, { status: 400 });
  const existing = await prisma.brainState.findUnique({ where: { key: await stateKey("quiz") } });
  const answers = { ...((existing?.value as { answers?: Record<string, unknown> } | null)?.answers ?? {}), ...incoming };
  const value = { answers } as Prisma.InputJsonValue;
  await prisma.brainState.upsert({ where: { key: await stateKey("quiz") }, update: { value }, create: { key: await stateKey("quiz"), value } });
  return NextResponse.json({ ok: true, answered: Object.keys(answers).length, of: QUIZ.length });
}
