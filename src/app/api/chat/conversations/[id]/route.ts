import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/owner";
import prisma from "@/lib/prisma";
import { strictObject } from "@/lib/validation";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const patchSchema = strictObject({
  saved: z.boolean().optional(),
  title: z.string().trim().min(1).max(80).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "No changes provided" });

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getOwnerSession();
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid changes" }, { status: 400 });
  const { count } = await prisma.conversation.updateMany({ where: { id, userId: session.user.id }, data: parsed.data });
  if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await getOwnerSession();
  const { id } = await params;
  const { count } = await prisma.conversation.deleteMany({ where: { id, userId: session.user.id } });
  if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
