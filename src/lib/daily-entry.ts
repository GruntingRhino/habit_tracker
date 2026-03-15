import { z } from "zod";
import { WORKOUT_INTENSITIES } from "@/lib/workout";

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

function optionalBoundedNumber(min: number, max: number) {
  return z.number().min(min).max(max).nullable().optional();
}

function optionalBoundedInt(min: number, max: number) {
  return z.number().int().min(min).max(max).nullable().optional();
}

function optionalTrimmedString(max: number) {
  return z.preprocess(
    (value) => {
      if (value === undefined || value === null) return null;
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    },
    z.string().max(max).nullable().optional()
  );
}

function optionalTimeString() {
  return z.preprocess(
    (value) => {
      if (value === undefined || value === null) return null;
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    },
    z.string().regex(TIME_REGEX, "Invalid time format").nullable().optional()
  );
}

export const dailyEntryPayloadSchema = z
  .object({
    date: z.string().optional(),
    sleepHours: optionalBoundedNumber(0, 16),
    workoutCompleted: z.boolean().optional(),
    workoutRoutineName: optionalTrimmedString(120),
    workoutDurationMinutes: optionalBoundedInt(0, 480),
    workoutIntensity: z.enum(WORKOUT_INTENSITIES).nullable().optional(),
    workoutDetails: optionalTrimmedString(500),
    sportsTrainingMinutes: optionalBoundedInt(0, 480),
    steps: optionalBoundedInt(0, 100000),
    deepWorkHours: optionalBoundedNumber(0, 16),
    screenTimeHours: optionalBoundedNumber(0, 24),
    tasksPlanned: optionalBoundedInt(0, 100),
    tasksCompleted: optionalBoundedInt(0, 100),
    taskDifficultyRating: optionalBoundedInt(1, 10),
    moneySpent: optionalBoundedNumber(0, 100000),
    moneySaved: optionalBoundedNumber(0, 100000),
    incomeActivity: z.boolean().optional(),
    caloriesEaten: optionalBoundedInt(0, 10000),
    rightWithGod: z.boolean().optional(),
    wakeTime: optionalTimeString(),
    bedtime: optionalTimeString(),
    notes: optionalTrimmedString(2000),
    overallDayRating: optionalBoundedInt(1, 10),
  })
  .superRefine((value, ctx) => {
    if (!value.workoutCompleted) return;

    if (!value.workoutRoutineName) {
      ctx.addIssue({
        code: "custom",
        path: ["workoutRoutineName"],
        message: "Workout name or routine is required when workout is completed.",
      });
    }

    if (!value.workoutDurationMinutes || value.workoutDurationMinutes < 10) {
      ctx.addIssue({
        code: "custom",
        path: ["workoutDurationMinutes"],
        message: "A workout needs at least 10 minutes to count.",
      });
    }

    if (!value.workoutIntensity) {
      ctx.addIssue({
        code: "custom",
        path: ["workoutIntensity"],
        message: "Workout intensity is required when workout is completed.",
      });
    }

    if (value.workoutDetails && value.workoutDetails.length < 8) {
      ctx.addIssue({
        code: "custom",
        path: ["workoutDetails"],
        message: "Add enough workout detail to grade it strictly.",
      });
    }
  });

export type DailyEntryPayload = z.infer<typeof dailyEntryPayloadSchema>;

export function normalizeDailyEntryPayload(
  value: DailyEntryPayload
): DailyEntryPayload {
  const workoutCompleted = value.workoutCompleted ?? false;

  return {
    ...value,
    workoutCompleted,
    incomeActivity: value.incomeActivity ?? false,
    rightWithGod: value.rightWithGod ?? false,
    workoutRoutineName: workoutCompleted ? value.workoutRoutineName ?? null : null,
    workoutDurationMinutes: workoutCompleted
      ? value.workoutDurationMinutes ?? null
      : null,
    workoutIntensity: workoutCompleted ? value.workoutIntensity ?? null : null,
    workoutDetails: workoutCompleted ? value.workoutDetails ?? null : null,
  };
}
