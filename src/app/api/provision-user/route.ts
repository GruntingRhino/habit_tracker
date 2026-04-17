import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";

// One-time endpoint to provision the HarrisonGordenstein account.
// Protected by requiring ADMIN_EMAIL env var to be set.
export async function POST(req: NextRequest) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    return NextResponse.json({ error: "Not configured" }, { status: 403 });
  }

  // Optional: require a secret header
  const secret = req.headers.get("x-provision-secret");
  if (secret && secret !== adminEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const harrisonEmail = "harrisongordenstein@habit.local";
  const harrisonName = "HarrisonGordenstein";

  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email: harrisonEmail }, { name: { equals: harrisonName, mode: "insensitive" } }],
    },
  });

  if (existing) {
    return NextResponse.json({ message: "User already exists", id: existing.id });
  }

  const hashedPassword = await bcrypt.hash("12345", 12);
  const user = await prisma.user.create({
    data: {
      email: harrisonEmail,
      name: harrisonName,
      password: hashedPassword,
    },
  });

  return NextResponse.json({ message: "User created", id: user.id }, { status: 201 });
}
