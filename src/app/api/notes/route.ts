import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";

const VALID_NOTE_TYPES = ["note", "todo"] as const;
const VALID_NOTE_STATUSES = ["active", "completed"] as const;

const notePostSchema = z.object({
  title: z.string().trim().min(1, "title is required").max(200),
  content: z.string().trim().max(5000).optional(),
  type: z.enum(VALID_NOTE_TYPES).default("note"),
  status: z.enum(VALID_NOTE_STATUSES).default("active"),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const notes = await prisma.note.findMany({
      where: { userId: session.user.id },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(notes);
  } catch (error) {
    reportError({ context: "notes GET", error, userId: session.user.id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rawBody = await req.json();
    const parsed = notePostSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const note = await prisma.note.create({
      data: {
        userId: session.user.id,
        title: parsed.data.title,
        content: parsed.data.content,
        type: parsed.data.type,
        status: parsed.data.status,
      },
    });

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    reportError({ context: "notes POST", error, userId: session.user.id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
