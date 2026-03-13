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
    console.error("[project GET] error:", error);
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
    const body = await req.json();

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
    console.error("[project PATCH] error:", error);
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
    console.error("[project DELETE] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
