import { describe, it, expect } from "vitest";
import { z } from "zod";

// ── Inline Zod schemas mirroring API routes ─────────────────────────────────

const habitPostSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(100),
  description: z.string().trim().max(500).optional(),
  category: z
    .enum([
      "general",
      "physical",
      "mental",
      "health",
      "productivity",
      "financial",
      "finance",
      "social",
      "spiritual",
      "discipline",
      "focus",
    ])
    .default("general"),
  targetDays: z
    .array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]))
    .min(1)
    .max(7)
    .default(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#3b82f6"),
}).strict();

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

  it("accepts coach/app categories used in production", () => {
    expect(habitPostSchema.safeParse({ name: "Deep Work", category: "focus" }).success).toBe(true);
    expect(habitPostSchema.safeParse({ name: "Track Spending", category: "finance" }).success).toBe(true);
    expect(habitPostSchema.safeParse({ name: "No Scrolling", category: "discipline" }).success).toBe(true);
  });

  it("rejects unexpected fields", () => {
    expect(habitPostSchema.safeParse({ name: "Run", unexpected: true }).success).toBe(false);
  });
});

const mealPostSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(120),
  category: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  calories: z.number().int().min(1).max(10000).optional(),
  servings: z.number().min(0.25).max(100).default(1),
}).strict();

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

  it("rejects unexpected fields", () => {
    expect(mealPostSchema.safeParse({ name: "Oats", category: "breakfast", extra: "x" }).success).toBe(false);
  });
});
