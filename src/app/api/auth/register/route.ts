import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  buildScopedRateLimitKeys,
  checkRateLimit,
  extractClientIp,
  resetRateLimit,
} from "@/lib/rate-limit";
import { reportError } from "@/lib/monitoring";
import { normalizeUsername, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH, USERNAME_PATTERN } from "@/lib/username";

const registerSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    username: z
      .string()
      .trim()
      .min(USERNAME_MIN_LENGTH)
      .max(USERNAME_MAX_LENGTH)
      .transform((value) => normalizeUsername(value))
      .refine((value) => USERNAME_PATTERN.test(value), {
        message: "Username must be 3-32 characters and use only letters, numbers, dots, underscores, or hyphens.",
      }),
    email: z.email().transform((value) => value.toLowerCase().trim()),
    password: z.string().min(12).max(200),
    confirmPassword: z.string().min(12).max(200),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export async function POST(req: NextRequest) {
  const ip = extractClientIp(req.headers);

  try {
    const rawBody = await req.json();
    const parsedBody = registerSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: parsedBody.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const rateLimitKeys = buildScopedRateLimitKeys(
      "register",
      parsedBody.data.email,
      ip
    );

    for (const rateLimitKey of rateLimitKeys) {
      const limit = await checkRateLimit(rateLimitKey);
      if (!limit.allowed) {
        return NextResponse.json(
          { error: "Too many sign up attempts. Try again later." },
          { status: 429 }
        );
      }
    }

    const existing = await prisma.user.findUnique({
      where: { email: parsedBody.data.email },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { error: "An account with that email already exists." },
        { status: 409 }
      );
    }

    const existingUsername = await prisma.user.findUnique({
      where: { username: parsedBody.data.username },
      select: { id: true },
    });

    if (existingUsername) {
      return NextResponse.json(
        { error: "That username is already taken." },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(parsedBody.data.password, 12);
    const user = await prisma.user.create({
      data: {
        name: parsedBody.data.name,
        username: parsedBody.data.username,
        email: parsedBody.data.email,
        password: hashedPassword,
      },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
      },
    });

    for (const rateLimitKey of rateLimitKeys) {
      await resetRateLimit(rateLimitKey);
    }

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    reportError({ context: "auth register POST", error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
