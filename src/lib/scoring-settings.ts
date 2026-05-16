import { Prisma } from "@/generated/prisma";

export const SCORE_CATEGORY_KEYS = [
  "physical",
  "financial",
  "discipline",
  "focus",
  "mental",
] as const;

export type ScoreCategoryKey = (typeof SCORE_CATEGORY_KEYS)[number];
export type ScoreStrictness = "lenient" | "balanced" | "strict";

export interface ScoringSettings {
  strictness: ScoreStrictness;
  ageYears: number | null;
}

export const DEFAULT_SCORING_SETTINGS: ScoringSettings = {
  strictness: "balanced",
  ageYears: null,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function extractScoringSettings(
  preferences: Prisma.JsonValue | null | undefined
): ScoringSettings {
  const root = asRecord(preferences);
  const scoring = asRecord(root.scoring);
  const strictness = scoring.strictness;
  const ageYears = scoring.ageYears;

  return {
    strictness:
      strictness === "lenient" || strictness === "balanced" || strictness === "strict"
        ? strictness
        : DEFAULT_SCORING_SETTINGS.strictness,
    ageYears:
      typeof ageYears === "number" && Number.isFinite(ageYears) && ageYears >= 0
        ? Math.round(ageYears)
        : DEFAULT_SCORING_SETTINGS.ageYears,
  };
}

export function mergeScoringSettingsIntoPreferences(
  preferences: Prisma.JsonValue | null | undefined,
  scoring: ScoringSettings
): Prisma.JsonObject {
  const root = asRecord(preferences);

  return {
    ...root,
    scoring: {
      strictness: scoring.strictness,
      ageYears: scoring.ageYears,
    },
  };
}
