import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/owner";
import { readNews, refreshNews } from "@/lib/news";

/** Last night's top 50 (refreshed at 11:30pm by the worker). */
export async function GET() {
  await getOwnerSession();
  return NextResponse.json((await readNews()) ?? { at: null, topics: [], items: [], errors: [] });
}

/** "refresh" on the news terminal: fetch and rank now instead of waiting for tonight. */
export async function POST() {
  const session = await getOwnerSession();
  return NextResponse.json(await refreshNews(session.user.id));
}

export const maxDuration = 120;
