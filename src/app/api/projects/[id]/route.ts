import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const VALID_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const VALID_STATUSES = ["active", "completed", "on_hold", "archived"] as const;

const projectPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  specs: z.string().trim().max(10000).optional(),
  notes: z.string().trim().max(10000).nullable().optional(),
  priority: z.enum(VALID_PRIORITIES).optional(),
  status: z.enum(VALID_STATUSES).optional(),
  deadline: z.string().datetime({ offset: true }).nullable().optional(),
  completedAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        tasks: {
          orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    if (!project || project.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(project);
  } catch (error) {
    reportError({ context: "project GET", error, userId: session.user.id });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const rawBody = await req.json();
    const parsed = projectPatchSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const body = parsed.data;

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing || existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await prisma.project.update({
      where: { id },
      data: {
        title: body.title ?? undefined,
        description: body.description ?? undefined,
        specs: body.specs ?? undefined,
        notes: body.notes !== undefined ? body.notes : undefined,
        priority: body.priority ?? undefined,
        status: body.status ?? undefined,
        deadline: body.deadline ? new Date(body.deadline) : undefined,
        completedAt:
          body.status === "completed"
            ? (body.completedAt ? new Date(body.completedAt) : new Date())
            : body.completedAt === null
            ? null
            : undefined,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    reportError({ context: "project PATCH", error, userId: session.user.id });
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
    const { id } = await params;

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing || existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.project.delete({ where: { id } });

    return NextResponse.json({ message: "deleted" });
  } catch (error) {
    reportError({ context: "project DELETE", error, userId: session.user.id });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
