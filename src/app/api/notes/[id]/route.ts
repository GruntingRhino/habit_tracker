import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { strictObject } from "@/lib/validation";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const VALID_NOTE_TYPES = ["note", "todo"] as const;
const VALID_NOTE_STATUSES = ["active", "completed"] as const;

const notePatchSchema = strictObject({
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().trim().max(5000).nullable().optional(),
  type: z.enum(VALID_NOTE_TYPES).optional(),
  status: z.enum(VALID_NOTE_STATUSES).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "No changes provided",
});

async function getOwnedNote(noteId: string, userId: string) {
  const note = await prisma.note.findUnique({
    where: { id: noteId },
    select: { id: true, userId: true },
  });

  return note?.userId === userId ? note : null;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    if (!await getOwnedNote(id, session.user.id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const rawBody = await req.json();
    const parsed = notePatchSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const note = await prisma.note.update({
      where: { id },
      data: {
        title: parsed.data.title,
        content: parsed.data.content === "" ? null : parsed.data.content,
        type: parsed.data.type,
        status: parsed.data.status,
      },
    });

    return NextResponse.json(note);
  } catch (error) {
    reportError({ context: "notes PATCH", error, userId: session.user.id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    if (!await getOwnedNote(id, session.user.id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.note.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    reportError({ context: "notes DELETE", error, userId: session.user.id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}