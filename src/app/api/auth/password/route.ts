import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getOwnerSession } from "@/lib/owner";
import { cookieOptions, hashPassword, passwordProblem, SESSION_COOKIE, signSession, verifyPassword } from "@/lib/auth";

const body = z.object({ current: z.string().min(1).max(200), next: z.string().min(1).max(200) });

/** Change your password. Every other device is logged out; this one gets a fresh cookie. */
export async function POST(req: NextRequest) {
  const session = await getOwnerSession();
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Fill in both passwords." }, { status: 400 });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  if (!(await verifyPassword(parsed.data.current, user.passwordHash))) return NextResponse.json({ error: "Your current password is wrong." }, { status: 400 });
  const problem = passwordProblem(parsed.data.next);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const updated = await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.next), sessionVersion: { increment: 1 } } });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await signSession(updated.id, updated.sessionVersion), cookieOptions());
  return res;
}
