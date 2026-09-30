import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/owner";
import { convertToProject } from "@/lib/ai/itemai";

/** "Make it a project": the to-do becomes a project with the same title, description and due date. */
export async function POST(req: NextRequest) {
  const { user } = await getOwnerSession();
  const body = (await req.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const { project } = await convertToProject(user.id, body.id);
    return NextResponse.json({ id: project.id });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
