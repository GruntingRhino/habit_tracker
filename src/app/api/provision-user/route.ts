import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { isProduction, secureCompare } from "@/lib/runtime-config";
import { normalizeUsername, sanitizeUsernameCandidate, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH, USERNAME_PATTERN } from "@/lib/username";

const provisionUserSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).max(120),
  username: z
    .string()
    .trim()
    .min(USERNAME_MIN_LENGTH)
    .max(USERNAME_MAX_LENGTH)
    .transform((value) => normalizeUsername(value))
    .refine((value) => USERNAME_PATTERN.test(value), {
      message: "Invalid username",
    })
    .optional(),
  password: z.string().min(12).max(200),
});

export async function POST(req: NextRequest) {
  if (isProduction()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const provisioningSecret = process.env.PROVISIONING_SECRET;
  if (!provisioningSecret) {
    return NextResponse.json({ error: "Not configured" }, { status: 403 });
  }

  const secret = req.headers.get("x-provision-secret");
  if (!secureCompare(provisioningSecret, secret)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rawBody = await req.json();
  const parsedBody = provisionUserSchema.safeParse(rawBody);

  if (!parsedBody.success) {
    return NextResponse.json(
      { error: parsedBody.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    );
  }

  const { email, name, password } = parsedBody.data;
  const username = parsedBody.data.username ?? sanitizeUsernameCandidate(name);

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { email },
        { username },
        { name: { equals: name, mode: "insensitive" } },
      ],
    },
  });

  if (existing) {
    return NextResponse.json({ message: "User already exists", id: existing.id });
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      username,
      name,
      password: hashedPassword,
    },
  });

  return NextResponse.json({ message: "User created", id: user.id }, { status: 201 });
}
