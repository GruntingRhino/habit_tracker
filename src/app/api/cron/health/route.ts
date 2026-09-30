import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import prisma from "@/lib/prisma";
import { outsideCheck } from "@/lib/health";

/**
 * Daily outside check (Vercel cron, see vercel.json): if the server's heartbeats are stale, the
 * server can't report itself — so this sends the Telegram alert. Needs CRON_SECRET,
 * TELEGRAM_BOT_TOKEN and TELEGRAM_OWNER_CHAT_ID in the Vercel env.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await outsideCheck();
  let sent = false;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_OWNER_CHAT_ID;
  if (result.problems.length && token && chat) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, parse_mode: "HTML", text: `🔴 <b>LiveImproved (outside check)</b>\n${result.problems.map((p) => `• ${p}`).join("\n")}` }),
    }).catch(() => null);
    sent = !!res?.ok;
  }
  const value = { at: new Date().toISOString(), ...result, sent } as unknown as Prisma.InputJsonValue;
  await prisma.brainState.upsert({ where: { key: "cron-health" }, update: { value }, create: { key: "cron-health", value } }).catch(() => undefined);
  return NextResponse.json({ ...result, sent });
}
