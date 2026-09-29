import type { Food } from "@/lib/nutrition-foods";
import { kindFor } from "@/lib/nutrition-foods";
import { PROTEINS, type ParsedFood } from "@/lib/nutrition-parse";

/**
 * When a description doesn't say enough to estimate well, ask instead of guessing:
 *  1. a container with no standard size for that food ("a bottle of coconut water");
 *  2. a food the table doesn't know, with no amount given;
 *  3. an unmeasured calorie-dense basic (meat and fish, rice/grains/pasta, fats and sauces, nuts,
 *     cheese, desserts), unless it's an ingredient of a dish whose parts were listed.
 * At most two questions per meal; everything else uses typical portions.
 */
export interface AmountOption {
  label: string;
  /** A phrase the parser understands, placed before the food name ("12 floz", "5 oz"); "typical" keeps the default. */
  amount: string;
}
export interface AmountQuestion {
  /** Index into the parsed foods (stable for the same text). */
  key: number;
  food: string;
  prompt: string;
  options: AmountOption[];
}

const CONTAINERS = new Set(["bottle", "bag", "box", "container", "bowl", "plate", "glass", "carton", "pack", "jar", "tub", "cup"]);
const DRINKY = /milk|juice|water|soda|tea|coffee|latte|drink|smoothie|shake|beer|wine|kombucha|lemonade/;
const GRAINS = /rice|quinoa|couscous|pasta|oatmeal|oats|noodle|spaghetti|potato|fries|cereal|granola/;
const FATS = /oil|butter|mayonnaise|ranch|vinaigrette|pesto|alfredo|dipping sauce|peanut butter|almond butter|cream cheese|sour cream|heavy cream|guac|avocado/;
const NUTS = /almonds|seeds|trail mix|nuts/;
const CHEESE = /cheese|feta|parmesan|mozzarella/;
const DESSERT = /ice cream|cake|cookie|brownie|chocolate|cheesecake|donut|frosty/;
const MAX_QUESTIONS = 2;

const TYPICAL: AmountOption = { label: "Typical", amount: "typical" };
const opts = (...pairs: [string, string][]): AmountOption[] => [...pairs.map(([label, amount]) => ({ label, amount })), TYPICAL];

function optionsFor(p: ParsedFood): AmountOption[] {
  const name = p.food?.name ?? p.text;
  if (p.unit === "bag") return opts(["Small (1 oz)", "28 g"], ["Medium (3 oz)", "85 g"], ["Large (8 oz)", "227 g"]);
  if (p.unit === "bowl") return opts(["Small bowl", "250 g"], ["Medium bowl", "400 g"], ["Large bowl", "600 g"]);
  if (p.unit === "plate") return opts(["Small plate", "300 g"], ["Regular plate", "450 g"], ["Big plate", "650 g"]);
  if (DRINKY.test(name) || ["bottle", "glass", "carton", "can", "cup"].includes(p.unit)) return opts(["8 fl oz", "8 floz"], ["12 fl oz", "12 floz"], ["16.9 fl oz", "16.9 floz"], ["20 fl oz", "20 floz"], ["32 fl oz", "32 floz"]);
  if (p.food && PROTEINS.test(p.food.name)) return opts(["3 oz", "3 oz"], ["5 oz", "5 oz"], ["8 oz", "8 oz"]);
  if (GRAINS.test(name)) return opts(["½ cup", "0.5 cup"], ["1 cup", "1 cup"], ["2 cups", "2 cup"]);
  if (NUTS.test(name)) return opts(["Small handful", "15 g"], ["¼ cup", "35 g"], ["½ cup", "70 g"]);
  if (CHEESE.test(name)) return opts(["1 slice", "21 g"], ["1 oz", "1 oz"], ["2 oz", "2 oz"]);
  if (FATS.test(name)) return opts(["1 tsp", "1 tsp"], ["1 tbsp", "1 tbsp"], ["2 tbsp", "2 tbsp"]);
  if (DESSERT.test(name)) return opts(["Small", "0.5 serving"], ["Regular", "1 serving"], ["Large", "2 serving"]);
  return opts(["Small", "0.5 serving"], ["Regular", "1 serving"], ["Large", "2 serving"]);
}

function servingKcal(f: Food) {
  return (f.kcal * f.serving) / 100;
}

/** Why this item needs an amount, or null. Exported for tests. */
export function needsAmount(p: ParsedFood): "container" | "unknown" | "calorie-dense" | null {
  const f = p.food;
  if (CONTAINERS.has(p.unit) && !(f?.units?.[p.unit])) return "container";
  if (!f) return p.explicit ? null : "unknown";
  if (p.explicit || p.component) return null;
  const n = f.name;
  const dense = PROTEINS.test(n) || GRAINS.test(n) || FATS.test(n) || NUTS.test(n) || CHEESE.test(n) || DESSERT.test(n);
  return dense && servingKcal(f) >= 90 ? "calorie-dense" : null;
}

export function questionsFor(parsed: ParsedFood[], answered: Set<number> = new Set()): AmountQuestion[] {
  const ranked = parsed
    .map((p, key) => ({ p, key, why: answered.has(key) ? null : needsAmount(p) }))
    .filter((x) => x.why)
    // Unknown sizes first, then the biggest calorie swings.
    .sort((a, b) => (a.why === "calorie-dense" ? 1 : 0) - (b.why === "calorie-dense" ? 1 : 0) || (b.p.food ? servingKcal(b.p.food) : 0) - (a.p.food ? servingKcal(a.p.food) : 0))
    .slice(0, MAX_QUESTIONS);
  return ranked.map(({ p, key, why }) => ({
    key,
    food: p.text,
    prompt: why === "container" ? `How big was the ${p.unit} of ${p.text}?` : `How much ${p.text}?`,
    options: optionsFor(p),
  }));
}

export { kindFor };
