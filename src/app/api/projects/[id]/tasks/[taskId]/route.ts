import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";

interface RouteParams {
  params: Promise<{ id: string; taskId: string }>;
}

const VALID_STATUSES = ["todo", "in_progress", "completed", "cancelled"] as const;
const VALID_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

const taskPatchSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(5000).optional(),
  status: z.enum(VALID_STATUSES).optional(),
  order: z.number().int().min(0).optional(),
  priority: z.enum(VALID_PRIORITIES).optional(),
  estimatedMinutes: z.number().int().min(1).max(10000).nullable().optional(),
  actualMinutes: z.number().int().min(0).max(10000).nullable().optional(),
  dueDate: z.string().datetime({ offset: true }).nullable().optional(),
  startedAt: z.string().datetime({ offset: true }).nullable().optional(),
  completedAt: z.string().datetime({ offset: true }).nullable().optional(),
  parentTaskId: z.string().cuid().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: projectId, taskId } = await params;
    const rawBody = await req.json();
    const parsed = taskPatchSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const body = parsed.data;

    // Verify project ownership
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const existing = await prisma.projectTask.findUnique({ where: { id: taskId } });
    if (!existing || existing.projectId !== projectId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Auto-set timestamps based on status transitions
    let startedAt = existing.startedAt;
    let completedAt = existing.completedAt;

    if (body.status === "in_progress" && !startedAt) {
      startedAt = new Date();
    }
    if (body.status === "completed" && !completedAt) {
      completedAt = new Date();
    }
    if (body.status !== "completed") {
      completedAt = body.completedAt !== undefined
        ? (body.completedAt ? new Date(body.completedAt) : null)
        : completedAt;
    }

    const updated = await prisma.projectTask.update({
      where: { id: taskId },
      data: {
        title: body.title ?? undefined,
        description: body.description ?? undefined,
        status: body.status ?? undefined,
        order: body.order ?? undefined,
        priority: body.priority ?? undefined,
        estimatedMinutes: body.estimatedMinutes ?? undefined,
        actualMinutes: body.actualMinutes ?? undefined,
        dueDate: body.dueDate !== undefined
          ? (body.dueDate ? new Date(body.dueDate) : null)
          : undefined,
        startedAt:
          body.startedAt !== undefined
            ? body.startedAt
              ? new Date(body.startedAt)
              : null
            : startedAt,
        completedAt:
          body.status === "completed"
            ? (completedAt ?? new Date())
            : body.completedAt !== undefined
            ? body.completedAt
              ? new Date(body.completedAt)
              : null
            : completedAt,
        parentTaskId: body.parentTaskId ?? undefined,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    reportError({ context: "task PATCH", error, userId: session.user.id });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: projectId, taskId } = await params;

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const existing = await prisma.projectTask.findUnique({ where: { id: taskId } });
    if (!existing || existing.projectId !== projectId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.projectTask.delete({ where: { id: taskId } });

    return NextResponse.json({ message: "deleted" });
  } catch (error) {
    reportError({ context: "task DELETE", error, userId: session.user.id });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
