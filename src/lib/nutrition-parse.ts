import { findFood, INDEX, normalizeUnit, UNIT_ALIASES, GENERIC_UNITS, type Food } from "@/lib/nutrition-foods";

/**
 * Meal description → foods with amounts, without a model.
 *
 *   "cauliflower rice with carrots, peas and corn with 6 oz of chicken"
 *   "1 cup cauliflower rice, 1/4 cup each of carrots, peas and corn, and 6oz grilled chicken"
 *   "3 tacos with ground beef, cheese, lettuce and sour cream"   (a built dish → its ingredients)
 *
 * `unit` is "serving" when no amount was given (the food's typical portion), "piece" for a bare
 * count ("2 eggs"), otherwise the stated unit.
 */
export interface ParsedFood {
  text: string;
  quantity: number;
  unit: string;
  food: Food | null;
  /** An amount was stated ("a", "2", "6 oz"); false for bare mentions ("with rice"). */
  explicit: boolean;
  /** Part of a dish whose ingredients were listed (never asked about individually). */
  component?: boolean;
}

// ── Normalization ────────────────────────────────────────────────────────────

const FRACTIONS: Record<string, string> = { "½": ".5", "¼": ".25", "¾": ".75", "⅓": ".33", "⅔": ".67", "⅛": ".125" };

const NUMBER_PHRASES: [RegExp, string][] = [
  [/\b(\d+) and (a|one) half\b/g, "$1.5"],
  [/\bone and (a|one) half\b/g, "1.5"],
  [/\btwo and (a|one) half\b/g, "2.5"],
  [/\b(\d+) (\d)\/(\d)\b/g, "$1+$2/$3"],
  [/\bhalf (a )?dozen\b/g, "6"],
  [/\b(a )?dozen\b/g, "12"],
  [/\bthree quarters? (of )?(a |an )?/g, "0.75 "],
  [/\b(a |one )?quarter (of )?(a |an )?/g, "0.25 "],
  [/\b(a |one )?third (of )?(a |an )?/g, "0.33 "],
  [/\btwo thirds? (of )?(a |an )?/g, "0.67 "],
  [/\bhalf (of )?(a |an )?/g, "0.5 "],
  [/\ba half\b/g, "0.5"],
  [/\b(a couple|couple) (of )?/g, "2 "],
  [/\b(a few|few) /g, "3 "],
  [/\b(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\b/g, "RANGE$1_$2"],
  [/\b(about|around|roughly|approximately|approx|maybe|like|~|nearly|almost) (?=\d|a |an |one |two |half)/g, ""],
  [/\bfl\.? ?oz\b/g, "floz"],
  [/\bx amount of\b/g, ""],
];

function normalize(input: string) {
  let t = input
    .toLowerCase()
    .replace(/(\d)?\s?([½¼¾⅓⅔⅛])/g, (_m, w, f) => ` ${(w ? Number(w) : 0) + Number(`0${FRACTIONS[f]}`)} `)
    .replace(/\bw\/\s?/g, " with ")
    // "dinner was salmon, rice…", "for lunch i had…": the meal label isn't a food.
    .replace(/\b(breakfast|brunch|lunch|dinner|snack)\s*(was|is|:|-)\s*/g, " ")
    .replace(/^\s*(for\s+)?(breakfast|brunch|lunch|dinner|snack)\s+(i\s+)?(had|ate)\s+/g, " ")
    .replace(/\bhalf ?(and|&|n|-) ?half\b/g, "creamer")
    .replace(/\b(over ?(easy|medium|hard|well)|sunny ?side ?up)\b/g, " ")
    .replace(/\b(12|twelve) ?(-| )?inch\b|\bfoot ?long\b/g, " footlong ")
    .replace(/\b(a )?(bed|pile|mound|side|splash|drizzle|dollop|sprinkle) of\b/g, (m) => (/splash|drizzle|dollop|sprinkle/.test(m) ? " a tbsp of " : " "))
    .replace(/\b(6|six) ?(-| )?inch\b/g, " ")
    .replace(/[^a-z0-9&,;:+%_ ./\-]/g, " ")
    .replace(/(?<!\d)\.|\.(?!\d)/g, ",") // sentence periods split; decimals stay
    .replace(/(?<!\d)\/|\/(?!\d)/g, " ")
    .replace(/(?<![a-z0-9])-|-(?![a-z0-9])/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [re, to] of NUMBER_PHRASES) t = t.replace(re, to);
  t = t.replace(/RANGE(\d+(?:\.\d+)?)_(\d+(?:\.\d+)?)/g, (_m, a, b) => String((Number(a) + Number(b)) / 2));
  t = t.replace(/(\d+)\+(\d)\/(\d)/g, (_m, w, n, d) => String(Number(w) + Number(n) / Number(d)));
  t = t.replace(/\b(\d+)\/(\d+)\b/g, (_m, n, d) => String(Math.round((Number(n) / Number(d)) * 1000) / 1000));
  return t
    .replace(/^(so |ok |okay |today |this morning |for (breakfast|lunch|dinner|brunch) )*(i |i've |ive )?(just )?(had|ate|eaten|drank|drink|got|grabbed|made|snacked on|finished|am having|having)\s+/, "")
    .replace(/\b(for|at) (breakfast|lunch|dinner|brunch|snack)\b[^,]*/g, "")
    .replace(/\b(from|at) (chipotle|mcdonalds|mcdonald s|starbucks|subway|panera|chick fil a|taco bell|wendys|wendy s|the \w+|a \w+ place|home|work|school|the gym)\b/g, "")
    .replace(/\bfrom [a-z' ]{2,30}$/g, "")
    .replace(/\b(today|this morning|tonight|earlier|yesterday|last night)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Vocabulary ───────────────────────────────────────────────────────────────

const WORD_NUMBERS: Record<string, number> = { a: 1, an: 1, one: 1, single: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, some: 1, another: 1, extra: 0.5, double: 2, triple: 3 };
const UNITS = new Set([
  "piece", "slice", "strip", "link", "cup", "tbsp", "tsp", "scoop", "can", "glass", "bowl", "plate", "serving", "bar", "bottle", "fillet", "patty", "handful",
  "pack", "roll", "mug", "pint", "stick", "container", "ear", "cob", "stalk", "spear", "wedge", "box", "bag", "half", "pump", "basket", "order", "footlong", "pie",
  ...Object.keys(UNIT_ALIASES), ...Object.keys(GENERIC_UNITS),
]);
const SIZES = new Set(["small", "medium", "large", "big", "huge", "regular", "jumbo", "whole"]);
/** Segment openers that carry no food: "on the side", "skin on", "cooked in …" is handled as a separator. */
const NOISE = new Set(["the", "side", "top", "it", "them", "skin", "skinless", "boneless", "extra", "light", "lightly", "fresh", "bit", "little", "some", "salt", "pepper", "seasoning", "spices", "garlic", "herbs", "lemon pepper", "sauce on the side", "please", "too", "also", "each"]);

/** Dishes whose listed ingredients replace the generic dish, and what to add if not listed. */
interface Built {
  carrier?: { food: string; quantity: number; unit: string };
  /** Always part of the dish unless listed: a quesadilla is mostly cheese. */
  core?: { food: string; quantity: number; unit: string; unless: RegExp };
}
const BUILT: Record<string, Built> = {
  sandwich: { carrier: { food: "white bread", quantity: 2, unit: "slice" } },
  blt: { carrier: { food: "white bread", quantity: 2, unit: "slice" } },
  burger: { carrier: { food: "hamburger bun", quantity: 1, unit: "piece" } },
  burrito: { carrier: { food: "flour tortilla", quantity: 2.2, unit: "piece" } },
  "breakfast burrito": { carrier: { food: "flour tortilla", quantity: 1.5, unit: "piece" } },
  quesadilla: { carrier: { food: "flour tortilla", quantity: 2, unit: "piece" }, core: { food: "swiss cheese", quantity: 2, unit: "oz", unless: /cheese|cheddar|mozzarella|jack|feta/ } },
  taco: { carrier: { food: "corn tortilla", quantity: 1, unit: "piece" } },
  "burrito bowl": {},
  "chipotle burrito bowl": {},
  salad: {},
  "caesar salad": {},
  "chicken salad": {},
  smoothie: {},
  "stir fry": {},
};
const WRAP_WORDS = /\b(wrap|wraps)\b/;
const BREADS = new Set(["white bread", "whole wheat bread", "sourdough", "bagel", "english muffin", "croissant", "hamburger bun", "pita", "naan", "flour tortilla", "corn tortilla"]);
const DISH_WORDS = /\b(sandwich|sandwiches|sub|wrap|wraps|burrito|burritos|bowl|bowls|salad|salads|taco|tacos|quesadilla|burger|burgers|smoothie|shake|omelette|omelet|omelettes|scramble|stir fry|plate|platter|toast)\b/;

/** Dish names containing "and"/"with"/"&", protected from splitting. */
const COMPOUND = INDEX.map(([n]) => n)
  .filter((n) => / (and|with) |&/.test(n))
  .sort((a, b) => b.length - a.length);

const SEPARATORS =
  /\s*(,|;|\+|:|\bmade with\b|\bmade of\b|\bconsisting of\b|\bcontaining\b|\btopped with\b|\btopped off with\b|\bserved (?:with|over|on)\b|\b(?:stir )?(?:cooked|fried|sauteed|sauted|roasted|baked|grilled|tossed|drizzled|mixed|scrambled|blended) (?:in|with)\b|\balong with\b|\bwithout\b|\bwith\b|\bw\/|\bon top of\b|\bon\b|\bover\b|\binto\b|\bin\b|\band then\b|\bthen\b|\band\b|\bplus\b|\s&\s)\s*/;
const LIST_OPENERS = new Set([":", "made with", "made of", "consisting of", "containing"]);
const HEAD_OPENERS = new Set(["with", "w/", "on", "topped with", "topped off with", "served with", "served over", "served on", ...LIST_OPENERS]);

// ── Parsing ──────────────────────────────────────────────────────────────────

interface Segment {
  text: string;
  sep: string; // separator before this segment ("" for the first)
}

function splitSegments(text: string): Segment[] {
  let t = text;
  COMPOUND.forEach((c, i) => {
    t = t.replace(new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), `compound${i}x`);
  });
  const parts = t.split(SEPARATORS);
  const out: Segment[] = [];
  let sep = "";
  for (let i = 0; i < parts.length; i++) {
    const p = (parts[i] ?? "").trim();
    if (i % 2 === 1) {
      sep = p.replace(/\s+(in|with)$/, (m) => m) || sep;
      continue;
    }
    const restored = p.replace(/compound(\d+)x/g, (_m, n) => COMPOUND[Number(n)]).trim();
    if (restored) out.push({ text: restored, sep });
    sep = "";
  }
  return out;
}

function parseSegment(raw: string): ParsedFood | null {
  if (/^(no|without|hold the|minus|except|skip the|no extra)\b/.test(raw)) return null;
  let words = raw.split(" ").filter(Boolean);
  let quantity = 1;
  let unit = "";
  let explicit = false;
  let each = false;
  if (words.includes("each")) {
    each = true;
    words = words.filter((w) => w !== "each");
  }
  // Leading quantity: 2, 0.5, 6oz, "a", "two", "extra".
  const attached = /^(\d+(?:\.\d+)?)(g|oz|ml|kg|lb|lbs|floz)$/.exec(words[0] ?? "");
  if (attached) {
    quantity = Number(attached[1]);
    unit = attached[2];
    explicit = true;
    words.shift();
  } else if (/^\d+(\.\d+)?$/.test(words[0] ?? "")) {
    quantity = Number(words.shift());
    explicit = true;
  } else if (WORD_NUMBERS[words[0] ?? ""] !== undefined && words.length > 1) {
    quantity = WORD_NUMBERS[words.shift()!];
    explicit = true;
  }
  // A second number ("a 6 oz salmon", "a 5oz filet", "one 12 oz steak").
  const attached2 = /^(\d+(?:\.\d+)?)(g|oz|ml|kg|lb|lbs|floz)$/.exec(words[0] ?? "");
  if (attached2 && words.length > 1) {
    quantity *= Number(attached2[1]);
    unit = attached2[2];
    explicit = true;
    words.shift();
  } else if (/^\d+(\.\d+)?$/.test(words[0] ?? "") && UNITS.has(words[1] ?? "")) quantity *= Number(words.shift());
  // "double chicken", "extra rice": portions, not pieces.
  const portionWord = /^(double|triple|extra)$/.test(raw.split(" ")[0] ?? "");
  // A bare amount after a comma ("chicken breast, 6 oz").
  if (explicit && words.length === 1 && UNITS.has(words[0]) && !findFood(words[0])) return { text: "", quantity, unit: normalizeUnit(words[0]), food: null, explicit: each };
  // Size and unit words.
  const whole = words.join(" ");
  const wholeFood = INDEX.find(([n]) => n === whole)?.[1];
  if (!wholeFood) {
    while (words.length > 1 && (SIZES.has(words[0]) || words[0] === "of")) {
      if (SIZES.has(words[0]) && !unit) unit = words[0];
      words.shift();
    }
    if (words.length > 1 && UNITS.has(words[0]) && !(SIZES.has(unit) && !UNITS.has(unit))) {
      unit = words.shift()!;
      explicit = true;
    } else if (words.length > 1 && UNITS.has(words[0])) {
      unit = words.shift()!;
    }
    while (words[0] === "of") words.shift();
  }
  // Trailing amount: "chicken 6 oz", "rice (1 cup)".
  const tail = / (\d+(?:\.\d+)?) ?(g|oz|ml|cups?|tbsp|tsp|grams|ounces|lbs?|pounds?)$/.exec(` ${words.join(" ")}`);
  if (tail && words.length >= 2) {
    quantity = Number(tail[1]);
    unit = tail[2];
    explicit = true;
    words = words.slice(0, words.length - (tail[0].trim().includes(" ") ? 2 : 1));
  }
  const name = words.join(" ").replace(/^(the|my|some|of)\s+/, "").trim();
  if (!name || name.split(" ").every((w) => NOISE.has(w))) {
    // Amount-only fragment ("2 scoops"): the caller attaches it to the previous food.
    return explicit ? { text: "", quantity, unit: normalizeUnit(unit), food: null, explicit: each } : null;
  }
  const food = findFood(name);
  // A protein word the match didn't cover ("shrimp greek salad" → greek salad + shrimp).
  const names = food ? [food.name, ...food.aliases].sort((a, b) => b.length - a.length) : [];
  const exactName = names.some((a) => a === name || a === name.replace(/(?<=[a-z]{3})s$/, ""));
  const covered = names.find((a) => name.endsWith(` ${a}`)) ?? "";
  const extraProtein = food && !exactName && !PROTEINS.test(food.name) && !BUILT[food.name] && !DISH_WORDS.test(name) && covered
    ? name.slice(0, name.length - covered.length).split(" ").map((w) => findFood(w)).find((f) => f && PROTEINS.test(f.name)) ?? null
    : null;
  // Sizes are real units for some foods ("a large pizza" is the whole pie); keep them before normalizing.
  let u = SIZES.has(unit) && food?.units?.[unit] ? unit : normalizeUnit(unit);
  if (SIZES.has(u) && !food?.units?.[u]) u = explicit ? "piece" : "serving";
  // The unit can be in the food's name: "2 salmon rolls" are rolls, not pieces.
  const lastWord = name.split(" ").pop()!.replace(/(?<=[a-z]{3})s$/, "");
  if (!unit && food?.units?.[lastWord] && lastWord !== "piece") u = lastWord;
  const article = /^(a|an|one|some|another)$/.test(raw.split(" ")[0] ?? "");
  if (!u) u = explicit && !portionWord && !(article && (food?.units?.piece ?? 99) < 15) ? "piece" : "serving";
  if (portionWord && (u === "piece" || !unit)) u = "serving";
  const main: ParsedFood = { text: name, quantity, unit: u, food, explicit: explicit || each };
  if (extraProtein) (main as ParsedFood & { with?: ParsedFood }).with = { text: extraProtein.name, quantity: 1, unit: "serving", food: extraProtein, explicit: false };
  return main;
}

/** The meat or main word in a dish name: "grilled chicken wrap" → chicken breast, "steak burrito" → steak. */
function dishFilling(name: string): Food | null {
  const rest = name.replace(DISH_WORDS, " ").replace(/\s+/g, " ").trim();
  if (!rest || rest === name) return null;
  const f = findFood(rest);
  if (f && !BUILT[f.name] && PROTEINS.test(f.name)) return f;
  // "chipotle chicken" → chicken: the first word in the name that is a protein on its own.
  for (const w of rest.split(" ")) {
    const g = findFood(w);
    if (g && PROTEINS.test(g.name)) return g;
  }
  return null;
}
const PROTEINS = /chicken|steak|beef|pork|turkey|salmon|tuna|shrimp|fish|tofu|brisket|egg|ham|bacon|sausage|lamb|tempeh/;

function builtKind(p: ParsedFood): Built | null {
  if (WRAP_WORDS.test(p.text)) return { carrier: { food: "flour tortilla", quantity: 1.5, unit: "piece" } };
  if (p.food && BUILT[p.food.name]) return BUILT[p.food.name];
  if (!p.food && DISH_WORDS.test(p.text)) return {};
  return null;
}

export { PROTEINS };

export function parseFoods(input: string): ParsedFood[] {
  const segments = splitSegments(normalize(input));
  const parsed: { seg: Segment; food: ParsedFood }[] = [];
  let eachAmount: { quantity: number; unit: string } | null = null;
  for (const seg of segments) {
    if (seg.sep === "without") continue;
    const p = parseSegment(seg.text);
    if (!p) continue;
    if (!p.text) {
      // "protein shake with 2 scoops" / "chicken, 6 oz": the amount belongs to the food before it.
      const prev = parsed[parsed.length - 1];
      if (prev) Object.assign(prev.food, { quantity: p.quantity, unit: p.unit || prev.food.unit, explicit: true });
      continue;
    }
    // "1/4 cup each of carrots, peas and corn": later bare items share the amount.
    if (seg.text.includes("each") && p.explicit) eachAmount = { quantity: p.quantity, unit: p.unit };
    else if (p.explicit) eachAmount = null;
    else if (eachAmount && (seg.sep === "," || seg.sep === "and")) Object.assign(p, eachAmount, { explicit: true });
    const extra = (p as ParsedFood & { with?: ParsedFood }).with;
    delete (p as ParsedFood & { with?: ParsedFood }).with;
    parsed.push({ seg, food: p });
    if (extra) parsed.push({ seg: { text: extra.text, sep: "and" }, food: extra });
  }
  if (!parsed.length) return [];

  // "coffee with oat milk": milk or creamer with no amount is a splash, not a glass.
  if (parsed[0]?.food.food && /coffee|latte|tea|cold brew|espresso/.test(parsed[0].food.text)) {
    for (const r of parsed.slice(1)) if (!r.food.explicit && r.food.food && /milk|cream/.test(r.food.food.name)) Object.assign(r.food, { quantity: 30 / r.food.food.serving, unit: "serving" });
  }
  // "chicken and rice meal prep: 150g chicken, 200g rice…": everything before the list is just a name.
  const lastList = parsed.map((p) => LIST_OPENERS.has(p.seg.sep)).lastIndexOf(true);
  if (lastList > 1) return parsed.slice(lastList).map((p) => p.food);
  // Head + ingredient list: "3 tacos with ground beef, cheese…", "overnight oats: 1/2 cup oats, …".
  const [head, ...rest] = parsed;
  const opener = rest[0]?.seg.sep ?? "";
  if (rest.length && HEAD_OPENERS.has(opener)) {
    const built = builtKind(head.food);
    const listed = LIST_OPENERS.has(opener);
    if ((built || listed) && rest.length >= 2) {
      // The ingredients describe the dish: count them instead of a generic dish.
      // Unmeasured meat inside a wrap, burrito, bowl or sandwich is about 4 oz, not a full plate portion.
      const items: ParsedFood[] = rest.map((r) => ({ ...(!r.food.explicit && r.food.food && PROTEINS.test(r.food.food.name) && r.food.food.serving > 113 ? { ...r.food, quantity: 113 / r.food.food.serving } : r.food), component: true }));
      const filling = head.food.food && !built ? null : dishFilling(head.food.text);
      if (filling && !items.some((i) => i.food?.name === filling.name)) {
        // "3 egg omelette" → 3 eggs; "2 chicken wraps" → 2 servings of chicken.
        const weighed = ["oz", "g", "lb", "kg", "ounce", "gram", "grams", "ounces", "pound", "pounds"].includes(head.food.unit);
        const count = head.food.explicit ? head.food.quantity : filling.name === "egg" ? 2 : 1;
        const portion = !weighed && filling.name !== "egg" && filling.serving > 113 ? 113 / filling.serving : 1;
        items.unshift({ text: filling.name, quantity: count * portion, unit: weighed ? head.food.unit : filling.name === "egg" ? "piece" : "serving", food: filling, explicit: head.food.explicit });
      }
      const core = built?.core;
      if (core && !items.some((i) => core.unless.test(i.text))) items.unshift({ text: "cheese", quantity: core.quantity, unit: core.unit, food: findFood(core.food), explicit: true });
      const carrier = built?.carrier;
      if (carrier && !items.some((i) => i.food && BREADS.has(i.food.name))) {
        const count = head.food.explicit ? head.food.quantity : 1;
        items.unshift({ text: carrier.food, quantity: carrier.quantity * count, unit: carrier.unit, food: findFood(carrier.food), explicit: true });
      }
      return items;
    }
    if (built === null && head.food.food && !isFixedDish(head.food.food)) {
      return parsed.map((p) => p.food); // "chicken with rice and beans": plain foods, all counted
    }
    // A fixed dish ("chili with cheese and crackers"): bare toppings count as half a portion;
    // bread it's served on ("a pb&j on whole wheat") is already part of the dish.
    return [
      head.food,
      ...rest
        .map((r) => r.food)
        .filter((f) => f.explicit || !(f.food && BREADS.has(f.food.name) || f.food?.name === "whole wheat bread"))
        .map((f) => (f.explicit ? f : { ...f, quantity: 0.5, unit: "serving", component: true })),
    ];
  }
  return parsed.map((p) => p.food);
}

const FIXED = new Set(["pizza", "pepperoni pizza", "pho", "ramen", "instant ramen", "curry with rice", "pad thai", "fried rice", "lasagna", "mac and cheese", "spaghetti with meat sauce", "chili", "chicken noodle soup", "sushi roll", "nachos", "bagel with cream cheese", "pb&j sandwich", "breakfast sandwich", "hot dog", "gyro", "bibimbap", "empanada", "enchilada"]);
function isFixedDish(food: Food) {
  return FIXED.has(food.name);
}
