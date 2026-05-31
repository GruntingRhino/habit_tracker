import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  buildRateLimitResponse,
  buildScopedRateLimitKeys,
  checkRateLimit,
  extractClientIp,
  resetRateLimit,
} from "@/lib/rate-limit";
import { reportError } from "@/lib/monitoring";

const registerSchema = z
  .strictObject({
    name: z.string().trim().min(2, "Username must be at least 2 characters.").max(120, "Username must be 120 characters or fewer."),
    email: z.email("Enter a valid email address.").transform((value) => value.toLowerCase().trim()),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .max(200, "Password must be 200 characters or fewer."),
    confirmPassword: z
      .string()
      .min(8, "Confirm password must be at least 8 characters.")
      .max(200, "Confirm password must be 200 characters or fewer."),
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
        return buildRateLimitResponse(
          "Too many sign up attempts. Try again later.",
          limit.retryAfterMs
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

    const hashedPassword = await bcrypt.hash(parsedBody.data.password, 12);
    const user = await prisma.user.create({
      data: {
        name: parsedBody.data.name,
        email: parsedBody.data.email,
        password: hashedPassword,
      },
      select: {
        id: true,
        name: true,
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
