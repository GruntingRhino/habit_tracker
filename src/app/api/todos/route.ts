import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/owner";
import prisma from "@/lib/prisma";
import { AREAS, PRIORITIES } from "@/lib/areas";

const createSchema = z.object({
  title: z.string().trim().min(1).max(300),
  area: z.enum(AREAS).default("general"),
  priority: z.enum(PRIORITIES).default("medium"),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function GET(req: NextRequest) {
  const session = await getOwnerSession();
  const status = req.nextUrl.searchParams.get("status") === "done" ? "done" : "open";
  const todos = await prisma.todo.findMany({
    where: { userId: session.user.id, status },
    include: { reminders: { where: { status: "pending" }, select: { id: true, fireAt: true } } },
    orderBy: status === "done" ? { completedAt: "desc" } : { createdAt: "desc" },
    take: status === "done" ? 100 : 500,
  });
  return NextResponse.json(todos);
}

export async function POST(req: NextRequest) {
  const session = await getOwnerSession();
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
  const { dueAt, ...rest } = parsed.data;
  const todo = await prisma.todo.create({
    data: { ...rest, userId: session.user.id, dueAt: dueAt ? new Date(dueAt) : null },
  });
  return NextResponse.json(todo, { status: 201 });
}
