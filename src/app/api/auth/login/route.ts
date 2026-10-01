import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { cookieOptions, SESSION_COOKIE, signSession, verifyPassword } from "@/lib/auth";

const body = z.object({ username: z.string().trim().min(1).max(60), password: z.string().min(1).max(200) });
const WINDOW_MS = 15 * 60_000;
const MAX_FAILS = 8;

/** Username + password → session cookie. 8 wrong tries per username or IP in 15 minutes locks it out for the rest of the window. */
export async function POST(req: NextRequest) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter your username and password." }, { status: 400 });
  const username = parsed.data.username.toLowerCase();
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const keys = [`user:${username}`, `ip:${ip}`];
  const since = new Date(Date.now() - WINDOW_MS);
  const fails = await prisma.loginAttempt.groupBy({ by: ["key"], where: { key: { in: keys }, createdAt: { gte: since } }, _count: true });
  if (fails.some((f) => f._count >= MAX_FAILS)) return NextResponse.json({ error: "Too many tries. Wait 15 minutes and try again." }, { status: 429 });

  const user = await prisma.user.findFirst({ where: { username: { equals: username, mode: "insensitive" } } });
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? "scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  if (!user || !ok) {
    await prisma.loginAttempt.createMany({ data: keys.map((key) => ({ key })) });
    // Keep the table small.
    await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 3_600_000) } } });
    return NextResponse.json({ error: "Wrong username or password." }, { status: 401 });
  }
  await prisma.loginAttempt.deleteMany({ where: { key: `user:${username}` } });
  const res = NextResponse.json({ ok: true, name: user.name });
  res.cookies.set(SESSION_COOKIE, await signSession(user.id, user.sessionVersion), cookieOptions());
  return res;
}
