import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getCoachChatState, sendCoachMessage } from "@/lib/coach";
import { reportError } from "@/lib/monitoring";
import {
  buildScopedRateLimitKeys,
  extractClientIp,
  isRateLimited,
} from "@/lib/rate-limit";

const coachChatPostSchema = z.object({
  message: z.string().trim().min(1).max(4000).optional(),
  messages: z
    .array(
      z.object({
        role: z.string(),
        content: z.string().max(4000),
      })
    )
    .max(100)
    .optional(),
});

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
    reportError({ context: "coach chat GET", error, userId: session.user.id });
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
    const limit = await isRateLimited(
      buildScopedRateLimitKeys(
        "coach-chat",
        session.user.id,
        extractClientIp(req.headers)
      )
    );
    if (limit) {
      return NextResponse.json(
        { error: "Too many coach messages. Try again shortly." },
        { status: 429 }
      );
    }

    const rawBody = await req.json();
    const parsed = coachChatPostSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const message =
      parsed.data.message?.trim() ||
      getLastUserMessage(parsed.data.messages)?.trim();
    if (!message) {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    const payload = await sendCoachMessage(session.user.id, message);
    return NextResponse.json(payload);
  } catch (error) {
    reportError({ context: "coach chat POST", error, userId: session.user.id });
    return NextResponse.json(
      { error: "Failed to generate coach response" },
      { status: 500 }
    );
  }
}
