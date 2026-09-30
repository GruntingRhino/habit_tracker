import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getOwnerSession } from "@/lib/owner";
import { authUrl, googleConfigured } from "@/lib/google";

/** Start "Connect Google Calendar": off to Google's consent screen. */
export async function GET() {
  await getOwnerSession();
  if (!googleConfigured()) return NextResponse.json({ error: "Google isn't configured on the server" }, { status: 500 });
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authUrl(state));
  res.cookies.set("g_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/google" });
  return res;
}
