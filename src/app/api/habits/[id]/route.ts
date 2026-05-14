import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const VALID_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const VALID_CATEGORIES = [
  "general", "physical", "mental", "health",
  "productivity", "financial", "social", "spiritual",
] as const;

const habitPatchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).optional(),
  category: z.enum(VALID_CATEGORIES).optional(),
  targetDays: z.array(z.enum(VALID_DAYS)).min(1).max(7).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const rawBody = await req.json();
    const parsed = habitPatchSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const body = parsed.data;

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
    reportError({ context: "habits PATCH", error, userId: session.user.id });
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
    reportError({ context: "habits DELETE", error, userId: session.user.id });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
