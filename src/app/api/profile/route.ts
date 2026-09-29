import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma";
import { getOwnerSession } from "@/lib/owner";
import prisma from "@/lib/prisma";
import { CATEGORIES, isCategory, type ProfileContent } from "@/lib/brain/categories";

/** The distilled profile, one entry per category, plus the brain's status. */
export async function GET() {
  const { user } = await getOwnerSession();
  const [docs, beat, quiz] = await Promise.all([
    prisma.profileDoc.findMany({ where: { userId: user.id } }),
    prisma.brainState.findUnique({ where: { key: "brain" } }),
    prisma.brainState.findUnique({ where: { key: "quiz" } }),
  ]);
  const byCat = new Map(docs.map((d) => [d.category, d]));
  return NextResponse.json({
    categories: CATEGORIES.map((c) => {
      const d = byCat.get(c.id);
      return { id: c.id, label: c.label, content: (d?.content ?? null) as ProfileContent | null, updatedAt: d?.updatedAt ?? null };
    }),
    brain: beat?.value ?? null,
    quiz: quiz ? { answers: (quiz.value as { answers?: unknown }).answers ?? {}, updatedAt: quiz.updatedAt } : null,
  });
}

const correctionSchema = z.object({ category: z.string(), beliefId: z.string().min(1).max(64) });

/** "That's wrong": hide the belief now; the brain removes it from its files and won't re-learn it from old evidence. */
export async function DELETE(req: NextRequest) {
  const { user } = await getOwnerSession();
  const parsed = correctionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isCategory(parsed.data.category)) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const { category, beliefId } = parsed.data;
  const doc = await prisma.profileDoc.findUnique({ where: { userId_category: { userId: user.id, category } } });
  const content = doc?.content as unknown as ProfileContent | undefined;
  const belief = content?.beliefs.find((b) => b.id === beliefId);
  if (!doc || !content || !belief) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.$transaction([
    prisma.profileCorrection.create({ data: { userId: user.id, category, beliefId, text: belief.text } }),
    prisma.profileDoc.update({
      where: { id: doc.id },
      data: { content: { ...content, beliefs: content.beliefs.filter((b) => b.id !== beliefId) } as unknown as Prisma.InputJsonValue },
    }),
  ]);
  return NextResponse.json({ ok: true });
}
