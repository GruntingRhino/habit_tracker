import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { reportError } from "@/lib/monitoring";
import { isGroqAvailable, chatWithCoach } from "@/lib/ollama";
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

  // Fast-path: no AI configured → 503 without waiting for Ollama probe
  if (!isGroqAvailable()) {
    return NextResponse.json(
      { error: "AI not available. Add a GROQ_API_KEY to enable meal suggestions." },
      { status: 503 }
    );
  }

  try {
    const limit = await isRateLimited(
      buildScopedRateLimitKeys(
        "meal-generate",
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

    let category = "lunch";
    let goal = "eat healthy";
    try {
      const body = await _req.json();
      if (body.category) category = body.category;
      if (body.goal) goal = body.goal;
    } catch {
      // no body — use defaults
    }

    const prompt = `Suggest 3 healthy ${category} meals for someone trying to ${goal}. For each meal, provide: name, approximate calories, and a brief recipe or description. Return as JSON array with fields: name, calories, recipe.`;
    const messages = [{ role: "user" as const, content: prompt }];

    let response = "";
    try {
      response = await chatWithCoach(messages, {});
    } catch {
      // AI error — fall through to default meals
    }

    let meals: { name: string; calories: number; recipe: string }[] | null = null;
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      meals = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      meals = null;
    }

    if (!meals || meals.length === 0) {
      meals = [{ name: "Healthy Bowl", calories: 450, recipe: "A balanced bowl with protein, grains, and vegetables." }];
    }

    return NextResponse.json({ meals });
  } catch (error) {
    reportError({ context: "meals generate POST", error, userId: session.user.id });
    return NextResponse.json({ error: "Failed to generate meals" }, { status: 500 });
  }
}
