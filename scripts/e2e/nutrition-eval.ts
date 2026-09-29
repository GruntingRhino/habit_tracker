/**
 * Accuracy check for the nutrition estimator on realistic descriptions (live model for the few
 * foods not in the table). Ranges are real-world values (USDA / restaurant data), ±~15%.
 * Usage: OLLAMA_BASE_URL=… npx tsx --tsconfig tsconfig.json scripts/e2e/nutrition-eval.ts
 */
import { estimateNutrition } from "@/lib/ai/nutrition";

type Case = { text: string; kcal: [number, number]; protein?: [number, number]; foods?: string[] };
const c = (text: string, kcal: [number, number], protein?: [number, number], foods?: string[]): Case => ({ text, kcal, protein, foods });

const CASES: Case[] = [
  // Specific, ingredient-level descriptions
  c("cauliflower rice with carrots, peas and corn with 6 oz of chicken", [400, 560], [52, 70], ["cauliflower rice", "carrots", "peas", "corn", "chicken"]),
  c("1 cup cauliflower rice, 1/4 cup each of carrots, peas and corn, and 6oz grilled chicken", [340, 450], [52, 66]),
  c("2 cups of cauliflower rice stir fried with 1 tbsp soy sauce, 1 tbsp sesame oil and 200g of shrimp", [320, 450], [44, 60]),
  c("8 oz of 93% lean ground turkey with a cup of brown rice and a cup of broccoli", [600, 800], [55, 75]),
  c("1.5 cups of cooked quinoa with half an avocado and a cup of black beans", [580, 780], [22, 36]),
  c("3 scrambled eggs with a slice of cheddar and a slice of sourdough toast", [380, 500], [25, 36]),
  c("half a cup of oats with a cup of almond milk, a tablespoon of chia seeds and a handful of blueberries", [250, 340]),
  c("a pound of chicken breast", [700, 800], [130, 150]),
  c("1 and a half cups of white rice", [280, 340]),
  c("¾ cup of greek yogurt with 2 tbsp of honey", [200, 260], [14, 20]),
  c("a 6 oz salmon fillet with asparagus and a baked potato with a tablespoon of butter and 2 tablespoons of sour cream", [580, 760], [38, 50]),
  c("chicken fajita bowl: 5 oz chicken, peppers and onions, half a cup of rice, salsa and a quarter of an avocado", [380, 540], [40, 55]),
  c("2 slices of whole wheat toast with 2 tbsp peanut butter and a sliced banana", [400, 500]),
  c("a protein shake: 2 scoops whey, 1 cup oat milk, 1 banana and a tbsp of peanut butter", [490, 620], [50, 62]),
  c("turkey sandwich on sourdough with lettuce, tomato, mayo and swiss cheese", [450, 650], [22, 40]),
  c("6 oz sirloin steak with a cup of roasted sweet potatoes and green beans", [480, 660], [40, 56], ["steak", "sweet potato", "green beans"]),
  c("2 cups of whole wheat pasta with a cup of marinara and 4 oz of ground beef", [650, 870], [40, 55]),
  c("tuna salad made with a can of tuna, 2 tbsp mayo and celery on 2 slices of wheat bread", [450, 590], [40, 52]),
  c("3 oz of feta, a cucumber, 2 tomatoes and 2 tbsp of olive oil", [480, 620]),
  c("a Chipotle bowl with chicken, white rice, black beans, fajita veggies, salsa, cheese and guac", [850, 1150], [60, 85]),
  c("a large apple with 2 tablespoons of almond butter", [260, 330]),
  c("a medium coffee with 2 tbsp of half and half and a teaspoon of sugar", [40, 90]),
  c("a grande oat milk latte", [180, 280]),
  c("5 oz of cod baked with lemon and a cup of couscous", [290, 400], [33, 45]),
  c("two chicken thighs, skin on, with roasted brussels sprouts", [440, 600], [52, 68]),
  c("1 cup of cottage cheese with pineapple chunks", [260, 340], [22, 30]),
  c("3 tacos with ground beef, cheese, lettuce and sour cream", [520, 780], [30, 48]),
  c("a bowl of pho with extra brisket", [450, 650]),
  c("a slice of pepperoni pizza, a side salad with ranch and a diet coke", [420, 520]),
  c("a chicken burrito from chipotle with rice, beans, cheese and sour cream", [950, 1300], [65, 95]),
  c("grilled chicken wrap with lettuce, tomato and ranch", [480, 720], [40, 60]),
  c("salmon and rice", [450, 600]),
  c("100g chicken, 100g rice, 100g broccoli", [320, 340], [34, 38]),
  c("a can of tuna mixed with a tablespoon of mayo", [240, 280]),
  c("a bagel with cream cheese and lox", [380, 500]),
  c("overnight oats: 1/2 cup oats, 1/2 cup greek yogurt, 1/2 cup milk, 1 tbsp honey and berries", [340, 460]),
  c("egg white omelette with 4 egg whites, spinach, mushrooms and feta", [130, 230], [18, 26]),
  c("pad thai with shrimp", [600, 950]),
  c("a smoothie with a banana, a cup of frozen strawberries, a scoop of protein and a cup of almond milk", [270, 350], [25, 32]),
  c("4-6 oz of salmon", [260, 330]),
  c("chicken cooked in a tablespoon of olive oil", [290, 400]),
  c("chicken breast, 6 oz, and rice (1 cup)", [440, 530], [53, 62]),
  c("a 12 oz ribeye", [780, 920]),
  c("6oz chicken and 1 cup rice and half cup black beans", [560, 640]),
  c("2 eggs + 2 strips of bacon + a slice of toast", [280, 360]),
  c("a bowl of oatmeal with a banana and a tbsp of peanut butter", [330, 400]),
  c("3 egg omelette with cheese, peppers and onions", [330, 460], [22, 32], ["egg"]),
  // Everyday short descriptions
  c("2 eggs, 2 slices of toast with butter and a banana", [400, 540]),
  c("chicken burrito", [550, 850]),
  c("3 slices of pepperoni pizza and a coke", [1000, 1300]),
  c("big mac and medium fries", [800, 1050]),
  c("6 chicken nuggets", [230, 340]),
  c("a latte and a croissant", [350, 480]),
  c("an apple", [80, 110]),
  c("a handful of almonds", [140, 190]),
  c("I had mac and cheese for lunch", [250, 450]),
  // Not in the table: kind + portion from code, model only if the kind is unclear
  c("a slice of carrot cake", [250, 500]),
  c("a bowl of ramen from a restaurant", [450, 1100]),
  c("a chicken caesar wrap", [400, 800]),
  c("a handful of gummy bears", [100, 250]),
];

// Held out: written after the parser was built, to check it generalizes (typos, chains, negations, counts).
CASES.push(
  c("7 oz chicken thigh with a cup of jasmine rice and bok choy", [560, 720], [48, 62]),
  c("a cup of plain nonfat greek yogurt topped with 1/4 cup granola and some raspberries", [300, 400], [22, 30]),
  c("two slices of sourdough, 2 over easy eggs and half an avocado", [470, 600]),
  c("a 5oz filet mignon, mashed potatoes and a side of steamed broccoli", [480, 700], [38, 52]),
  c("4 oz ground beef burger on a bun with a slice of american cheese, ketchup and mustard", [470, 620], [30, 42]),
  c("a turkey club wrap", [500, 750]),
  c("2 cups of spinach, 4 oz grilled chicken, 1/4 cup feta, cherry tomatoes and 2 tbsp balsamic vinaigrette", [340, 460], [40, 52]),
  c("a venti iced caramel macchiato", [250, 380]),
  c("1 cup of chickpeas roasted with a tablespoon of olive oil", [350, 430]),
  c("chiken breast with brocoli and rice", [400, 550], [38, 60]),
  c("a bowl of chili with cheese and crackers", [400, 560]),
  c("grilled salmon 200g, quinoa 150g and a salad", [550, 670], [48, 58]),
  c("a large pepperoni pizza", [2000, 2800]),
  c("half a large pizza", [1000, 1400]),
  c("a footlong turkey sub", [500, 800]),
  c("2 hard boiled eggs and a string cheese", [200, 260]),
  c("a cup of black coffee", [0, 15]),
  c("a pint of beer and a basket of wings", [650, 1200]),
  c("10 wings", [800, 1050]),
  c("a scoop of vanilla ice cream on a slice of apple pie", [400, 560]),
  c("a bowl of cereal with milk", [230, 340]),
  c("a sweetgreen harvest bowl", [400, 900]),
  c("chicken tikka masala with naan and basmati rice", [750, 1100]),
  c("sushi: 2 salmon rolls and a spicy tuna roll", [700, 1050]),
  c("a large coffee with oat milk and 2 pumps of vanilla", [30, 130]),
  c("a burrito bowl with double chicken, no rice, black beans, fajitas, cheese, lettuce and salsa", [600, 900], [70, 105]),
  c("an 8 piece chicken mcnugget meal with medium fries and a medium coke", [780, 1000]),
  c("5 almonds", [25, 45]),
  c("a handful of baby carrots with 2 tbsp hummus", [60, 100]),
  c("1/2 cup of dry oats cooked with water, a scoop of whey and a tbsp of almond butter", [330, 420], [30, 40]),
);

// Held out, round 2: written before running, never tuned against.
const HELD_OUT_2: Case[] = [
  c("2 whole wheat english muffins with 2 slices of turkey bacon and 2 egg whites", [320, 420]),
  c("a cup of lentil soup and a piece of bread", [180, 330]),
  c("a chicken shawarma plate with rice, hummus and salad", [500, 900]),
  c("grilled cheese and tomato soup", [550, 800]),
  c("a venti cold brew with sweet cream", [50, 200]),
  c("1 cup of edamame and a seltzer", [170, 210]),
  c("a bacon egg and cheese on a roll", [400, 600]),
  c("2 cups of mixed greens, half a cucumber, a hard boiled egg and 2 tbsp of ranch", [210, 300]),
  c("a slice of cheesecake and a cappuccino", [450, 650]),
  c("250g of greek yogurt with 30g of granola and 100g of strawberries", [300, 345]),
  c("a chipotle chicken salad with fajitas, black beans, salsa and vinaigrette", [480, 700]),
  c("3 pancakes with butter and syrup", [600, 850]),
  c("a handful of pretzels and a diet dr pepper", [90, 150]),
  c("a big salad with grilled chicken, avocado, corn, black beans and lime dressing", [550, 850]),
  c("a strawberry banana smoothie from smoothie king", [220, 450]),
  c("an iced coffee with 2% milk", [5, 80]),
  c("beef and broccoli with fried rice", [500, 800]),
  c("a slice of watermelon and a peach", [120, 180]),
  c("a 6 inch italian sub", [350, 600]),
  c("a cup of mac and cheese and 4 oz of bbq pulled pork", [520, 720]),
  c("3 oz of beef jerky", [300, 380]),
  c("a large fries and a large diet coke", [420, 540]),
  c("a bowl of greek yogurt with honey, walnuts and berries", [300, 480]),
  c("2 slices of cheese pizza and garlic knots", [700, 1000]),
  c("protein pancakes made with 1 scoop whey, 1 banana and 2 eggs", [330, 420]),
];
// Held out, round 3: written before running, never tuned against.
const HELD_OUT_3: Case[] = [
  c("a turkey burger with sweet potato fries", [650, 1000]),
  c("2 tbsp of peanut butter on a rice cake", [200, 250]),
  c("a mocha with whipped cream", [250, 500]),
  c("half a chicken breast and a cup of green beans", [160, 220]),
  c("leftover lasagna, about 2 cups", [650, 900]),
  c("a small order of chicken fried rice", [400, 800]),
  c("a tuna poke bowl", [450, 800]),
  c("two hot dogs with ketchup and a bag of chips", [550, 720]),
  c("1 cup of cooked spinach sauteed in 1 tsp of garlic butter", [50, 110]),
  c("a chicken quesadilla with sour cream and guac", [650, 1000]),
  c("a greek salad with chicken", [350, 600]),
  c("2 scoops of ice cream in a waffle cone", [330, 450]),
  c("a slice of avocado toast with an egg", [230, 340]),
  c("3 oz of grilled shrimp over a bed of zucchini noodles with marinara", [140, 230]),
  c("a kind bar and a banana", [260, 360]),
  c("chicken and rice meal prep: 150g chicken, 200g rice, 100g broccoli", [520, 560]),
  c("a double double from in n out", [550, 800]),
  c("a cup of rice and a cup of dal", [350, 480]),
  c("an everything bagel with 2 tbsp of cream cheese", [330, 420]),
  c("a pb&j on whole wheat and a glass of milk", [400, 520]),
];
// Held out, round 4: written after round 3's fixes, run once to re-measure.
const HELD_OUT_4: Case[] = [
  c("a bowl of brown rice with black beans, corn, salsa and a fried egg", [520, 720]),
  c("8 oz of sirloin and a baked sweet potato with cinnamon", [600, 780], [55, 70]),
  c("2 slices of white bread with 3 slices of ham and a slice of swiss", [330, 430]),
  c("a medium iced vanilla latte with oat milk", [180, 300]),
  c("a cup of cooked lentils with a cup of spinach and a tbsp of olive oil", [320, 400]),
  c("a chicken caesar salad", [350, 700]),
  c("2 scrambled eggs with a handful of spinach and 1/4 cup shredded cheese", [240, 340]),
  c("a bowl of spaghetti with marinara and 3 meatballs", [550, 850]),
  c("4 chicken tenders with honey mustard", [350, 600]),
  c("a steak burrito with rice, beans, cheese and pico", [900, 1250]),
  c("a cup of cottage cheese and a sliced peach", [250, 320]),
  c("a whopper, small fries and a sprite", [950, 1250]),
  c("2 cups of mixed vegetables stir fried in a tbsp of oil with 5 oz tofu", [480, 620]),
  c("a slice of chocolate cake", [300, 500]),
  c("a 16 oz strawberry smoothie", [220, 380]),
  c("1 cup of white rice with teriyaki chicken, about 5 oz", [440, 560]),
  c("a scoop of whey in water", [110, 130]),
  c("a handful of grapes and a string cheese", [130, 180]),
  c("a salmon poke bowl with extra avocado", [550, 900]),
  c("chickn thigh with rice and brocoli", [450, 650]),
];
// Held out, round 5: the owner's own style (ingredient lists with amounts). Written before running.
const HELD_OUT_5: Case[] = [
  c("zucchini noodles with 4 oz of ground turkey, half a cup of marinara and parmesan", [300, 400], [30, 40]),
  c("1 cup jasmine rice, 5 oz grilled salmon, cucumber and a tablespoon of soy sauce", [470, 580], [32, 42]),
  c("2 eggs scrambled in a teaspoon of butter with 1/2 cup of black beans and salsa", [270, 340]),
  c("3/4 cup oats cooked in milk with a banana and cinnamon", [400, 520]),
  c("6 oz chicken thigh, 1 cup roasted broccoli and 1/2 cup quinoa", [450, 560], [45, 58]),
  c("a wrap with 3 oz turkey, a slice of provolone, spinach and mustard", [330, 460]),
  c("a bowl of 1 cup brown rice, 4 oz tofu, edamame and a drizzle of sriracha", [520, 660]),
  c("8 oz of plain greek yogurt, 1/4 cup blueberries and 1 tbsp of chia seeds", [190, 240]),
  c("a sandwich with 2 slices of rye bread, 4 oz of roast beef, lettuce and horseradish", [280, 380]),
  c("salmon, 6 oz, with a cup of asparagus and half a baked potato", [410, 510]),
  c("stir fry: 5 oz shrimp, 2 cups of broccoli and bell peppers, 1 tbsp oil and 1 cup of rice", [480, 620]),
  c("1 cup of cooked black beans, 1/2 avocado, 1/2 cup corn and 2 tbsp salsa", [380, 480]),
  c("4 slices of turkey bacon, 2 eggs and a cup of fruit", [330, 420]),
  c("3 oz of steak, 1/2 cup of mashed potatoes and 1 cup of green beans", [320, 420]),
  c("a cup of cooked pasta with 1/4 cup pesto and 2 oz of chicken", [520, 650]),
  c("2 corn tortillas with 3 oz of carnitas, onion, cilantro and lime", [310, 420]),
  c("a smoothie: 1 cup almond milk, 1 cup frozen mango, 1 scoop protein and 1 tbsp almond butter", [320, 390]),
  c("1.5 cups of chicken noodle soup and 6 saltine crackers", [190, 260]),
  c("a baked sweet potato topped with 1/2 cup cottage cheese and a tbsp of honey", [250, 310]),
  c("grilled chicken (5 oz) with a side of rice and steamed carrots", [420, 520]),
];
if (process.argv[2] === "heldout5") CASES.splice(0, CASES.length, ...HELD_OUT_5);
else if (!["heldout2", "heldout3", "heldout4"].includes(process.argv[2] ?? "")) CASES.push(...HELD_OUT_5);
if (process.argv[2] === "heldout4") CASES.splice(0, CASES.length, ...HELD_OUT_4);
else if (!["heldout2", "heldout3", "heldout5"].includes(process.argv[2] ?? "")) CASES.push(...HELD_OUT_4);
if (process.argv[2] === "heldout3") CASES.splice(0, CASES.length, ...HELD_OUT_3);
else if (!["heldout2", "heldout4", "heldout5"].includes(process.argv[2] ?? "")) CASES.push(...HELD_OUT_3);
if (process.argv[2] === "heldout2") CASES.splice(0, CASES.length, ...HELD_OUT_2);
else if (!["heldout3", "heldout4", "heldout5"].includes(process.argv[2] ?? "")) CASES.push(...HELD_OUT_2);

(async () => {
  let ok = 0;
  const bad: string[] = [];
  for (const k of CASES) {
    const t = Date.now();
    const d = await estimateNutrition(k.text);
    const problems = [
      d.totals.calories < k.kcal[0] || d.totals.calories > k.kcal[1] ? `kcal ${d.totals.calories} ∉ ${k.kcal.join("-")}` : null,
      k.protein && (d.totals.protein < k.protein[0] || d.totals.protein > k.protein[1]) ? `protein ${d.totals.protein} ∉ ${k.protein.join("-")}` : null,
      ...(k.foods ?? []).filter((f) => !d.items.some((i) => i.name.includes(f.split(" ")[0]))).map((f) => `missing ${f}`),
    ].filter(Boolean);
    if (!problems.length) ok++;
    else bad.push(k.text);
    console.log(`${problems.length ? "✗" : "✓"} ${String(d.totals.calories).padStart(5)} kcal P${String(Math.round(d.totals.protein)).padStart(3)} (${((Date.now() - t) / 1000).toFixed(1)}s) ${k.text}${problems.length ? `\n      [${problems.join("; ")}]  ${d.items.map((i) => `${i.name}[${i.amount}]=${i.calories}`).join("  ")}` : ""}`);
  }
  console.log(`\n${ok}/${CASES.length} within range`);
})();
