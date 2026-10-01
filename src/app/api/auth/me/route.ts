import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getOwnerSession } from "@/lib/owner";

export async function GET() {
  const { user } = await getOwnerSession();
  const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { telegramChatId: true } });
  return NextResponse.json({ name: user.name, username: user.username, isAdmin: user.isAdmin, integrations: user.integrations, telegram: !!row.telegramChatId });
}
