import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/owner";
import { readNews } from "@/lib/news";

/** Last night's top 50 (refreshed at 11:30pm by the worker). */
export async function GET() {
  await getOwnerSession();
  return NextResponse.json((await readNews()) ?? { at: null, topics: [], items: [], errors: [] });
}
