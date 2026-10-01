import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import prisma from "@/lib/prisma";
import { getOwnerSession } from "@/lib/owner";

/** A one-time code to link this person's Telegram chat: they send "/link CODE" (or open the t.me link) to the bot. */
export async function POST() {
  const { user } = await getOwnerSession();
  if (!user.integrations) return NextResponse.json({ error: "Not available on this account" }, { status: 403 });

  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const code = Array.from(randomBytes(8), (b) => abc[b % abc.length]).join("");
  await prisma.user.update({ where: { id: user.id }, data: { telegramLinkCode: code } });
  let bot: string | null = process.env.TELEGRAM_BOT_USERNAME ?? null;
  if (!bot && process.env.TELEGRAM_BOT_TOKEN) {
    const me = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`, { signal: AbortSignal.timeout(5000) }).then((r) => r.json()).catch(() => null);
    bot = me?.result?.username ?? null;
  }
  return NextResponse.json({ code, bot, link: bot ? `https://t.me/${bot}?start=${code}` : null });
}

export async function DELETE() {
  const { user } = await getOwnerSession();
  await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: null, telegramLinkCode: null } });
  return NextResponse.json({ ok: true });
}
