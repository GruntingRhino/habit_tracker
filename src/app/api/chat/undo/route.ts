import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/owner";
import prisma from "@/lib/prisma";
import { undoActions, type ItemAction } from "@/lib/ai/capture";

const schema = z.object({ messageId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const session = await getOwnerSession();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "messageId is required" }, { status: 400 });

  const message = await prisma.chatMessage.findFirst({ where: { id: parsed.data.messageId, userId: session.user.id } });
  const actions = (message?.actions as ItemAction[] | null) ?? [];
  if (!message || !actions.length) return NextResponse.json({ error: "Nothing to undo" }, { status: 404 });

  const undone = await undoActions(session.user.id, actions);
  await prisma.chatMessage.update({
    where: { id: message.id },
    data: { actions: [], awaiting: undefined, content: `${message.content}\n\n↩︎ Undone` },
  });
  return NextResponse.json({ undone });
}
