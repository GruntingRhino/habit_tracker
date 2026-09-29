import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/owner";
import { estimateNutrition } from "@/lib/ai/nutrition";
import { reportError } from "@/lib/monitoring";

export const maxDuration = 200;

const schema = z.object({ text: z.string().trim().min(2).max(600), amounts: z.record(z.string(), z.string().max(40)).optional() });

/** Describe a meal → an editable nutrition draft. Nothing is saved. */
export async function POST(req: NextRequest) {
  const { user } = await getOwnerSession();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Describe what you ate" }, { status: 400 });
  try {
    const amounts = Object.fromEntries(Object.entries(parsed.data.amounts ?? {}).map(([k, v]) => [Number(k), v]));
    const draft = await estimateNutrition(parsed.data.text, { amounts });
    if (!draft.items.length) return NextResponse.json({ error: "Couldn't pick out any foods. Try listing them, e.g. \"2 eggs and a banana\"." }, { status: 422 });
    return NextResponse.json(draft);
  } catch (error) {
    reportError({ context: "nutrition.estimate", error, userId: user.id });
    return NextResponse.json({ error: "The AI is busy right now. Try again, or fill it in yourself." }, { status: 503 });
  }
}
