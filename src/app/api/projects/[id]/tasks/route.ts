import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const VALID_STATUSES = ["todo", "in_progress", "completed", "cancelled"] as const;
const VALID_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

const taskPostSchema = z.object({
  title: z.string().trim().min(1, "title is required").max(300),
  description: z.string().trim().max(5000).optional(),
  parentTaskId: z.string().cuid().optional(),
  status: z.enum(VALID_STATUSES).default("todo"),
  priority: z.enum(VALID_PRIORITIES).default("medium"),
  order: z.number().int().min(0).optional(),
  estimatedMinutes: z.number().int().min(1).max(10000).optional(),
  dueDate: z.string().datetime({ offset: true }).optional(),
});

const taskBulkCreateSchema = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(300),
        description: z.string().trim().max(5000).optional(),
        priority: z.enum(VALID_PRIORITIES).optional(),
        estimatedMinutes: z.number().int().min(1).max(10000).optional(),
      })
    )
    .min(1)
    .max(100),
});

const taskBulkReorderSchema = z.object({
  tasks: z
    .array(z.object({ id: z.string().cuid(), order: z.number().int().min(0) }))
    .min(1)
    .max(200),
});

async function getOwnedProject(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  return project?.userId === userId ? project : null;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: projectId } = await params;
    if (!await getOwnedProject(projectId, session.user.id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const tasks = await prisma.projectTask.findMany({
      where: { projectId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json(tasks);
  } catch (error) {
    reportError({ context: "tasks GET", error, userId: session.user.id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: projectId } = await params;
    if (!await getOwnedProject(projectId, session.user.id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const rawBody = await req.json();
    const parsed = taskPostSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const lastTask = await prisma.projectTask.findFirst({
      where: { projectId },
      orderBy: { order: "desc" },
    });

    const task = await prisma.projectTask.create({
      data: {
        projectId,
        parentTaskId: parsed.data.parentTaskId,
        title: parsed.data.title,
        description: parsed.data.description,
        status: parsed.data.status,
        priority: parsed.data.priority,
        order: parsed.data.order ?? (lastTask?.order ?? -1) + 1,
        estimatedMinutes: parsed.data.estimatedMinutes,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
      },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    reportError({ context: "tasks POST", error, userId: session.user.id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: projectId } = await params;
    if (!await getOwnedProject(projectId, session.user.id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const rawBody = await req.json();
    const parsed = taskBulkCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const lastTask = await prisma.projectTask.findFirst({
      where: { projectId },
      orderBy: { order: "desc" },
    });
    const orderOffset = (lastTask?.order ?? -1) + 1;

    const created = await prisma.$transaction(
      parsed.data.tasks.map((t, idx) =>
        prisma.projectTask.create({
          data: {
            projectId,
            title: t.title,
            description: t.description,
            priority: t.priority ?? "medium",
            estimatedMinutes: t.estimatedMinutes,
            status: "todo",
            order: orderOffset + idx,
          },
        })
      )
    );

    return NextResponse.json({ tasks: created, count: created.length }, { status: 201 });
  } catch (error) {
    reportError({ context: "tasks PUT bulk-create", error, userId: session.user.id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: projectId } = await params;
    if (!await getOwnedProject(projectId, session.user.id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const rawBody = await req.json();
    const parsed = taskBulkReorderSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const updates = parsed.data.tasks;
    const existingTasks = await prisma.projectTask.findMany({
      where: { id: { in: updates.map((t) => t.id) } },
      select: { id: true, projectId: true },
    });

    if (
      existingTasks.length !== updates.length ||
      existingTasks.some((t) => t.projectId !== projectId)
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.$transaction(
      updates.map((t) =>
        prisma.projectTask.update({ where: { id: t.id }, data: { order: t.order } })
      )
    );

    return NextResponse.json({ message: "reordered", count: updates.length });
  } catch (error) {
    reportError({ context: "tasks PATCH bulk-reorder", error, userId: session.user.id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
