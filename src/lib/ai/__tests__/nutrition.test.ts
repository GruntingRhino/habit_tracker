import { describe, expect, it } from "vitest";
import { findFood, gramsFor } from "@/lib/nutrition-foods";
import { resolveItem, totalsOf } from "@/lib/ai/nutrition";

describe("food table", () => {
  it.each([
    ["eggs", "egg"],
    ["scrambled eggs", "egg"],
    ["toast", "white bread"],
    ["chicken burrito", "burrito"],
    ["pepperoni pizza", "pepperoni pizza"],
    ["a banana", "banana"],
    ["grilled chicken breast", "chicken breast"],
    ["iced latte", "latte"],
  ])("%s → %s", (q, name) => expect(findFood(q)?.name).toBe(name));
  it("unknown or different foods don't match loosely", () => {
    expect(findFood("durian mochi")).toBeNull();
    expect(findFood("durian")).toBeNull();
    expect(findFood("strawberry milk")?.name).toBe("milk"); // head-noun fallback
    expect(findFood("peanut butter cookie")?.name).toBe("cookie"); // head-noun fallback
  });
  it("grams by unit", () => {
    expect(gramsFor(findFood("egg"), 2, "piece")).toBe(100);
    expect(gramsFor(findFood("white bread"), 2, "slices")).toBe(56);
    expect(gramsFor(findFood("rice"), 1, "cup")).toBe(158);
    expect(gramsFor(null, 4, "oz")).toBeCloseTo(113.4);
    expect(gramsFor(findFood("banana"), 1, "serving")).toBe(118);
  });
});

describe("resolveItem", () => {
  it("uses the table, ignoring a bad model guess", () => {
    const item = resolveItem({ food: "egg", quantity: 2, unit: "piece", grams: 300, calories: 900, protein: 1, carbs: 1, fat: 1 })!;
    expect(item).toMatchObject({ source: "table", grams: 100, calories: 143, protein: 12.6, amount: "2 pieces" });
  });
  it("keeps a plausible estimate for unknown foods", () => {
    const item = resolveItem({ food: "durian mochi", quantity: 1, unit: "piece", grams: 60, calories: 180, protein: 2, carbs: 35, fat: 4 })!;
    expect(item).toMatchObject({ source: "estimate", calories: 180 });
  });
  it("fixes calories that don't match the macros", () => {
    const item = resolveItem({ food: "mystery stew", quantity: 1, unit: "bowl", grams: 300, calories: 50, protein: 20, carbs: 30, fat: 10 })!;
    expect(item.calories).toBe(290);
  });
  it("fills macros when only calories were given", () => {
    const item = resolveItem({ food: "mystery stew", quantity: 1, unit: "bowl", grams: 300, calories: 400, protein: 0, carbs: 0, fat: 0 })!;
    expect(item.protein).toBe(20);
    expect(item.carbs).toBe(50);
  });
  it("rejects nameless items and absurd quantities", () => {
    expect(resolveItem({ food: "" })).toBeNull();
    expect(resolveItem({ food: "banana", quantity: 5000, unit: "piece" })!.amount).toBe("1 piece");
  });
  it("totals", () => expect(totalsOf([{ calories: 100, protein: 1.25, carbs: 2, fat: 3 }, { calories: 50, protein: 1, carbs: 0, fat: 0 }])).toEqual({ calories: 150, protein: 2.3, carbs: 2, fat: 3 }));
});

import { parseFoods } from "@/lib/nutrition-parse";

describe("parseFoods", () => {
  const show = (t: string) => parseFoods(t).map((p) => `${p.quantity} ${p.unit} ${p.food?.name ?? `?${p.text}`}`);
  it.each([
    ["2 eggs, 2 slices of toast with butter and a banana", ["2 egg egg", "2 slice white bread", "1 serving butter", "1 piece banana"]],
    ["big mac and medium fries", ["1 serving burger", "1 medium french fries"]],
    ["protein shake with 2 scoops and a cup of milk", ["2 scoop whey protein", "1 cup milk"]],
    ["2 cups of spaghetti with meat sauce", ["2 cup spaghetti with meat sauce"]],
    ["I had mac and cheese for lunch at home", ["1 serving mac and cheese"]],
    ["200g chicken breast and half a cup of rice", ["200 g chicken breast", "0.5 cup white rice"]],
    ["1 cup cauliflower rice, 1/4 cup each of carrots, peas and corn", ["1 cup cauliflower rice", "0.25 cup carrots", "0.25 cup peas", "0.25 cup corn"]],
    ["1 and a half cups of rice", ["1.5 cup white rice"]],
    ["¾ cup of greek yogurt", ["0.75 cup greek yogurt"]],
    ["4-6 oz of salmon", ["5 oz salmon"]],
    ["chicken cooked in a tablespoon of olive oil", ["1 serving chicken breast", "1 tbsp olive oil"]],
    ["a burrito bowl with double chicken, no rice, black beans", ["2 serving chicken breast", "1 serving black beans"]],
    ["2 over easy eggs", ["2 egg egg"]],
    ["a large pepperoni pizza", ["1 large pepperoni pizza"]],
    ["5 almonds", ["5 piece almonds"]],
    ["chiken breast with brocoli", ["1 breast chicken breast", "1 serving broccoli"]],
  ])("%s", (text, want) => expect(show(text)).toEqual(want));

  it("a built dish with its ingredients listed counts the ingredients (plus its tortillas)", () => {
    expect(show("3 tacos with ground beef, cheese, lettuce and sour cream")).toEqual(["3 piece corn tortilla", "1 serving ground beef", "1 serving cheddar cheese", "1 serving salad", "1 serving sour cream"]);
  });
  it("a fixed dish keeps its toppings at half a portion and ignores the bread it's on", () => {
    expect(show("a pb&j on whole wheat and a glass of milk")).toEqual(["1 piece pb&j sandwich", "1 piece milk"]);
  });
  it("text before a ':' list is just a name", () => {
    expect(show("chicken and rice meal prep: 150g chicken, 200g rice")).toEqual(["150 g chicken breast", "200 g white rice"]);
  });
});

import { fromKind } from "@/lib/ai/nutrition";

describe("fromKind (foods not in the table)", () => {
  it("computes from the kind and a clamped weight", () => {
    const item = fromKind("carrot cake", 1, "slice", "bread, cake or baked goods", 110);
    expect(item).toMatchObject({ grams: 110, calories: 374, source: "estimate" });
    expect(fromKind("mystery", 1, "slice", "bread, cake or baked goods", 5000).grams).toBe(200);
    expect(fromKind("mystery", 1, "bowl", "not a kind", undefined).grams).toBe(350);
  });
  it("uses explicit weights as given", () => expect(fromKind("mystery stew", 300, "g", "soup or stew", 999).grams).toBe(300));
  it("large gram quantities survive", () => expect(resolveItem({ food: "chicken breast", quantity: 200, unit: "g" })!.calories).toBe(330));
});

import { kindFor } from "@/lib/nutrition-foods";

describe("kindFor", () => {
  it.each([
    ["carrot cake", "bread, cake or baked goods"],
    ["chicken caesar wrap", "sandwich, wrap, burger or pizza"],
    ["gummy bears", "dessert or candy"],
    ["strawberry milk", "milk drink, smoothie or shake"],
    ["chicken alfredo", "rice, noodle or pasta dish"],
    ["lentil soup", "soup or stew"],
  ])("%s → %s", (name, kind) => expect(kindFor(name)).toBe(kind));
  it("no guess for truly unknown names", () => expect(kindFor("durian mochi")).toBeNull());
});

import { estimateNutrition } from "@/lib/ai/nutrition";
import { needsAmount, questionsFor } from "@/lib/nutrition-ask";

describe("micronutrients", () => {
  it("a banana has about 422 mg potassium and 10 mg vitamin C", async () => {
    const d = await estimateNutrition("a banana");
    expect(d.micros?.potassium).toBeCloseTo(422, -1);
    expect(d.micros?.vitaminC).toBeCloseTo(10.3, 0);
  });
  it("sums across foods and scales by weight", async () => {
    const d = await estimateNutrition("1 cup of spinach and 100g of salmon");
    expect(d.micros?.vitaminA).toBeCloseTo(141 + 50, -1);
    expect(d.micros?.vitaminD).toBeCloseTo(13, 0);
    expect(d.micros?.sodium).toBeCloseTo(24 + 60, -1);
  });
});

describe("asking for amounts", () => {
  const ask = (t: string) => questionsFor(parseFoods(t)).map((q) => q.prompt);
  it("asks about a container with no standard size", () => {
    expect(ask("a bottle of coconut water")).toEqual(["How big was the bottle of coconut water?"]);
    expect(needsAmount(parseFoods("a can of coke")[0])).toBeNull(); // cans have a size
  });
  it("asks about unmeasured calorie-dense basics, at most two", () => {
    expect(ask("salmon and rice")).toEqual(["How much salmon?", "How much rice?"]);
    expect(ask("chicken, rice, beans and cheese")).toHaveLength(2);
  });
  it("doesn't ask when amounts are given or for light foods", () => {
    expect(ask("6 oz chicken and 1 cup of rice")).toEqual([]);
    expect(ask("a banana and an apple")).toEqual([]);
    expect(ask("broccoli and carrots")).toEqual([]);
    expect(ask("a chicken burrito")).toEqual([]);
  });
  it("doesn't ask about ingredients of a dish whose parts were listed", () => {
    expect(ask("3 tacos with ground beef, cheese, lettuce and sour cream")).toEqual([]);
  });
  it("asks about unknown foods with no amount", () => {
    expect(ask("durian")).toEqual(["How much durian?"]);
  });
  it("answers re-run the estimate", async () => {
    const d0 = await estimateNutrition("a bottle of coconut water");
    const key = d0.questions![0].key;
    const d = await estimateNutrition("a bottle of coconut water", { amounts: { [key]: "500 ml" } });
    expect(d.questions).toEqual([]);
    expect(d.totals.calories).toBe(95);
    const t = await estimateNutrition("salmon and rice", { amounts: { 0: "8 oz", 1: "typical" } });
    expect(t.items[0].grams).toBe(227);
    expect(t.questions).toEqual([]);
  });
});
