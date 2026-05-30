import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { markCoachContextDirty } from "@/lib/coach-context-cache";
import {
  DEFAULT_USER_CONTEXT_SETTINGS,
  extractUserContextSettings,
  mergeUserContextSettingsIntoPreferences,
} from "@/lib/user-context-settings";
import {
  buildScopedRateLimitKeys,
  checkRateLimit,
  extractClientIp,
  resetRateLimit,
} from "@/lib/rate-limit";
import { strictObject } from "@/lib/validation";

const userContextSchema = strictObject({
  personalContext: z.string().trim().max(4000).nullable().optional(),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = extractClientIp(req.headers);
  const rateLimitKeys = buildScopedRateLimitKeys(
    "user-context-get",
    session.user.id,
    ip
  );

  for (const rateLimitKey of rateLimitKeys) {
    const limit = await checkRateLimit(rateLimitKey);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many context requests. Try again later." },
        { status: 429 }
      );
    }
  }

  try {
    const profile = await prisma.coachProfile.findUnique({
      where: { userId: session.user.id },
      select: { preferences: true },
    });

    return NextResponse.json(
      profile
        ? extractUserContextSettings(profile.preferences)
        : DEFAULT_USER_CONTEXT_SETTINGS
    );
  } catch (error) {
    reportError({ context: "user-context GET", error, userId: session.user.id });
    return NextResponse.json(
      { error: "Failed to load context settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = extractClientIp(req.headers);
  const rateLimitKeys = buildScopedRateLimitKeys(
    "user-context-patch",
    session.user.id,
    ip
  );

  for (const rateLimitKey of rateLimitKeys) {
    const limit = await checkRateLimit(rateLimitKey);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many context updates. Try again later." },
        { status: 429 }
      );
    }
  }

  try {
    const rawBody = await req.json();
    const parsed = userContextSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const existing = await prisma.coachProfile.findUnique({
      where: { userId: session.user.id },
      select: { preferences: true },
    });

    const nextSettings = {
      personalContext: parsed.data.personalContext?.trim() || null,
    };

    await prisma.coachProfile.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        preferences: mergeUserContextSettingsIntoPreferences(
          existing?.preferences,
          nextSettings
        ),
      },
      update: {
        preferences: mergeUserContextSettingsIntoPreferences(
          existing?.preferences,
          nextSettings
        ),
      },
    });

    await markCoachContextDirty(session.user.id);

    for (const rateLimitKey of rateLimitKeys) {
      await resetRateLimit(rateLimitKey);
    }

    return NextResponse.json(nextSettings);
  } catch (error) {
    reportError({ context: "user-context PATCH", error, userId: session.user.id });
    return NextResponse.json(
      { error: "Failed to save context settings" },
      { status: 500 }
    );
  }
}