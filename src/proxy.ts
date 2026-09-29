import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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
export function proxy(request: NextRequest) {
  if (process.env.VERCEL === "1") return NextResponse.next();
  if (process.env.ALLOW_LOCAL_DEV === "1") return NextResponse.next();

  const owner = process.env.OWNER_LOGIN?.toLowerCase();
  const login = request.headers.get("tailscale-user-login")?.toLowerCase();

  if (owner && login === owner) return NextResponse.next();

  return new NextResponse("Forbidden", { status: 403 });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
