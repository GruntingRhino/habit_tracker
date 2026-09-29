/**
 * The categories of Abhay's profile. Each becomes profile/<id>.md on disk and one ProfileDoc row.
 * `computed` categories are filled by code from his data (exact numbers, never guessed);
 * the others are learned from what he says (chat, journal, quiz).
 */
export const CATEGORIES = [
  { id: "operating-style", label: "How you operate", hint: "how he works, plans, decides, gets things done" },
  { id: "learning", label: "How you learn best", hint: "how he learns and studies best: videos, reading, doing, teaching, repetition" },
  { id: "focus", label: "Focus & attention", hint: "how long he can focus, deep work, when he loses focus" },
  { id: "distractions", label: "Distractions", hint: "what distracts him or blocks him: phone, games, social media, people, noise" },
  { id: "task-durations", label: "How long things take you", hint: "how long tasks take him, estimates vs reality", computed: true },
  { id: "energy", label: "Energy through the day", hint: "when he has energy or gets tired, morning vs night", computed: true },
  { id: "sleep", label: "Sleep", hint: "sleep hours, bedtime, wake time, sleep problems" },
  { id: "motivation", label: "What motivates you", hint: "what drives him: competition, progress, rewards, people, faith" },
  { id: "procrastination", label: "Procrastination", hint: "what he puts off and why" },
  { id: "stress", label: "Stress & coping", hint: "what stresses him and how he copes" },
  { id: "goals", label: "Goals", hint: "what he wants to achieve, short and long term" },
  { id: "interests", label: "Interests", hint: "hobbies, sports, topics he likes" },
  { id: "strengths", label: "Strengths", hint: "what he is good at" },
  { id: "weaknesses", label: "Weak spots", hint: "what he struggles with" },
  { id: "habits", label: "Habit follow-through", hint: "which habits he keeps and which he misses", computed: true },
  { id: "food", label: "Food", hint: "what he eats, likes, dislikes, diet", computed: true },
  { id: "training", label: "Training", hint: "workouts, sports, exercise preferences", computed: true },
  { id: "faith", label: "Faith & values", hint: "religion, prayer, values, what matters to him" },
  { id: "money", label: "Money", hint: "spending, saving, earning, money habits" },
  { id: "social", label: "People", hint: "friends, family, relationships, social life" },
  { id: "communication", label: "How you like to be talked to", hint: "tone he likes, how he wants feedback and reminders" },
  { id: "routine", label: "Schedule & routine", hint: "school, work, daily schedule, when he does things", computed: true },
  { id: "what-works", label: "What works for you", hint: "tricks and methods that actually helped him" },
  { id: "personality", label: "Personality", hint: "personality traits: introvert/extrovert, organised, competitive, etc." },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as CategoryId[];

export function isCategory(v: unknown): v is CategoryId {
  return typeof v === "string" && (CATEGORY_IDS as string[]).includes(v);
}

export function categoryLabel(id: string) {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

/** What one ProfileDoc row holds (also rendered to profile/<id>.md). */
export interface ProfileContent {
  summary: string | null;
  beliefs: Belief[];
  /** Exact numbers computed from his data ("to-dos usually done within 1.5 days"). */
  stats: string[];
}

export type Level = "high" | "medium" | "low";

export interface Belief {
  id: string;
  text: string;
  level: Level;
  source: "quiz" | "said" | "inferred";
  count: number;
  lastSeen: string;
  /** A few of the events it's based on, so he can see why. */
  evidence: { t: string; text: string }[];
}
