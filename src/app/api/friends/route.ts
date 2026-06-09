import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [
        { senderId: userId, status: "accepted" },
        { receiverId: userId, status: "accepted" },
      ],
    },
    include: {
      sender: {
        select: { id: true, name: true, email: true },
      },
      receiver: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  const friends = friendships.map((f) =>
    f.senderId === userId ? f.receiver : f.sender
  );

  return NextResponse.json(friends);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email } = await request.json();
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const userId = session.user.id;

  const targetUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: { id: true },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (targetUser.id === userId) {
    return NextResponse.json({ error: "Cannot add yourself" }, { status: 400 });
  }

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { senderId: userId, receiverId: targetUser.id },
        { senderId: targetUser.id, receiverId: userId },
      ],
    },
  });

  if (existing) {
    if (existing.status === "accepted") {
      return NextResponse.json({ error: "Already friends" }, { status: 400 });
    }
    if (existing.status === "pending" && existing.senderId === userId) {
      return NextResponse.json({ error: "Request already sent" }, { status: 400 });
    }
    if (existing.status === "pending" && existing.receiverId === userId) {
      const updated = await prisma.friendship.update({
        where: { id: existing.id },
        data: { status: "accepted" },
      });
      return NextResponse.json(updated);
    }
  }

  const friendship = await prisma.friendship.create({
    data: {
      senderId: userId,
      receiverId: targetUser.id,
      status: "accepted",
    },
  });

  return NextResponse.json(friendship);
}
