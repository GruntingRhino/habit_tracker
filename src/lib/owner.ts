import { cookies } from "next/headers";
import { unauthorized } from "next/navigation";
import prisma from "@/lib/prisma";
import { getOwner } from "@/lib/users";

export { activeUsers, getOwner } from "@/lib/users";
import { readSession, SESSION_COOKIE } from "@/lib/auth";
import { enterContext, type Pronouns } from "@/lib/request-context";

export interface OwnerSession {
  user: { id: string; email: string; name: string | null; username: string | null; isAdmin: boolean };
}

/**
 * The logged-in person for this request (from the signed session cookie). Also sets the request
 * context, so model prompts and the queue know who it's for. Throws AuthError when not logged in
 * (the proxy already turns those requests away; this is the second lock).
 */
export async function getOwnerSession(): Promise<OwnerSession> {
  const jar = await cookies();
  const payload = await readSession(jar.get(SESSION_COOKIE)?.value);
  let user = payload ? await prisma.user.findUnique({ where: { id: payload.u } }) : null;
  if (user && payload && user.sessionVersion !== payload.v) user = null;
  // Local development without a login: act as the owner.
  if (!user && process.env.ALLOW_LOCAL_DEV === "1" && process.env.VERCEL !== "1") user = await getOwner();
  if (!user) unauthorized();
  enterContext({ userId: user.id, name: user.name ?? "there", pronouns: (user.pronouns as Pronouns) ?? "they" });
  return { user: { id: user.id, email: user.email, name: user.name, username: user.username, isAdmin: user.isAdmin } };
}
