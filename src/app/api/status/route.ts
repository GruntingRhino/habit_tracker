import { NextResponse } from "next/server";
import { isModelUp, LLM_MODEL } from "@/lib/ai/llm";

export async function GET() {
  return NextResponse.json({
    model: LLM_MODEL,
    up: await isModelUp(),
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_OWNER_CHAT_ID),
    timezone: process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    owner: process.env.OWNER_LOGIN ?? null,
  });
}
