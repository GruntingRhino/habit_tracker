import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { subDays } from "date-fns";
import { getOwnerSession } from "@/lib/owner";
import prisma from "@/lib/prisma";

/** What the background AI noticed lately (still open). */
export async function GET() {
  const { user } = await getOwnerSession();
  const nudges = await prisma.brainNudge.findMany({
    where: { userId: user.id, status: "active", createdAt: { gte: subDays(new Date(), 7) } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  // One per kind+key (the newest), so a daily nudge doesn't pile up.
  const seen = new Set<string>();
  return NextResponse.json(nudges.filter((n) => !seen.has(`${n.kind}:${n.key}`) && (seen.add(`${n.kind}:${n.key}`), true)));
}

const schema = z.object({ id: z.string().min(1), act: z.enum(["dismiss", "do"]) });

/** Dismiss a nudge, or do its one-tap action (clear a to-do, mark an old reminder done). */
export async function POST(req: NextRequest) {
  const { user } = await getOwnerSession();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const nudge = await prisma.brainNudge.findFirst({ where: { id: parsed.data.id, userId: user.id } });
  if (!nudge) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (parsed.data.act === "do") {
    const action = nudge.action as { type?: string; id?: string } | null;
    if (action?.type === "todo-delete" && action.id) await prisma.todo.deleteMany({ where: { id: action.id, userId: user.id } });
    if (action?.type === "todo-done" && action.id) await prisma.todo.updateMany({ where: { id: action.id, userId: user.id }, data: { status: "done", completedAt: new Date() } });
    if (action?.type === "reminder-done" && action.id) await prisma.reminder.updateMany({ where: { id: action.id, userId: user.id }, data: { status: "done" } });
  }
  // Same kind+key on other days goes too, so it doesn't come back from an older row.
  await prisma.brainNudge.updateMany({ where: { userId: user.id, kind: nudge.kind, key: nudge.key }, data: { status: parsed.data.act === "do" ? "done" : "dismissed" } });
  return NextResponse.json({ ok: true });
}
