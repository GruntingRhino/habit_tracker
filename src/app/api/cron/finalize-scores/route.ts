import { NextResponse } from "next/server";
import { finalizeYesterdayScores } from "@/lib/category-score";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await finalizeYesterdayScores();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to finalize scores:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
