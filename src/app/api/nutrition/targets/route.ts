import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/owner";
import prisma from "@/lib/prisma";
import { targetsSchema } from "@/lib/nutrition-schema";

export async function PUT(req: NextRequest) {
  const { user } = await getOwnerSession();
  const parsed = targetsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid targets" }, { status: 400 });
  await prisma.user.update({ where: { id: user.id }, data: { nutritionTargets: parsed.data } });
  return NextResponse.json(parsed.data);
}
