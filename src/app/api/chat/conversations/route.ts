import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/owner";
import prisma from "@/lib/prisma";

const HISTORY_DAYS = 30;

/** Saved conversations plus everything touched in the last 30 days, newest first. */
export async function GET() {
  const session = await getOwnerSession();
  const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60_000);
  const conversations = await prisma.conversation.findMany({
    where: { userId: session.user.id, OR: [{ saved: true }, { updatedAt: { gte: since } }], messages: { some: {} } },
    orderBy: { updatedAt: "desc" },
    take: 300,
    select: {
      id: true,
      title: true,
      saved: true,
      source: true,
      updatedAt: true,
      plan: true,
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { content: true } },
    },
  });
  return NextResponse.json(
    conversations.map(({ messages, plan, ...c }) => ({
      ...c,
      isPlan: Boolean(plan),
      preview: messages[0]?.content.replace(/\s+/g, " ").slice(0, 90) ?? "",
    }))
  );
}
