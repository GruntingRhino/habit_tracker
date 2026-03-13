import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.habit.findUnique({ where: { id } });

    if (!existing || existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await prisma.habit.update({
      where: { id },
      data: {
        name: body.name ?? undefined,
        description: body.description ?? undefined,
        category: body.category ?? undefined,
        targetDays: body.targetDays ?? undefined,
        color: body.color ?? undefined,
        isActive: body.isActive ?? undefined,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[habits PATCH] error:", error);
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

    const existing = await prisma.habit.findUnique({ where: { id } });

    if (!existing || existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Soft delete: set isActive = false
    const updated = await prisma.habit.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[habits DELETE] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
