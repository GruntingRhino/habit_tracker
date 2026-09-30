import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/owner";
import { deleteEvent, updateEvent } from "@/lib/calendar";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const schema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  start: z.string().datetime({ offset: true }).optional(),
  end: z.string().datetime({ offset: true }).optional(),
  allDay: z.boolean().optional(),
  attendees: z.array(z.string().email()).max(50).optional(),
  description: z.string().max(5000).nullable().optional(),
  location: z.string().max(300).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { user } = await getOwnerSession();
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  const { start, end, ...rest } = parsed.data;
  const r = await updateEvent(user.id, id, { ...rest, ...(start ? { start: new Date(start) } : {}), ...(end ? { end: new Date(end) } : {}) });
  return r ? NextResponse.json({ ...r.event, onGoogle: r.onGoogle }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { user } = await getOwnerSession();
  const { id } = await params;
  return (await deleteEvent(user.id, id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
