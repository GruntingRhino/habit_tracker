import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/owner";
import { undoMessage } from "@/lib/ai/assistant";

const schema = z.object({ messageId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const session = await getOwnerSession();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "messageId is required" }, { status: 400 });
  const result = await undoMessage(session.user.id, parsed.data.messageId);
  if (!result) return NextResponse.json({ error: "Nothing to undo" }, { status: 404 });
  return NextResponse.json(result);
}
