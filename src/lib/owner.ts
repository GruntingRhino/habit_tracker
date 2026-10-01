import { cookies } from "next/headers";
import { unauthorized } from "next/navigation";
import prisma from "@/lib/prisma";
import { getOwner } from "@/lib/users";

export { activeUsers, getOwner } from "@/lib/users";
import { readSession, SESSION_COOKIE } from "@/lib/auth";
import { cache } from "react";
import { firstName, setContextResolver, type Pronouns } from "@/lib/request-context";

export interface OwnerSession {
  user: { id: string; email: string; name: string | null; username: string | null; isAdmin: boolean };
}

/** The logged-in person's row, or null (once per request: React's cache is request-scoped). */
const sessionUser = cache(async () => {
  const jar = await cookies().catch(() => null);
  const payload = jar ? await readSession(jar.get(SESSION_COOKIE)?.value) : null;
  let user = payload ? await prisma.user.findUnique({ where: { id: payload.u } }) : null;
  if (user && payload && user.sessionVersion !== payload.v) user = null;
  // Local development without a login: act as the owner.
  if (!user && process.env.ALLOW_LOCAL_DEV === "1" && process.env.VERCEL !== "1") user = await getOwner();
  return user;
});

// Anything that needs "the current person" during a web request (per-person settings, the model
// client's name/pronouns and queue header) finds them from the session.
setContextResolver(async () => {
  const user = await sessionUser();
  return user ? { userId: user.id, name: firstName(user.name), pronouns: (user.pronouns as Pronouns) ?? "they" } : null;
});

/**
 * The logged-in person for this request (from the signed session cookie). Responds 401 when not
 * logged in (the proxy already turns those requests away; this is the second lock).
 */
export async function getOwnerSession(): Promise<OwnerSession> {
  const user = await sessionUser();
  if (!user) unauthorized();
  return { user: { id: user.id, email: user.email, name: user.name, username: user.username, isAdmin: user.isAdmin } };
}
