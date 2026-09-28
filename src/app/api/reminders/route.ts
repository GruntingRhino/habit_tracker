import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/owner";
import prisma from "@/lib/prisma";

export async function GET() {
  const { user } = await getOwnerSession();
  const reminders = await prisma.reminder.findMany({
    where: { userId: user.id, status: "pending" },
    orderBy: { fireAt: "asc" },
    take: 100,
  });
  return NextResponse.json(reminders);
}
