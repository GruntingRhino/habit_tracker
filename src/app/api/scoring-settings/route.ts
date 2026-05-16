import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  DEFAULT_SCORING_SETTINGS,
  extractScoringSettings,
  mergeScoringSettingsIntoPreferences,
} from "@/lib/scoring-settings";

const scoringSettingsSchema = z.object({
  strictness: z.enum(["lenient", "balanced", "strict"]),
  ageYears: z.number().int().min(0).max(120).nullable(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await prisma.coachProfile.findUnique({
    where: { userId: session.user.id },
    select: { preferences: true },
  });

  return NextResponse.json(
    profile ? extractScoringSettings(profile.preferences) : DEFAULT_SCORING_SETTINGS
  );
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rawBody = await req.json();
    const parsed = scoringSettingsSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const existing = await prisma.coachProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true, preferences: true },
    });

    const preferences = mergeScoringSettingsIntoPreferences(
      existing?.preferences,
      parsed.data
    );

    const updated = await prisma.coachProfile.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        preferences,
      },
      update: {
        preferences,
      },
      select: { preferences: true },
    });

    return NextResponse.json(extractScoringSettings(updated.preferences));
  } catch (error) {
    console.error("[scoring-settings PATCH] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
