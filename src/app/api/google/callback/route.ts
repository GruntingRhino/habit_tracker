import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/owner";
import { connect, syncGoogle } from "@/lib/google";
import { reportError } from "@/lib/monitoring";

/** Google sends him back here after he approves access. */
export async function GET(req: NextRequest) {
  const { user } = await getOwnerSession();
  if (!user.integrations) return NextResponse.json({ error: "Not available on this account" }, { status: 403 });

  const url = req.nextUrl;
  const back = (q: string) => NextResponse.redirect(new URL(`/schedule?google=${q}`, url.origin));
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error")) return back("denied");
  if (!code || !state || state !== req.cookies.get("g_state")?.value) return back("error");
  try {
    await connect(user.id, code);
    await syncGoogle(user.id);
    const res = back("connected");
    res.cookies.delete("g_state");
    return res;
  } catch (error) {
    reportError({ context: "google callback", error, userId: user.id });
    return back("error");
  }
}
