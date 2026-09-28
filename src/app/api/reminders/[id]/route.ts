import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/owner";
import prisma from "@/lib/prisma";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await getOwnerSession();
  const { id } = await params;
  await prisma.reminder.updateMany({ where: { id, userId: user.id }, data: { status: "cancelled" } });
  return NextResponse.json({ ok: true });
}
