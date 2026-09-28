import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/owner";
import prisma from "@/lib/prisma";
import { handleMessage } from "@/lib/ai/assistant";

export const maxDuration = 300;

const postSchema = z.object({ message: z.string().trim().min(1).max(2000) });

export async function GET() {
  const session = await getOwnerSession();
  const messages = await prisma.chatMessage.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  return NextResponse.json(messages.reverse());
}

export async function POST(req: NextRequest) {
  const session = await getOwnerSession();
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "message is required" }, { status: 400 });
  const result = await handleMessage(session.user.id, parsed.data.message, "web");
  return NextResponse.json(result);
}
