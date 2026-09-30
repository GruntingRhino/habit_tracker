import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/owner";
import { askItem } from "@/lib/ai/itemai";
import { reportError } from "@/lib/monitoring";

export const maxDuration = 300;

const schema = z.object({ type: z.enum(["todo", "project"]), id: z.string().min(1), instruction: z.string().trim().min(2).max(1000) });

/** "Ask AI" on one item: it changes the item and returns a snapshot for undo. */
export async function POST(req: NextRequest) {
  const { user } = await getOwnerSession();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Say what you want done." }, { status: 400 });
  try {
    return NextResponse.json(await askItem(user.id, { type: parsed.data.type, id: parsed.data.id }, parsed.data.instruction));
  } catch (error) {
    reportError({ context: "items/ai", error, userId: user.id });
    const missing = error instanceof Error && /No .* found|NotFound/i.test(`${error.name} ${error.message}`);
    return NextResponse.json({ error: missing ? "That item no longer exists." : "The AI is busy or down right now — try again in a minute." }, { status: missing ? 404 : 503 });
  }
}
