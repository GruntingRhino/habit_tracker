import { z } from "zod";
import { MICRO_KEYS } from "@/lib/nutrition-micros";

export const microsSchema = z.object(Object.fromEntries(MICRO_KEYS.map((k) => [k, z.number().min(0).max(100000).optional()]))).partial();

export const nutritionItemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  amount: z.string().trim().max(40).default(""),
  grams: z.number().min(0).max(5000).nullable().optional(),
  calories: z.number().min(0).max(10000),
  protein: z.number().min(0).max(1000),
  carbs: z.number().min(0).max(2000),
  fat: z.number().min(0).max(1000),
  source: z.enum(["table", "estimate", "manual"]).default("manual"),
  micros: microsSchema.nullable().optional(),
  key: z.number().int().optional(),
});

export const targetsSchema = z.object({
  calories: z.number().int().min(0).max(10000).nullable(),
  protein: z.number().min(0).max(1000).nullable(),
  carbs: z.number().min(0).max(2000).nullable(),
  fat: z.number().min(0).max(1000).nullable(),
  ...Object.fromEntries(MICRO_KEYS.map((k) => [k, z.number().min(0).max(100000).nullable().optional()])),
});
export type NutritionTargets = z.infer<typeof targetsSchema>;
