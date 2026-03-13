import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";

export async function POST() {
  try {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
      return NextResponse.json(
        { message: "ADMIN_EMAIL and ADMIN_PASSWORD env vars are required" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      return NextResponse.json({ message: "already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: "Admin",
      },
    });

    return NextResponse.json({ message: "seeded" }, { status: 201 });
  } catch (error) {
    console.error("[seed] error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
