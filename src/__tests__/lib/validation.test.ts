import { describe, it, expect } from "vitest";
import { z } from "zod";
import { wakeAlarmSettingsSchema } from "@/lib/wake-alarm";

// ── Wake alarm schema ────────────────────────────────────────────────────────

describe("wakeAlarmSettingsSchema", () => {
  const valid = {
    enabled: true,
    time: "06:30",
    repeatDays: ["mon", "tue", "wed"],
    missionType: "steps",
    challengeTarget: 40,
    wakeUpCheckMinutes: 3,
    strictMode: true,
  };

  it("accepts valid settings", () => {
    expect(wakeAlarmSettingsSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects invalid time format", () => {
    const r = wakeAlarmSettingsSchema.safeParse({ ...valid, time: "6:30" });
    expect(r.success).toBe(false);
  });

  it("rejects empty repeatDays", () => {
    const r = wakeAlarmSettingsSchema.safeParse({ ...valid, repeatDays: [] });
    expect(r.success).toBe(false);
  });

  it("rejects challengeTarget out of range", () => {
    expect(wakeAlarmSettingsSchema.safeParse({ ...valid, challengeTarget: 0 }).success).toBe(false);
    expect(wakeAlarmSettingsSchema.safeParse({ ...valid, challengeTarget: 501 }).success).toBe(false);
  });
});

// ── Inline Zod schemas mirroring API routes ─────────────────────────────────

const habitPostSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(100),
  description: z.string().trim().max(500).optional(),
  category: z
    .enum(["general", "physical", "mental", "health", "productivity", "financial", "social", "spiritual"])
    .default("general"),
  targetDays: z
    .array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]))
    .min(1)
    .max(7)
    .default(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#3b82f6"),
});

describe("habitPostSchema", () => {
  it("accepts minimal valid payload", () => {
    expect(habitPostSchema.safeParse({ name: "Meditation" }).success).toBe(true);
  });

  it("rejects empty name", () => {
    expect(habitPostSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects invalid color", () => {
    expect(habitPostSchema.safeParse({ name: "Run", color: "blue" }).success).toBe(false);
  });

  it("rejects invalid category", () => {
    expect(habitPostSchema.safeParse({ name: "Run", category: "unknown" }).success).toBe(false);
  });
});

const mealPostSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(120),
  category: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  calories: z.number().int().min(1).max(10000).optional(),
  servings: z.number().min(0.25).max(100).default(1),
});

describe("mealPostSchema", () => {
  it("accepts valid meal", () => {
    expect(mealPostSchema.safeParse({ name: "Oats", category: "breakfast" }).success).toBe(true);
  });

  it("rejects invalid category", () => {
    expect(mealPostSchema.safeParse({ name: "Oats", category: "brunch" }).success).toBe(false);
  });

  it("rejects negative calories", () => {
    expect(mealPostSchema.safeParse({ name: "Oats", category: "breakfast", calories: -10 }).success).toBe(false);
  });
});
