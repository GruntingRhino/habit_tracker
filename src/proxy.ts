import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { touchBrain } from "@/lib/brain/touch";
import { readSession, SESSION_COOKIE } from "@/lib/auth";

/**
 * Login gate. Every page and API route needs a valid session cookie (signed, unexpired), except
 * the login page itself, icons, and the Vercel cron (which checks CRON_SECRET on its own).
 * Route handlers check again against the database (getOwnerSession), so a stolen-then-revoked
 * cookie (password changed) stops working there too.
 *
 * Local `next dev` on your own machine: ALLOW_LOCAL_DEV=1 lets requests through as the owner.
 */
const PUBLIC = [/^\/login$/, /^\/api\/auth\/login$/, /^\/api\/cron\//, /^\/manifest\.webmanifest$/, /^\/(icon|apple-icon)(\.\w+)?$/, /^\/favicon\.ico$/, /^\/robots\.txt$/];

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();

  const session = await readSession(request.cookies.get(SESSION_COOKIE)?.value);
  const devBypass = process.env.ALLOW_LOCAL_DEV === "1" && process.env.VERCEL !== "1";
  if (!session && !devBypass) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  // Any write may change that person's scores: their brain re-grades once they've been quiet for 10 s.
  if (session && request.method !== "GET" && request.method !== "HEAD" && pathname.startsWith("/api/")) {
    event.waitUntil(touchBrain(session.u));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
