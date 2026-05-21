export const HABIT_CATEGORY_OPTIONS = [
  "general",
  "physical",
  "financial",
  "discipline",
  "focus",
  "mental",
] as const;

export type HabitCategoryOption = (typeof HABIT_CATEGORY_OPTIONS)[number];

const HABIT_CATEGORY_ALIAS_MAP: Record<string, HabitCategoryOption> = {
  appearance: "physical",
  discipline: "discipline",
  finance: "financial",
  financial: "financial",
  focus: "focus",
  general: "general",
  health: "physical",
  mental: "mental",
  physical: "physical",
  productivity: "focus",
  social: "mental",
  spiritual: "mental",
};

export function normalizeHabitCategory(
  category: string | null | undefined
): HabitCategoryOption {
  const normalized = (category ?? "").trim().toLowerCase();
  return HABIT_CATEGORY_ALIAS_MAP[normalized] ?? "general";
}

function scoreKeywords(text: string, keywords: string[]): number {
  return keywords.reduce((score, keyword) => score + (text.includes(keyword) ? 1 : 0), 0);
}

export function characterizeHabitCategory(
  name: string,
  description: string | null | undefined
): HabitCategoryOption {
  const text = `${name} ${description ?? ""}`.toLowerCase();

  const scores: Record<HabitCategoryOption, number> = {
    general: 0,
    physical: scoreKeywords(text, [
      "workout", "run", "gym", "sleep", "walk", "steps", "protein", "calorie",
      "mobility", "stretch", "box", "shadowbox", "push-up", "water", "bodyweight",
    ]),
    financial: scoreKeywords(text, [
      "money", "income", "revenue", "finance", "save", "spending", "budget", "side hustle", "business",
    ]),
    discipline: scoreKeywords(text, [
      "clean", "no scrolling", "limit screen", "journal", "review", "routine", "consistency", "discipline",
    ]),
    focus: scoreKeywords(text, [
      "deep work", "study", "read", "learn", "school", "task", "focus", "work block", "mit",
    ]),
    mental: scoreKeywords(text, [
      "meditation", "gratitude", "reflect", "mental", "mind", "sunlight", "wind-down", "phone off", "journaling",
    ]),
  };

  const ranked = Object.entries(scores)
    .sort((left, right) => right[1] - left[1]) as Array<[HabitCategoryOption, number]>;

  return ranked[0]?.[1] > 0 ? ranked[0][0] : "general";
}
