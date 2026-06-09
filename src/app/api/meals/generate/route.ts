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

    const { category, goal } = await _req.json();

    const aiUp = await isAIAvailable();
    if (!aiUp) {
      return NextResponse.json(
        { error: "AI not available" },
        { status: 503 }
      );
    }

    const prompt = `Suggest 3 healthy ${category || "lunch"} meals for someone trying to ${goal || "eat healthy"}. For each meal, provide: name, approximate calories, and a brief recipe or description. Return as JSON array with fields: name, calories, recipe.`;

    const messages = [{ role: "user" as const, content: prompt }];
    const response = await chatWithCoach(messages, {});

    let meals;
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        meals = JSON.parse(jsonMatch[0]);
      } else {
        meals = [
          {
            name: "Healthy Bowl",
            calories: 450,
            recipe: "A balanced bowl with protein, grains, and vegetables.",
          },
        ];
      }
    } catch {
      meals = [
        {
          name: "Healthy Bowl",
          calories: 450,
          recipe: "A balanced bowl with protein, grains, and vegetables.",
        },
      ];
    }

    return NextResponse.json({ meals });
  } catch (error) {
    reportError({ context: "meals generate POST", error, userId: session.user.id });
    return NextResponse.json(
      { error: "Failed to generate meals" },
      { status: 500 }
    );
  }
}
