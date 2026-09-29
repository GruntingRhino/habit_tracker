/**
 * One-off: group chat messages from before conversations existed into conversations.
 * A gap of 3+ hours (or a change of source) starts a new one. Safe to re-run: only touches
 * messages with no conversation.
 * Usage: DATABASE_URL=... npx tsx --tsconfig tsconfig.json scripts/backfill-conversations.ts
 */
import prisma from "@/lib/prisma";
import { titleFrom } from "@/lib/ai/conversation";

const GAP_MS = 3 * 60 * 60_000;

async function main() {
  const orphans = await prisma.chatMessage.findMany({ where: { conversationId: null }, orderBy: { createdAt: "asc" } });
  const groups: (typeof orphans)[] = [];
  for (const m of orphans) {
    const group = groups[groups.length - 1];
    const prev = group?.[group.length - 1];
    if (prev && prev.userId === m.userId && prev.source === m.source && m.createdAt.getTime() - prev.createdAt.getTime() < GAP_MS) group.push(m);
    else groups.push([m]);
  }
  for (const group of groups) {
    const first = group.find((m) => m.role === "user") ?? group[0];
    const conv = await prisma.conversation.create({
      data: {
        userId: group[0].userId,
        source: group[0].source,
        title: titleFrom(first.content),
        createdAt: group[0].createdAt,
        updatedAt: group[group.length - 1].createdAt,
      },
    });
    await prisma.chatMessage.updateMany({ where: { id: { in: group.map((m) => m.id) } }, data: { conversationId: conv.id } });
  }
  console.log(`Grouped ${orphans.length} messages into ${groups.length} conversations.`);
  await prisma.$disconnect();
}

main();
