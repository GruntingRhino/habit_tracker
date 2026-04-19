import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCoachChatState, sendCoachMessage } from "@/lib/coach";

function getLastUserMessage(value: unknown): string | null {
  if (!Array.isArray(value)) return null;

  for (let index = value.length - 1; index >= 0; index -= 1) {
    const item = value[index];
    if (
      item &&
      typeof item === "object" &&
      "role" in item &&
      "content" in item &&
      item.role === "user" &&
      typeof item.content === "string"
    ) {
      return item.content;
    }
  }

  return null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await getCoachChatState(session.user.id);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("[coach chat GET] error:", error);
    return NextResponse.json(
      { error: "Failed to load coach history" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json() as {
      message?: string;
      messages?: Array<{ role: string; content: string }>;
    };

    const message = body.message?.trim() || getLastUserMessage(body.messages)?.trim();
    if (!message) {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    const payload = await sendCoachMessage(session.user.id, message);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("[coach chat POST] error:", error);
    return NextResponse.json(
      { error: "Failed to generate coach response" },
      { status: 500 }
    );
  }
}
