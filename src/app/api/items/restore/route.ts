import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/owner";
import { restoreSnapshot, type Snapshot } from "@/lib/ai/itemai";

/** Undo an "Ask AI" change. */
export async function POST(req: NextRequest) {
  const { user } = await getOwnerSession();
  const body = (await req.json().catch(() => null)) as { snapshot?: Snapshot } | null;
  if (!body?.snapshot?.kind) return NextResponse.json({ error: "Nothing to undo" }, { status: 400 });
  const item = await restoreSnapshot(user.id, body.snapshot);
  return item ? NextResponse.json({ ok: true, item }) : NextResponse.json({ error: "Nothing to undo" }, { status: 404 });
}
