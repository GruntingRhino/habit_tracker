import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/owner";
import prisma from "@/lib/prisma";
import { googleConfigured, syncGoogle } from "@/lib/google";

export const maxDuration = 60;

/** Status of the Google link. */
export async function GET() {
  const { user } = await getOwnerSession();
  const acct = await prisma.googleAccount.findUnique({ where: { userId: user.id }, select: { email: true, lastSyncAt: true, lastError: true } });
  // Accounts without integrations don't see Google Calendar at all.
  return NextResponse.json({ configured: googleConfigured() && user.integrations, connected: !!acct, email: acct?.email ?? null, lastSyncAt: acct?.lastSyncAt ?? null, lastError: acct?.lastError ?? null });
}

/** "Sync now". */
export async function POST() {
  const { user } = await getOwnerSession();
  if (!user.integrations) return NextResponse.json({ error: "Not available on this account" }, { status: 403 });

  return NextResponse.json(await syncGoogle(user.id));
}

/** Disconnect (the app forgets the token; events already pulled stay until the next connect). */
export async function DELETE() {
  const { user } = await getOwnerSession();
  await prisma.googleAccount.deleteMany({ where: { userId: user.id } });
  return NextResponse.json({ ok: true });
}
