import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/owner";
import prisma from "@/lib/prisma";
import { AREAS, PRIORITIES } from "@/lib/areas";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const patchSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  area: z.enum(AREAS).optional(),
  priority: z.enum(PRIORITIES).optional(),
  status: z.enum(["open", "done"]).optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().trim().max(10000).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getOwnerSession();
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });

  const { dueAt, status, ...rest } = parsed.data;
  const result = await prisma.todo.updateMany({
    where: { id, userId: session.user.id },
    data: {
      ...rest,
      ...(dueAt !== undefined ? { dueAt: dueAt ? new Date(dueAt) : null } : {}),
      ...(status ? { status, completedAt: status === "done" ? new Date() : null } : {}),
    },
  });
  if (!result.count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (status === "done") {
    await prisma.reminder.updateMany({ where: { todoId: id, status: "pending" }, data: { status: "done" } });
  }
  return NextResponse.json(await prisma.todo.findUnique({ where: { id } }));
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await getOwnerSession();
  const { id } = await params;
  await prisma.todo.deleteMany({ where: { id, userId: session.user.id } });
  return NextResponse.json({ ok: true });
}
