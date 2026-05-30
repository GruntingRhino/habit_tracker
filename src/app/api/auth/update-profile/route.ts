import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { markCoachContextDirty } from "@/lib/coach-context-cache";
import { reportError } from "@/lib/monitoring";
import { normalizeUsername, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH, USERNAME_PATTERN } from "@/lib/username";
import { trimmedString } from "@/lib/validation";

const updateProfileSchema = z.strictObject({
  name: trimmedString(120, 1),
  username: z
    .string()
    .trim()
    .min(USERNAME_MIN_LENGTH)
    .max(USERNAME_MAX_LENGTH)
    .transform((value) => normalizeUsername(value))
    .refine((value) => USERNAME_PATTERN.test(value), {
      message: "Username must be 3-32 characters and use only letters, numbers, dots, underscores, or hyphens.",
    }),
});

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rawBody = await req.json();
    const parsedBody = updateProfileSchema.safeParse(rawBody);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: parsedBody.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const conflictingUser = await prisma.user.findFirst({
      where: {
        username: parsedBody.data.username,
        id: { not: session.user.id },
      },
      select: { id: true },
    });

    if (conflictingUser) {
      return NextResponse.json(
        { error: "That username is already taken." },
        { status: 409 }
      );
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        name: parsedBody.data.name,
        username: parsedBody.data.username,
      },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
      },
    });
    await markCoachContextDirty(session.user.id);

    return NextResponse.json(user);
  } catch (error) {
    reportError({ context: "auth update-profile PATCH", error, userId: session.user.id });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
