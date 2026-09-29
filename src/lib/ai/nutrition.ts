import prisma from "@/lib/prisma";
import { chat, parseJson } from "@/lib/ai/llm";
import { findFood, FOOD_KINDS, gramsFor, kindFor, normalizeUnit, portionGrams, UNIT_GRAM_RANGE, type FoodKind } from "@/lib/nutrition-foods";
import { parseFoods, type ParsedFood } from "@/lib/nutrition-parse";
import { kindMicros, microsFor, scaleMicros, sumMicros, type Micros } from "@/lib/nutrition-micros";
import { questionsFor, type AmountQuestion } from "@/lib/nutrition-ask";
import { reportError } from "@/lib/monitoring";

/**
 * "2 eggs, 2 slices of toast and a banana" → per-food nutrition.
 * Code splits the text into foods and amounts and takes numbers from the reference table.
 * The model is only asked about foods the table doesn't know (its guesses are sanity-checked
 * and marked as estimates), or to split text the parser can't make sense of.
 */

export interface NutritionItem {
  name: string;
  amount: string;
  grams: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: "table" | "estimate" | "manual";
  micros?: Micros | null;
  /** Index of the parsed food this item came from (questions refer to it). */
  key?: number;
}

export interface NutritionDraft {
  name: string;
  /** The description it was estimated from (re-run with answers). */
  text?: string;
  micros?: Micros;
  /** Amounts the description didn't give: ask these instead of guessing. */
  questions?: AmountQuestion[];
  items: NutritionItem[];
  totals: { calories: number; protein: number; carbs: number; fat: number };
}

const SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          food: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string" },
          grams: { type: "number" },
          calories: { type: "number" },
          protein: { type: "number" },
          carbs: { type: "number" },
          fat: { type: "number" },
        },
        required: ["food", "quantity", "unit", "grams", "calories", "protein", "carbs", "fat"],
      },
    },
  },
  required: ["name", "items"],
};

// Keep byte-for-byte stable for the prompt cache.
const SYSTEM = `You split what Abhay ate into separate foods with amounts, and estimate nutrition for each. Reply with minified JSON only:
{"name":"short meal name","items":[{"food":"egg","quantity":2,"unit":"piece","grams":100,"calories":143,"protein":13,"carbs":1,"fat":10}]}
- One item per distinct food. Keep dishes whole ("chicken burrito", "pepperoni pizza"), don't list their ingredients.
- food: the plain food name, singular, no amounts ("egg", "white bread", "banana", "chicken breast").
- unit: one of piece, slice, cup, tbsp, tsp, oz, g, scoop, can, glass, bowl, serving. If no amount is given, quantity 1 and unit serving.
- grams: your best guess of the total weight for that quantity.
- calories/protein/carbs/fat: totals for that quantity, in kcal and grams.
- name: 2-5 words.
Example: 2 eggs, toast with butter and a coffee
{"name":"Eggs and toast","items":[{"food":"egg","quantity":2,"unit":"piece","grams":100,"calories":143,"protein":13,"carbs":1,"fat":10},{"food":"white bread","quantity":1,"unit":"slice","grams":28,"calories":74,"protein":3,"carbs":14,"fat":1},{"food":"butter","quantity":1,"unit":"tsp","grams":5,"calories":36,"protein":0,"carbs":0,"fat":4},{"food":"coffee","quantity":1,"unit":"cup","grams":240,"calories":5,"protein":0,"carbs":0,"fat":0}]}`;

/** Whole numbers, or one decimal for step 0.1, without float noise (12.600000000000001). */
const round = (n: number, step = 1) => (step === 1 ? Math.round(n) : Math.round(n * 10) / 10);

/** Amounts are shown in imperial: grams → oz, ml → fl oz (to the nearest ½). */
function amountLabel(quantity: number, unit: string) {
  const u = normalizeUnit(unit);
  if (!u || u === "serving") return quantity === 1 ? "1 serving" : `${quantity} servings`;
  const half = (n: number) => Math.max(0.5, Math.round(n * 2) / 2);
  if (u === "g" || u === "gram" || u === "grams") return `${half(quantity / 28.35)} oz`;
  if (u === "kg") return `${Math.round(quantity * 2.2046 * 10) / 10} lb`;
  if (u === "ml") return `${half(quantity / 29.57)} fl oz`;
  if (u === "floz") return `${quantity} fl oz`;
  const plural = quantity === 1 || ["g", "oz", "ml", "tbsp", "tsp", "lb"].includes(u) ? u : `${u}s`;
  return `${quantity} ${plural}`;
}

export function totalsOf(items: Pick<NutritionItem, "calories" | "protein" | "carbs" | "fat">[]) {
  const sum = (k: "calories" | "protein" | "carbs" | "fat") => items.reduce((n, i) => n + (Number(i[k]) || 0), 0);
  return { calories: round(sum("calories")), protein: round(sum("protein"), 0.1), carbs: round(sum("carbs"), 0.1), fat: round(sum("fat"), 0.1) };
}

/** One parsed item → numbers, preferring the reference table. Exported for tests. */
export function resolveItem(raw: { food?: string; quantity?: number; unit?: string; grams?: number; calories?: number; protein?: number; carbs?: number; fat?: number }): NutritionItem | null {
  const name = String(raw.food ?? "").trim().slice(0, 80);
  if (!name) return null;
  const food0 = findFood(String(raw.food ?? ""));
  const rawUnit = String(raw.unit ?? "").toLowerCase().trim();
  // Keep a food-specific unit ("large" pizza, "footlong" sub) before normalizing.
  const unit = food0?.units?.[rawUnit] ? rawUnit : normalizeUnit(raw.unit) || "serving";
  // Counts are small; weights ("200 g") can be large.
  const maxQuantity = ["g", "ml", "oz", "gram", "grams"].includes(unit) ? 5000 : 100;
  const quantity = raw.quantity && raw.quantity > 0 && raw.quantity < maxQuantity ? Math.round(raw.quantity * 100) / 100 : 1;
  const food = food0;
  const grams = gramsFor(food, quantity, unit) ?? (raw.grams && raw.grams > 0 && raw.grams < 5000 ? raw.grams : food ? food.serving * quantity : null);

  if (food && grams) {
    const k = grams / 100;
    return {
      name,
      amount: amountLabel(quantity, unit),
      grams: round(grams),
      calories: round(food.kcal * k),
      protein: round(food.protein * k, 0.1),
      carbs: round(food.carbs * k, 0.1),
      fat: round(food.fat * k, 0.1),
      source: "table",
      micros: scaleMicros(microsFor(food.name), grams),
    };
  }

  // Not in the table: the model's guess, kept only if it's physically plausible.
  let protein = Math.max(0, Math.min(raw.protein ?? 0, 300));
  let carbs = Math.max(0, Math.min(raw.carbs ?? 0, 600));
  let fat = Math.max(0, Math.min(raw.fat ?? 0, 300));
  let calories = Math.max(0, Math.min(raw.calories ?? 0, 4000));
  const fromMacros = protein * 4 + carbs * 4 + fat * 9;
  if (fromMacros > 0 && (calories === 0 || Math.abs(calories - fromMacros) / Math.max(calories, fromMacros) > 0.3)) calories = fromMacros;
  if (fromMacros === 0 && calories > 0) {
    // Calories without macros: assume a mixed dish (20% protein, 50% carbs, 30% fat by energy).
    protein = (calories * 0.2) / 4;
    carbs = (calories * 0.5) / 4;
    fat = (calories * 0.3) / 9;
  }
  return {
    name,
    amount: amountLabel(quantity, unit),
    grams: grams ? round(grams) : null,
    calories: round(calories),
    protein: round(protein, 0.1),
    carbs: round(carbs, 0.1),
    fat: round(fat, 0.1),
    source: "estimate",
  };
}

const KINDS = Object.keys(FOOD_KINDS) as FoodKind[];
const GUESS_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { food: { type: "string" }, kind: { type: "string", enum: KINDS }, grams: { type: "number" } },
        required: ["food", "kind", "grams"],
      },
    },
  },
  required: ["items"],
};

// Keep byte-for-byte stable for the prompt cache. The model classifies and weighs; code does the nutrition math.
const GUESS_SYSTEM = `For each food listed, say what kind of food it is and estimate the total weight in grams of the amount given (typical portion). Reply with minified JSON only: {"items":[{"food":"...","kind":"...","grams":0}]}
kind is one of: ${KINDS.join("; ")}.
Examples: "1 slice carrot cake" → bread, cake or baked goods, 110 g. "1 bowl ramen from a restaurant" → rice, noodle or pasta dish, 650 g. "1 glass lemonade" → sweet drink, juice or soda, 250 g.`;

/** Nutrition for a food the table doesn't know, from its kind and a clamped weight. Exported for tests. */
export function fromKind(name: string, quantity: number, unit: string, kind: string | undefined, grams: number | undefined): NutritionItem {
  const k0: FoodKind = (kind as FoodKind) in FOOD_KINDS ? (kind as FoodKind) : "sandwich, wrap, burger or pizza";
  const profile = FOOD_KINDS[k0];
  const u = normalizeUnit(unit) || "serving";
  const [lo, hi] = UNIT_GRAM_RANGE[u] ?? [10, 900];
  // Weight: the caller's guess if given (clamped to what the unit allows), else a typical portion for the kind.
  const each = grams && grams > 0 ? Math.min(hi, Math.max(lo, grams / (quantity > 1 && grams > hi ? quantity : 1))) : portionGrams(k0, u);
  const total = ["g", "ml"].includes(u) ? quantity : u === "oz" ? quantity * 28.35 : each * quantity;
  const k = total / 100;
  return {
    name,
    amount: amountLabel(quantity, u),
    grams: round(total),
    calories: round(profile.kcal * k),
    protein: round(profile.protein * k, 0.1),
    carbs: round(profile.carbs * k, 0.1),
    fat: round(profile.fat * k, 0.1),
    source: "estimate",
    micros: scaleMicros(kindMicros(k0), total),
  };
}

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Apply answered amounts ("330 ml", "5 oz", "typical") to the parsed foods, by key. */
function withAmounts(parsed: ParsedFood[], amounts: Record<number, string>) {
  return parsed.map((p, key) => {
    const a = amounts[key]?.trim();
    if (!a || a === "typical") return p;
    const re = parseFoods(`${a} ${p.text}`)[0];
    return re ? { ...p, quantity: re.quantity, unit: re.unit, explicit: true } : p;
  });
}

export async function estimateNutrition(text: string, opts: { amounts?: Record<number, string> } = {}): Promise<NutritionDraft> {
  const amounts = opts.amounts ?? {};
  const parsed = withAmounts(parseFoods(text).slice(0, 15), amounts);
  if (!parsed.length) return modelSplit(text);

  const unknown = parsed.filter((p) => !p.food);
  const guesses = new Map<number, NutritionItem>();
  // Unknown foods whose kind is obvious from their name need no model at all.
  for (const u of unknown.filter((x) => kindFor(x.text))) guesses.set(parsed.indexOf(u), fromKind(u.text, u.quantity, u.unit || "serving", kindFor(u.text)!, undefined));
  const stillUnknown = unknown.filter((x) => !kindFor(x.text));
  if (stillUnknown.length) {
    const unknown = stillUnknown;
    const list = unknown.map((u) => `- ${u.quantity} ${u.unit || "serving"} ${u.text}`).join("\n");
    const result = await chat({
      messages: [
        { role: "system", content: GUESS_SYSTEM },
        { role: "user", content: list },
      ],
      schema: GUESS_SCHEMA,
      temperature: 0.1,
      maxTokens: 60 + 45 * unknown.length,
      timeoutMs: 150_000,
    });
    const out = parseJson<{ items?: { kind?: string; grams?: number }[] }>(result.content)?.items ?? [];
    unknown.forEach((u, i) => guesses.set(parsed.indexOf(u), fromKind(u.text, u.quantity, u.unit || "serving", out[i]?.kind, undefined)));
  }

  const items = parsed
    .map((p, i) => {
      const item = p.food ? resolveItem({ food: p.text, quantity: p.quantity, unit: p.unit || (p.food.units?.piece ? "piece" : "serving") }) : guesses.get(i) ?? null;
      return item ? ({ ...item, key: i } as NutritionItem) : null;
    })
    .filter((i): i is NutritionItem => Boolean(i));
  const name = titleCase(parsed.map((p) => p.text).slice(0, 3).join(", ") + (parsed.length > 3 ? "…" : "")).slice(0, 120);
  const questions = questionsFor(parsed, new Set(Object.keys(amounts).map(Number)));
  return { name, text, items, totals: totalsOf(items), micros: sumMicros(items.map((i) => i.micros)), questions };
}

/** Fallback when the parser finds nothing: let the model split the text. */
async function modelSplit(text: string): Promise<NutritionDraft> {
  const result = await chat({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: text.slice(0, 600) },
    ],
    schema: SCHEMA,
    temperature: 0.1,
    maxTokens: 450,
    timeoutMs: 150_000,
  });
  const parsed = parseJson<{ name?: string; items?: Parameters<typeof resolveItem>[0][] }>(result.content);
  const items = (parsed?.items ?? []).slice(0, 15).map(resolveItem).filter((i): i is NutritionItem => Boolean(i));
  const name = (parsed?.name?.trim() || text.trim()).slice(0, 120);
  return { name: titleCase(name), text, items, totals: totalsOf(items), micros: sumMicros(items.map((i) => i.micros)), questions: [] };
}

function draftData(draft: NutritionDraft) {
  return {
    calories: draft.totals.calories,
    protein: draft.totals.protein,
    carbs: draft.totals.carbs,
    fat: draft.totals.fat,
    micros: (draft.micros ?? {}) as object,
    items: draft.items as object[],
    nutritionSource: "ai",
  };
}

/** Fill in nutrition for a meal logged in chat (typical portions). Runs in the background; never throws. */
export async function estimateMealInBackground(mealId: string, text: string) {
  try {
    const draft = await estimateNutrition(text);
    if (!draft.items.length) return;
    await prisma.meal.updateMany({ where: { id: mealId, calories: null, nutritionSource: null }, data: draftData(draft) });
  } catch (error) {
    reportError({ context: "nutrition.background", error });
  }
}

/** Re-estimate a meal with answered amounts and overwrite its nutrition. */
export async function reestimateMeal(mealId: string, text: string, amounts: Record<number, string>) {
  const draft = await estimateNutrition(text, { amounts });
  if (draft.items.length) await prisma.meal.update({ where: { id: mealId }, data: draftData(draft) });
  return draft;
}
