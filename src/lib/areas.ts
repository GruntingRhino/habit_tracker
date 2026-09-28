export const AREAS = ["physical", "mental", "financial", "spiritual", "work", "general"] as const;
export type Area = (typeof AREAS)[number];

export const SCORED_AREAS = ["physical", "mental", "financial", "spiritual", "work"] as const;
export type ScoredArea = (typeof SCORED_AREAS)[number];

export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const AREA_META: Record<Area, { label: string; color: string }> = {
  physical: { label: "Physical", color: "#34d399" },
  mental: { label: "Mental", color: "#a78bfa" },
  financial: { label: "Financial", color: "#fbbf24" },
  spiritual: { label: "Spiritual", color: "#60a5fa" },
  work: { label: "Work", color: "#f472b6" },
  general: { label: "General", color: "#94a3b8" },
};

export const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function normalizeArea(value: unknown): Area {
  const v = String(value ?? "").toLowerCase().trim();
  return (AREAS as readonly string[]).includes(v) ? (v as Area) : "general";
}

export function normalizePriority(value: unknown, fallback: Priority = "medium"): Priority {
  const v = String(value ?? "").toLowerCase().trim();
  return (PRIORITIES as readonly string[]).includes(v) ? (v as Priority) : fallback;
}
