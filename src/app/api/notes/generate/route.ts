import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { reportError } from "@/lib/monitoring";
import { isAIAvailable, chatWithCoach } from "@/lib/ollama";
import {
  buildScopedRateLimitKeys,
  extractClientIp,
  isRateLimited,
} from "@/lib/rate-limit";

export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const limit = await isRateLimited(
      buildScopedRateLimitKeys(
        "note-generate",
        session.user.id,
        extractClientIp(_req.headers)
      )
    );
    if (limit) {
      return NextResponse.json(
        { error: "Too many requests. Try again shortly." },
        { status: 429 }
      );
    }

    const { topic, type } = await _req.json();

    const aiUp = await isAIAvailable();
    if (!aiUp) {
      return NextResponse.json(
        { error: "AI not available" },
        { status: 503 }
      );
    }

    const prompt = `Help me write a ${type || "reflection"} note about ${topic || "my day"}. Keep it concise and insightful. Return just the text content.`;

    const messages = [{ role: "user" as const, content: prompt }];
    const response = await chatWithCoach(messages, {});

    return NextResponse.json({ content: response });
  } catch (error) {
    reportError({ context: "notes generate POST", error, userId: session.user.id });
    return NextResponse.json(
      { error: "Failed to generate note" },
      { status: 500 }
    );
  }
}
