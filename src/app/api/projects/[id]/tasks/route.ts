import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: projectId } = await params;

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const tasks = await prisma.projectTask.findMany({
      where: { projectId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json(tasks);
  } catch (error) {
    console.error("[tasks GET] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: projectId } = await params;
    const body = await req.json();

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!body.title || typeof body.title !== "string") {
      return NextResponse.json(
        { error: "title is required" },
        { status: 400 }
      );
    }

    // Determine order: put at end
    const lastTask = await prisma.projectTask.findFirst({
      where: { projectId },
      orderBy: { order: "desc" },
    });
    const nextOrder = (lastTask?.order ?? -1) + 1;

    const task = await prisma.projectTask.create({
      data: {
        projectId,
        parentTaskId: body.parentTaskId ?? undefined,
        title: body.title.trim(),
        description: body.description ?? undefined,
        status: body.status ?? "todo",
        order: body.order ?? nextOrder,
        priority: body.priority ?? "medium",
        estimatedMinutes: body.estimatedMinutes ?? undefined,
        dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error("[tasks POST] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  // Bulk update task orders (for drag-and-drop reorder)
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: projectId } = await params;
    const body = await req.json();

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Expect body.tasks: Array<{ id: string, order: number }>
    if (!Array.isArray(body.tasks)) {
      return NextResponse.json(
        { error: "tasks array is required" },
        { status: 400 }
      );
    }

    const updates = body.tasks as { id: string; order: number }[];

    await prisma.$transaction(
      updates.map((t) =>
        prisma.projectTask.update({
          where: { id: t.id },
          data: { order: t.order },
        })
      )
    );

    return NextResponse.json({ message: "reordered", count: updates.length });
  } catch (error) {
    console.error("[tasks PATCH bulk] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
