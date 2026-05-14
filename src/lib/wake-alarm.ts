import { z } from "zod";
import { WEEKDAY_CODES } from "@/lib/coach-types";

export const WAKE_MISSION_TYPES = [
  "steps",
  "jumping_jacks",
  "push_ups",
  "mixed",
] as const;

export type WakeMissionType = (typeof WAKE_MISSION_TYPES)[number];

export const defaultWakeAlarmSettings = {
  enabled: false,
  time: "06:00",
  repeatDays: [...WEEKDAY_CODES],
  missionType: "steps" as WakeMissionType,
  challengeTarget: 40,
  wakeUpCheckMinutes: 3,
  strictMode: true,
};

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const wakeAlarmSettingsSchema = z.object({
  enabled: z.boolean(),
  time: z.string().regex(timeRegex, "Invalid time format"),
  repeatDays: z.array(z.enum(WEEKDAY_CODES)).min(1).max(7),
  missionType: z.enum(WAKE_MISSION_TYPES),
  challengeTarget: z.number().int().min(1).max(500),
  wakeUpCheckMinutes: z.number().int().min(1).max(15),
  strictMode: z.boolean(),
});

export type WakeAlarmSettings = z.infer<typeof wakeAlarmSettingsSchema>;

export function normalizeWakeAlarmSettings(
  value: unknown
): WakeAlarmSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaultWakeAlarmSettings;
  }

  const merged = {
    ...defaultWakeAlarmSettings,
    ...(value as Record<string, unknown>),
  };

  const parsed = wakeAlarmSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : defaultWakeAlarmSettings;
}
