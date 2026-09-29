import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { touchBrain } from "@/lib/brain/touch";

/**
 * Single-owner gate.
 *
 * On Vercel, access is enforced before requests reach the app by Deployment
 * Protection (Vercel Authentication, scope "All Deployments"): only members of the
 * owner's Vercel account get through. Keep that setting on — the app has no login.
 *
 * Off Vercel (a local production build, e2e runs), the old Tailscale gate applies:
 * requests must carry `Tailscale-User-Login: $OWNER_LOGIN`.
 * Set ALLOW_LOCAL_DEV=1 to bypass during `next dev` on your own machine.
 */
export function proxy(request: NextRequest, event: NextFetchEvent) {
  const allowed =
    process.env.VERCEL === "1" ||
    process.env.ALLOW_LOCAL_DEV === "1" ||
    (!!process.env.OWNER_LOGIN && request.headers.get("tailscale-user-login")?.toLowerCase() === process.env.OWNER_LOGIN.toLowerCase());
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });

  // Any write may change his scores: the brain re-grades once he's been quiet for 10 s.
  if (request.method !== "GET" && request.method !== "HEAD" && request.nextUrl.pathname.startsWith("/api/")) {
    event.waitUntil(touchBrain());
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
