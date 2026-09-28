import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Single-owner gate. The app listens on 127.0.0.1 only and is reached through
 * `tailscale serve`, which stamps every request with the caller's verified
 * Tailscale login. Anything without the owner's login is rejected.
 * Set ALLOW_LOCAL_DEV=1 to bypass during `next dev` on your own machine.
 */
export function proxy(request: NextRequest) {
  if (process.env.ALLOW_LOCAL_DEV === "1") return NextResponse.next();

  const owner = process.env.OWNER_LOGIN?.toLowerCase();
  const login = request.headers.get("tailscale-user-login")?.toLowerCase();

  if (owner && login === owner) return NextResponse.next();

  return new NextResponse("Forbidden", { status: 403 });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
