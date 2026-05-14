import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(120),
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

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: { name: parsedBody.data.name },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error("[auth update-profile PATCH] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
