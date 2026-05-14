import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  defaultWakeAlarmSettings,
  normalizeWakeAlarmSettings,
  wakeAlarmSettingsSchema,
} from "@/lib/wake-alarm";

const WAKE_ALARM_PREFERENCES_KEY = "wakeAlarm";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const profile = await prisma.coachProfile.findUnique({
      where: { userId: session.user.id },
      select: { preferences: true },
    });

    const rawPreferences =
      profile?.preferences &&
      typeof profile.preferences === "object" &&
      !Array.isArray(profile.preferences)
        ? (profile.preferences as Record<string, unknown>)
        : {};

    const settings = normalizeWakeAlarmSettings(
      rawPreferences[WAKE_ALARM_PREFERENCES_KEY]
    );

    return NextResponse.json(settings);
  } catch (error) {
    console.error("[wake-alarm GET] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = wakeAlarmSettingsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid wake alarm settings",
        },
        { status: 400 }
      );
    }

    const existingProfile = await prisma.coachProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true, preferences: true },
    });

    const existingPreferences =
      existingProfile?.preferences &&
      typeof existingProfile.preferences === "object" &&
      !Array.isArray(existingProfile.preferences)
        ? (existingProfile.preferences as Record<string, unknown>)
        : {};

    const nextPreferences = {
      ...existingPreferences,
      [WAKE_ALARM_PREFERENCES_KEY]: parsed.data,
    };

    const profile = existingProfile
      ? await prisma.coachProfile.update({
          where: { userId: session.user.id },
          data: { preferences: nextPreferences },
        })
      : await prisma.coachProfile.create({
          data: {
            userId: session.user.id,
            preferences: {
              [WAKE_ALARM_PREFERENCES_KEY]: parsed.data,
            },
          },
        });

    const settings = normalizeWakeAlarmSettings(
      (profile.preferences as Record<string, unknown> | null)?.[
        WAKE_ALARM_PREFERENCES_KEY
      ] ?? defaultWakeAlarmSettings
    );

    return NextResponse.json(settings);
  } catch (error) {
    console.error("[wake-alarm PATCH] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
