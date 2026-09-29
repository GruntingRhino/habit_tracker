/**
 * Reference nutrition per 100 g (cooked/prepared as usually eaten), USDA-style averages.
 * `units` maps a unit to its typical gram weight for this food; `serving` is the default
 * portion when no amount is given.
 */
export interface Food {
  name: string;
  aliases: string[];
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  serving: number;
  units?: Record<string, number>;
}

const f = (name: string, aliases: string[], kcal: number, protein: number, carbs: number, fat: number, serving: number, units: Record<string, number> = {}): Food => ({ name, aliases, kcal, protein, carbs, fat, serving, units });

export const FOODS: Food[] = [
  // Eggs, dairy
  f("egg", ["eggs", "fried egg", "scrambled eggs", "boiled egg", "hard boiled egg", "omelet", "omelette", "over easy eggs", "sunny side up eggs", "poached egg"], 143, 12.6, 0.7, 9.5, 100, { piece: 50, egg: 50 }),
  f("egg white", ["egg whites"], 52, 10.9, 0.7, 0.2, 33, { piece: 33 }),
  f("milk", ["2% milk", "glass of milk"], 50, 3.3, 4.8, 2, 244, { cup: 244, glass: 244 }),
  f("whole milk", [], 61, 3.2, 4.8, 3.3, 244, { cup: 244, glass: 244 }),
  f("greek yogurt", ["plain greek yogurt", "nonfat greek yogurt"], 59, 10, 3.6, 0.4, 170, { cup: 227, container: 170 }),
  f("yogurt", ["flavored yogurt"], 85, 3.5, 13, 2, 170, { cup: 245, container: 170 }),
  f("cheddar cheese", ["cheese", "cheddar", "american cheese", "slice of cheese"], 403, 25, 1.3, 33, 28, { slice: 21, oz: 28, cup: 113 }),
  f("mozzarella", ["mozzarella cheese", "string cheese"], 280, 28, 3.1, 17, 28, { piece: 28, stick: 28, oz: 28 }),
  f("swiss cheese", ["swiss", "provolone", "pepper jack", "monterey jack", "shredded cheese", "mexican cheese"], 380, 27, 1.5, 29, 28, { slice: 21, oz: 28.35, cup: 113, tbsp: 7 }),
  f("feta", ["feta cheese", "goat cheese"], 264, 14, 4, 21, 28, { oz: 28.35, cup: 150, tbsp: 9 }),
  f("parmesan", ["parmesan cheese", "parm"], 431, 38, 4, 29, 10, { tbsp: 5, oz: 28.35, cup: 100 }),
  f("sour cream", [], 198, 2.4, 4.6, 19, 30, { tbsp: 12, cup: 230 }),
  f("heavy cream", ["whipping cream"], 340, 2.8, 2.8, 36, 15, { tbsp: 15, cup: 238 }),
  f("half and half", ["creamer", "coffee creamer"], 130, 3, 4.3, 11.5, 15, { tbsp: 15, cup: 242 }),
  f("oat milk", [], 48, 1, 6.7, 2.1, 240, { cup: 240, glass: 240 }),
  f("almond milk", ["unsweetened almond milk"], 15, 0.6, 0.6, 1.2, 240, { cup: 240, glass: 240 }),
  f("soy milk", [], 43, 3.3, 3, 1.8, 240, { cup: 240, glass: 240 }),
  f("cottage cheese", [], 98, 11, 3.4, 4.3, 226, { cup: 226 }),
  f("butter", [], 717, 0.9, 0.1, 81, 14, { tbsp: 14, tsp: 5, pat: 5 }),
  // Grains and starches
  f("white bread", ["bread", "toast", "slice of bread", "white toast"], 265, 9, 49, 3.2, 56, { slice: 28, piece: 28 }),
  f("whole wheat bread", ["wheat bread", "wheat toast", "whole grain bread", "whole wheat", "wheat", "multigrain bread", "ezekiel bread"], 247, 13, 41, 3.4, 64, { slice: 32, piece: 32 }),
  f("bagel", ["everything bagel", "plain bagel", "sesame bagel"], 250, 10, 49, 1.5, 105, { piece: 105 }),
  f("avocado toast", [], 210, 5, 20, 12, 120, { slice: 120, piece: 120 }),
  f("waffle cone", ["sugar cone", "ice cream cone", "cone"], 420, 7, 84, 6, 30, { piece: 30 }),
  f("english muffin", [], 227, 8.9, 44, 1.7, 57, { piece: 57 }),
  f("croissant", [], 406, 8.2, 45.8, 21, 57, { piece: 57 }),
  f("muffin", ["blueberry muffin"], 377, 5, 54, 16, 113, { piece: 113 }),
  f("oatmeal", ["porridge", "bowl of oatmeal", "cooked oats", "overnight oats"], 71, 2.5, 12, 1.5, 234, { cup: 234, bowl: 234 }),
  f("oats", ["rolled oats", "dry oats", "old fashioned oats", "quick oats", "oat"], 379, 13, 68, 6.5, 40, { cup: 81, tbsp: 5, scoop: 40 }),
  f("quinoa", [], 120, 4.4, 21.3, 1.9, 185, { cup: 185 }),
  f("couscous", [], 112, 3.8, 23.2, 0.2, 157, { cup: 157 }),
  f("whole wheat pasta", ["wheat pasta", "whole grain pasta"], 124, 5.3, 26.5, 1.4, 140, { cup: 140, bowl: 280 }),
  f("sourdough", ["sourdough bread", "sourdough toast"], 270, 11, 51, 2.4, 100, { slice: 50, piece: 50 }),
  f("pita", ["pita bread"], 275, 9, 56, 1.2, 60, { piece: 60 }),
  f("naan", ["naan bread"], 262, 9, 45, 5, 90, { piece: 90 }),
  f("hamburger bun", ["bun", "burger bun", "hot dog bun", "roll", "dinner roll", "brioche bun"], 280, 9.6, 49, 4.3, 50, { piece: 50 }),
  f("tortilla chips", [], 489, 7, 63, 23, 28, { handful: 28, oz: 28.35, bag: 28, serving: 28 }),
  f("hash browns", ["hash brown"], 272, 2.6, 35, 13, 80, { piece: 60, cup: 156 }),
  f("cereal", ["bowl of cereal", "corn flakes", "cheerios"], 379, 7, 84, 2.5, 30, { cup: 30, bowl: 45 }),
  f("granola", [], 471, 10, 64, 20, 60, { cup: 122 }),
  f("white rice", ["rice", "steamed rice", "jasmine rice", "basmati rice", "sushi rice"], 130, 2.7, 28, 0.3, 158, { cup: 158, bowl: 240 }),
  f("brown rice", [], 123, 2.7, 25.6, 1, 195, { cup: 195, bowl: 240 }),
  f("pasta", ["spaghetti", "noodles", "penne", "macaroni"], 158, 5.8, 31, 0.9, 140, { cup: 140, bowl: 280, plate: 280 }),
  f("pancake", ["pancakes"], 227, 6.4, 28, 9.7, 77, { piece: 77 }),
  f("waffle", ["waffles"], 291, 7.9, 33, 14, 75, { piece: 75 }),
  f("wrap", ["chicken wrap", "turkey wrap", "caesar wrap", "veggie wrap", "chicken caesar wrap", "club wrap", "buffalo chicken wrap"], 220, 12, 20, 10, 250, { piece: 250, half: 125 }),
  f("flour tortilla", ["tortilla", "tortilla wrap", "large tortilla"], 306, 8, 50, 8, 45, { piece: 45 }),
  f("corn tortilla", [], 218, 5.7, 44.6, 2.9, 26, { piece: 26 }),
  f("potato", ["baked potato", "boiled potato", "potatoes", "mashed potatoes", "roasted potatoes", "red potatoes"], 93, 2.5, 21, 0.1, 173, { piece: 173 }),
  f("sweet potato", ["sweet potatoes", "yam", "yams"], 90, 2, 21, 0.2, 114, { piece: 114 }),
  f("french fries", ["fries", "chips (fries)", "sweet potato fries"], 312, 3.4, 41, 15, 117, { serving: 117, small: 71, medium: 117, large: 154 }),
  // Meat, fish, protein
  f("chicken breast", ["chicken", "grilled chicken", "grilled chicken breast", "chicken breasts", "baked chicken", "shredded chicken", "diced chicken", "skinless chicken breast", "boneless chicken breast"], 165, 31, 0, 3.6, 120, { piece: 172, breast: 172, oz: 28.35 }),
  f("chicken thigh", ["chicken thighs"], 209, 26, 0, 10.9, 115, { piece: 115, oz: 28.35 }),
  f("fried chicken", [], 260, 20, 9, 16, 140, { piece: 140 }),
  f("chicken tenders", ["chicken strips", "chicken fingers", "chicken tender", "breaded chicken"], 260, 18, 14, 14, 135, { piece: 45 }),
  f("dipping sauce", ["honey mustard", "bbq dipping sauce", "sweet and sour", "buffalo dip", "chick fil a sauce", "polynesian sauce", "aioli"], 300, 0.5, 20, 25, 28, { tbsp: 15, cup: 28, piece: 28 }),
  f("spices", ["cinnamon", "salt", "pepper", "black pepper", "paprika", "cumin", "oregano", "chili powder", "garlic powder", "onion powder", "italian seasoning", "everything seasoning", "red pepper flakes"], 5, 0.2, 1, 0.1, 2, { tsp: 2, tbsp: 6, pinch: 0.5 }),
  f("chicken caesar salad", ["grilled chicken caesar", "chicken caesar"], 170, 12, 6, 11, 300, { bowl: 300, piece: 300 }),
  f("chicken nuggets", ["nuggets", "chicken mcnuggets", "mcnuggets", "nuggies"], 296, 15, 16, 19, 96, { piece: 16 }),
  f("ground beef", ["beef", "hamburger meat", "burger patty", "beef patty"], 254, 26, 0, 17, 113, { patty: 113, piece: 113, oz: 28.35 }),
  f("steak", ["sirloin", "ribeye", "beef steak", "sirloin steak", "ribeye steak", "flank steak", "skirt steak", "new york strip", "strip steak", "filet mignon", "t-bone", "t bone steak", "steak tips"], 250, 26, 0, 16, 200, { piece: 200, oz: 28.35 }),
  f("pork chop", ["pork"], 231, 25.7, 0, 13.9, 150, { piece: 150, oz: 28.35 }),
  f("bacon", [], 541, 37, 1.4, 42, 16, { slice: 8, strip: 8, piece: 8 }),
  f("sausage", ["breakfast sausage", "sausages"], 301, 19, 1.4, 24, 50, { link: 25, piece: 25, patty: 38 }),
  f("roast beef", ["deli roast beef", "sliced roast beef", "pastrami", "corned beef"], 125, 20, 1, 4.5, 56, { slice: 28, oz: 28.35 }),
  f("salami", ["pepperoni slices", "prosciutto", "chorizo", "mortadella"], 390, 22, 1.5, 32, 28, { slice: 10, oz: 28.35 }),
  f("ham", ["deli ham", "sliced ham"], 145, 21, 1.5, 5.5, 56, { slice: 28, oz: 28.35 }),
  f("deli turkey", ["turkey", "turkey slices", "sliced turkey"], 104, 17, 4, 1.7, 56, { slice: 28, oz: 28.35 }),
  f("salmon", ["salmon fillet", "grilled salmon"], 206, 22, 0, 12, 154, { piece: 154, fillet: 154, oz: 28.35 }),
  f("tuna", ["canned tuna", "tuna fish"], 116, 25.5, 0, 0.8, 142, { can: 142, oz: 28.35 }),
  f("shrimp", ["prawns"], 99, 24, 0.2, 0.3, 85, { piece: 7, oz: 28.35 }),
  f("tofu", [], 144, 17.3, 2.8, 8.7, 126, { cup: 252, oz: 28.35 }),
  f("tempeh", [], 192, 20, 7.6, 11, 85, { cup: 166, oz: 28.35 }),
  f("chickpeas", ["garbanzo beans"], 164, 8.9, 27.4, 2.6, 164, { cup: 164 }),
  f("ground turkey", ["lean ground turkey", "93% lean ground turkey", "turkey mince"], 190, 26, 0, 9, 113, { oz: 28.35, patty: 113, cup: 135 }),
  f("turkey breast", ["roast turkey"], 135, 30, 0, 1, 113, { oz: 28.35, slice: 28, piece: 113 }),
  f("white fish", ["cod", "tilapia", "halibut", "haddock", "mahi mahi", "sea bass"], 105, 23, 0, 0.9, 150, { fillet: 150, piece: 150, oz: 28.35 }),
  f("smoked salmon", ["lox"], 117, 18, 0, 4.3, 57, { oz: 28.35, slice: 14 }),
  f("brisket", ["beef brisket", "pulled pork", "carnitas", "barbacoa"], 250, 28, 0, 15, 85, { oz: 28.35, cup: 140 }),
  f("chicken sausage", [], 172, 16, 3, 11, 85, { link: 85, piece: 85 }),
  f("turkey bacon", [], 200, 16, 3, 14, 15, { slice: 15, strip: 15 }),
  f("pepperoni", [], 504, 19, 1.2, 46, 15, { slice: 2, piece: 2 }),
  f("black beans", ["beans", "pinto beans", "kidney beans"], 132, 8.9, 23.7, 0.5, 172, { cup: 172 }),
  f("lentils", [], 116, 9, 20, 0.4, 198, { cup: 198 }),
  f("dal", ["daal", "dhal", "lentil curry", "chana masala", "chole"], 105, 6, 14, 3, 240, { cup: 240, bowl: 300 }),
  f("whey protein", ["protein shake", "protein powder", "whey", "protein"], 400, 80, 8, 6, 30, { scoop: 30, shake: 30 }),
  f("protein bar", ["quest bar", "rxbar", "built bar", "barebells", "one bar", "pure protein bar"], 370, 30, 40, 12, 60, { piece: 60, bar: 60 }),
  // Fats, nuts, spreads
  f("olive oil", ["oil", "vegetable oil", "avocado oil", "coconut oil", "sesame oil", "canola oil", "cooking oil"], 884, 0, 0, 100, 14, { tbsp: 13.5, tsp: 4.5 }),
  f("peanut butter", ["pb"], 588, 25, 20, 50, 32, { tbsp: 16, tsp: 5 }),
  f("almonds", ["almond", "nuts", "mixed nuts", "cashews", "peanuts", "walnuts", "pecans", "pistachios"], 579, 21, 22, 50, 28, { oz: 28.35, handful: 28, cup: 143, piece: 1.2 }),
  f("avocado", ["guacamole", "guac", "avocados"], 160, 2, 8.5, 14.7, 75, { piece: 150, half: 75 }),
  f("hummus", [], 166, 7.9, 14, 9.6, 60, { tbsp: 15, cup: 246 }),
  f("almond butter", ["cashew butter"], 614, 21, 19, 56, 32, { tbsp: 16, tsp: 5 }),
  f("chia seeds", ["chia"], 486, 17, 42, 31, 12, { tbsp: 12, tsp: 4 }),
  f("flax seeds", ["flaxseed", "ground flax"], 534, 18, 29, 42, 7, { tbsp: 7, tsp: 2.5 }),
  f("pumpkin seeds", ["pepitas", "sunflower seeds", "hemp seeds"], 570, 29, 12, 48, 28, { tbsp: 9, oz: 28.35, handful: 28 }),
  f("soy sauce", ["tamari", "coconut aminos"], 53, 8, 5, 0.6, 16, { tbsp: 16, tsp: 5 }),
  f("teriyaki sauce", ["teriyaki"], 89, 5.9, 15.6, 0, 36, { tbsp: 18 }),
  f("bbq sauce", ["barbecue sauce"], 172, 0.8, 41, 0.6, 34, { tbsp: 17 }),
  f("salsa", ["pico de gallo", "pico"], 36, 1.5, 7, 0.2, 32, { tbsp: 16, cup: 260 }),
  f("ranch", ["ranch dressing", "caesar dressing", "blue cheese dressing"], 430, 1, 6, 45, 30, { tbsp: 15 }),
  f("vinaigrette", ["italian dressing", "balsamic vinaigrette", "dressing", "salad dressing"], 280, 0.2, 10, 27, 30, { tbsp: 15 }),
  f("hot sauce", ["sriracha", "buffalo sauce"], 11, 0.5, 1.8, 0.4, 5, { tsp: 5, tbsp: 15 }),
  f("pesto", [], 418, 5, 4, 43, 16, { tbsp: 16 }),
  f("marinara", ["marinara sauce", "tomato sauce", "pasta sauce", "spaghetti sauce"], 50, 1.5, 8, 1.5, 125, { cup: 250, tbsp: 16 }),
  f("alfredo sauce", [], 160, 3, 4, 15, 125, { cup: 250, tbsp: 16 }),
  f("mustard", ["dijon", "dijon mustard", "horseradish", "relish", "tzatziki", "vinegar", "balsamic vinegar"], 60, 3.7, 5.8, 3.3, 10, { tsp: 5, tbsp: 15 }),
  f("maple syrup", ["syrup", "pancake syrup"], 260, 0, 67, 0, 40, { tbsp: 20, tsp: 7 }),
  f("flavored syrup", ["vanilla syrup", "caramel syrup", "vanilla", "caramel", "hazelnut syrup", "simple syrup"], 270, 0, 67, 0, 15, { pump: 7.5, tbsp: 20 }),
  f("mayonnaise", ["mayo"], 680, 1, 0.6, 75, 14, { tbsp: 14 }),
  f("ketchup", [], 112, 1, 26, 0.1, 17, { tbsp: 17 }),
  f("honey", [], 304, 0.3, 82, 0, 21, { tbsp: 21, tsp: 7 }),
  f("sugar", [], 387, 0, 100, 0, 4, { tsp: 4, tbsp: 12.5 }),
  f("jam", ["jelly"], 250, 0.4, 65, 0.1, 20, { tbsp: 20 }),
  // Fruit and vegetables
  f("banana", ["bananas"], 89, 1.1, 23, 0.3, 118, { piece: 118 }),
  f("apple", ["apples"], 52, 0.3, 14, 0.2, 182, { piece: 182 }),
  f("orange", ["oranges"], 47, 0.9, 12, 0.1, 131, { piece: 131 }),
  f("strawberries", ["berries", "mixed berries", "frozen strawberries", "frozen berries"], 32, 0.7, 7.7, 0.3, 152, { cup: 152, handful: 75, piece: 12 }),
  f("raspberries", ["blackberries"], 52, 1.2, 12, 0.7, 123, { cup: 123, handful: 60 }),
  f("mango", [], 60, 0.8, 15, 0.4, 165, { cup: 165, piece: 207 }),
  f("pineapple", ["pineapple chunks"], 50, 0.5, 13, 0.1, 165, { cup: 165, slice: 84 }),
  f("watermelon", [], 30, 0.6, 7.6, 0.2, 152, { cup: 152, slice: 286 }),
  f("dates", ["medjool dates", "date"], 277, 1.8, 75, 0.2, 24, { piece: 24 }),
  f("raisins", [], 299, 3.1, 79, 0.5, 43, { tbsp: 9, box: 43, handful: 30 }),
  f("peach", ["nectarine", "pear", "plum"], 42, 0.7, 10.5, 0.2, 150, { piece: 150, cup: 155 }),
  f("blueberries", [], 57, 0.7, 14.5, 0.3, 148, { cup: 148, handful: 75 }),
  f("grapes", ["cherries"], 69, 0.7, 18, 0.2, 151, { cup: 151, piece: 5, handful: 75 }),
  f("broccoli", [], 35, 2.4, 7.2, 0.4, 91, { cup: 91 }),
  f("salad", ["green salad", "side salad", "garden salad", "lettuce", "greens", "mixed greens", "romaine"], 20, 1.5, 3.5, 0.3, 85, { cup: 47, bowl: 140 }),
  f("spinach", ["baby spinach", "raw spinach"], 23, 2.9, 3.6, 0.4, 60, { cup: 30, handful: 30 }),
  f("cooked spinach", ["sauteed spinach", "steamed spinach", "wilted spinach", "cooked kale", "sauteed kale", "cooked greens"], 23, 3, 3.8, 0.3, 90, { cup: 180 }),
  f("cauliflower rice", ["riced cauliflower"], 25, 1.9, 5, 0.3, 107, { cup: 107, bag: 340 }),
  f("cauliflower", [], 25, 1.9, 5, 0.3, 107, { cup: 107, piece: 575 }),
  f("carrots", ["carrot", "baby carrots"], 41, 0.9, 9.6, 0.2, 64, { cup: 128, piece: 61, handful: 60 }),
  f("peas", ["green peas"], 84, 5.4, 15.6, 0.2, 80, { cup: 160 }),
  f("corn", ["sweet corn", "corn kernels"], 96, 3.4, 21, 1.5, 75, { cup: 145, ear: 100, cob: 100 }),
  f("mixed vegetables", ["mixed veggies", "frozen vegetables", "veggies", "vegetables", "stir fry vegetables"], 65, 2.9, 13, 0.2, 91, { cup: 182, bag: 340 }),
  f("green beans", ["string beans"], 35, 1.9, 7.9, 0.3, 62, { cup: 125, handful: 60 }),
  f("zucchini", ["squash", "yellow squash", "zucchini noodles", "zoodles", "spiralized zucchini", "spaghetti squash"], 17, 1.2, 3.1, 0.3, 124, { cup: 124, piece: 196 }),
  f("bell pepper", ["bell peppers", "peppers", "red pepper", "green pepper", "fajita veggies", "fajitas", "peppers and onions"], 26, 1, 6, 0.3, 75, { cup: 149, piece: 120 }),
  f("onion", ["onions", "red onion"], 40, 1.1, 9.3, 0.1, 40, { cup: 160, piece: 110 }),
  f("mushrooms", ["mushroom"], 22, 3.1, 3.3, 0.3, 70, { cup: 70, handful: 35 }),
  f("tomato", ["tomatoes", "cherry tomatoes"], 18, 0.9, 3.9, 0.2, 60, { cup: 180, piece: 123, slice: 20 }),
  f("cucumber", ["cucumbers"], 15, 0.7, 3.6, 0.1, 104, { cup: 104, piece: 300, slice: 7 }),
  f("asparagus", [], 20, 2.2, 3.9, 0.1, 90, { cup: 134, piece: 16, spear: 16 }),
  f("kale", [], 35, 2.9, 4.4, 1.5, 40, { cup: 21, handful: 20 }),
  f("cabbage", ["coleslaw mix"], 25, 1.3, 5.8, 0.1, 89, { cup: 89 }),
  f("brussels sprouts", ["brussel sprouts", "brussels"], 43, 3.4, 9, 0.3, 88, { cup: 88, piece: 19 }),
  f("edamame", [], 121, 11.9, 8.9, 5.2, 155, { cup: 155 }),
  f("celery", [], 16, 0.7, 3, 0.2, 40, { piece: 40, stalk: 40, cup: 101 }),
  f("vegetables (non-starchy)", ["bok choy", "snap peas", "snow peas", "eggplant", "beets", "radish", "radishes", "leeks", "artichoke", "okra", "collard greens", "arugula", "sprouts", "bean sprouts", "water chestnuts", "bamboo shoots", "scallions", "green onions", "garlic", "ginger", "cilantro", "chard", "swiss chard", "watercress", "fennel", "turnip", "sauerkraut", "kimchi"], 25, 1.6, 5, 0.2, 85, { cup: 85, handful: 30, piece: 85 }),
  f("lemon", ["lime", "lemon juice", "lime juice"], 29, 1.1, 9.3, 0.3, 10, { piece: 58, tbsp: 15, wedge: 8 }),
  f("pickles", ["pickle"], 11, 0.3, 2.3, 0.2, 35, { piece: 35, slice: 7 }),
  f("jalapeno", ["jalapenos"], 29, 0.9, 6.5, 0.4, 14, { piece: 14 }),
  // Dishes and fast food
  f("burrito", ["chicken burrito", "steak burrito", "bean burrito", "chipotle burrito"], 170, 9, 20, 6, 400, { piece: 400 }),
  f("burrito bowl", ["chipotle bowl", "rice bowl", "chicken rice bowl", "poke bowl"], 150, 9, 16, 5, 450, { piece: 450, bowl: 450 }),
  f("taco", ["tacos"], 218, 9, 20, 12, 90, { piece: 90 }),
  f("quesadilla", [], 290, 13, 25, 15, 180, { piece: 180 }),
  f("pizza", ["cheese pizza", "slice of pizza", "margherita pizza", "veggie pizza"], 266, 11, 33, 10, 214, { slice: 107, piece: 107, small: 535, medium: 640, large: 856, pie: 856, whole: 856 }),
  f("pepperoni pizza", ["meat lovers pizza", "sausage pizza", "supreme pizza"], 298, 12.6, 34, 12.6, 222, { slice: 111, piece: 111, small: 555, medium: 666, large: 888, pie: 888, whole: 888 }),
  f("burger", ["hamburger", "cheeseburger", "big mac"], 257, 13, 24, 12, 220, { piece: 220 }),
  f("double cheeseburger", ["double double", "double quarter pounder", "baconator", "double whopper", "big burger"], 265, 15, 16, 16, 290, { piece: 290 }),
  f("quarter pounder", ["quarter pounder with cheese"], 250, 13, 19, 14, 220, { piece: 220 }),
  f("whopper", ["whopper with cheese"], 250, 11, 19, 14.5, 270, { piece: 270 }),
  f("fast food chicken sandwich", ["chick fil a sandwich", "chick-fil-a sandwich", "mcchicken", "spicy chicken sandwich", "crispy chicken sandwich", "popeyes chicken sandwich"], 260, 14, 26, 11, 180, { piece: 180 }),
  f("crunchwrap", ["crunchwrap supreme", "chalupa", "gordita"], 235, 8, 27, 10, 250, { piece: 250 }),
  f("frosty", ["dairy queen blizzard", "blizzard", "mcflurry"], 180, 4.5, 28, 5.5, 300, { piece: 300, small: 300, medium: 400, large: 500 }),
  f("hot dog", ["hotdog"], 247, 10, 18, 15, 98, { piece: 98 }),
  f("sandwich", ["turkey sandwich", "ham sandwich", "chicken sandwich"], 220, 12, 24, 8, 230, { piece: 230, half: 115 }),
  f("sub", ["turkey sub", "subway", "6 inch sub", "ham sub", "veggie sub", "chicken sub", "hoagie"], 135, 9, 18, 3.5, 230, { piece: 230, footlong: 460, half: 115 }),
  f("italian sub", ["italian hoagie", "cold cut sub", "meatball sub", "philly cheesesteak", "cheesesteak", "italian bmt"], 190, 9.5, 20, 8, 230, { piece: 230, footlong: 460, half: 115 }),
  f("pb&j sandwich", ["pbj", "pb&j", "pb and j", "peanut butter and jelly", "peanut butter and jelly sandwich", "peanut butter sandwich"], 330, 10, 42, 14, 100, { piece: 100 }),
  f("mac and cheese", ["macaroni and cheese"], 164, 7, 19, 7, 200, { cup: 200, bowl: 300 }),
  f("fried rice", [], 163, 6, 24, 5, 200, { cup: 137, plate: 300 }),
  f("spaghetti with meat sauce", ["spaghetti bolognese", "pasta with meat sauce"], 150, 7, 19, 5, 300, { cup: 250, plate: 350, bowl: 350 }),
  f("instant ramen", ["cup noodles", "maruchan", "top ramen"], 88, 2, 12.8, 3.3, 430, { pack: 430, bowl: 430, piece: 430 }),
  f("ramen", ["tonkotsu ramen", "shoyu ramen", "miso ramen", "bowl of ramen"], 90, 4.5, 10, 3.5, 650, { bowl: 650, piece: 650 }),
  f("sushi roll", ["sushi", "california roll", "salmon roll", "tuna roll", "spicy tuna roll", "salmon avocado roll", "cucumber roll", "philadelphia roll", "rainbow roll"], 140, 5, 21, 4, 200, { piece: 30, roll: 200, serving: 200 }),
  f("shrimp tempura roll", ["tempura roll", "dragon roll", "crunchy roll"], 200, 6, 25, 8.5, 220, { piece: 35, roll: 220 }),
  f("chicken noodle soup", ["soup", "noodle soup"], 36, 2.6, 4.4, 1, 245, { cup: 245, bowl: 360 }),
  f("smoothie", ["fruit smoothie"], 70, 1.5, 15, 0.5, 350, { cup: 245, piece: 350 }),
  f("chili", [], 110, 8, 10, 4, 250, { cup: 250, bowl: 300 }),
  f("creamy soup", ["tomato soup", "cream of mushroom", "broccoli cheddar soup", "clam chowder", "chowder", "bisque", "potato soup"], 75, 2, 8, 4, 245, { cup: 245, bowl: 360 }),
  f("broth soup", ["lentil soup", "minestrone", "vegetable soup", "bean soup", "split pea soup", "black bean soup"], 60, 3.5, 9, 1.2, 245, { cup: 245, bowl: 360 }),
  // Snacks and sweets
  f("potato chips", ["chips", "bag of chips", "lays", "doritos", "cheetos"], 536, 7, 53, 35, 28, { bag: 28, oz: 28.35, piece: 2, handful: 20 }),
  f("popcorn", [], 500, 9, 58, 28, 30, { cup: 11 }),
  f("chocolate", ["chocolate bar", "candy bar"], 546, 4.9, 61, 31, 44, { bar: 44, piece: 10 }),
  f("cookie", ["cookies"], 488, 5, 64, 24, 30, { piece: 30 }),
  f("donut", ["doughnut"], 452, 4.9, 51, 25, 60, { piece: 60 }),
  f("ice cream", ["vanilla ice cream", "chocolate ice cream", "frozen yogurt", "froyo"], 207, 3.5, 24, 11, 132, { cup: 132, scoop: 66, bowl: 132 }),
  // More dishes
  f("pho", ["beef pho", "chicken pho"], 60, 4.5, 7, 1.5, 700, { bowl: 700, piece: 700 }),
  f("curry with rice", ["curry and rice", "chicken curry with rice", "curry over rice"], 150, 7, 17, 6, 450, { plate: 450, bowl: 450, piece: 450 }),
  f("curry", ["chicken curry", "tikka masala", "chicken tikka masala", "butter chicken", "korma", "chicken korma", "green curry", "red curry", "massaman curry"], 150, 12, 6, 9, 250, { cup: 240, bowl: 350, serving: 250 }),
  f("stir fry", ["chicken stir fry", "beef stir fry"], 120, 9, 9, 5.5, 350, { plate: 350, bowl: 350, piece: 350 }),
  f("pad thai", [], 175, 7, 23, 6.5, 400, { plate: 400, piece: 400 }),
  f("lasagna", [], 165, 9, 15, 8, 250, { piece: 250, slice: 250 }),
  f("caesar salad", [], 150, 5, 8, 11, 200, { bowl: 200, piece: 200 }),
  f("greek salad", ["greek salad with feta", "mediterranean salad"], 140, 5, 6, 11, 250, { bowl: 300, plate: 300, piece: 250 }),
  f("cobb salad", ["chef salad", "chefs salad"], 180, 11, 4, 13, 350, { bowl: 350, piece: 350 }),
  f("chicken salad", ["grilled chicken salad"], 110, 12, 4, 5, 300, { bowl: 300, piece: 300 }),
  f("chicken wings", ["wings", "buffalo wings", "boneless wings"], 290, 27, 1, 19.5, 190, { piece: 32, basket: 320, order: 190 }),
  f("gyro", ["shawarma", "kebab", "doner"], 215, 11, 20, 10, 330, { piece: 330 }),
  f("falafel", [], 333, 13, 32, 18, 17, { piece: 17 }),
  f("dumplings", ["potstickers", "gyoza"], 220, 9, 25, 9, 30, { piece: 30 }),
  f("nachos", [], 305, 8, 32, 16, 250, { plate: 250, piece: 250 }),
  f("enchilada", ["enchiladas"], 170, 9, 17, 7.5, 200, { piece: 200 }),
  f("grilled cheese", ["grilled cheese sandwich"], 330, 12, 30, 18, 140, { piece: 140 }),
  f("blt", ["blt sandwich", "club sandwich"], 250, 11, 20, 14, 180, { piece: 180 }),
  f("breakfast burrito", [], 200, 9, 19, 10, 250, { piece: 250 }),
  f("breakfast sandwich", ["egg mcmuffin", "bacon egg and cheese", "egg sandwich"], 240, 13, 23, 11, 140, { piece: 140 }),
  f("meatballs", [], 230, 15, 8, 15, 120, { piece: 30 }),
  f("cream cheese", [], 342, 6, 4, 34, 28, { tbsp: 14.5 }),
  f("bagel with cream cheese", [], 270, 9, 42, 8, 135, { piece: 135 }),
  f("acai bowl", [], 110, 1.5, 20, 3, 400, { bowl: 400, piece: 400 }),
  f("trail mix", [], 460, 14, 45, 29, 40, { handful: 30, cup: 150 }),
  f("granola bar", ["bar", "kind bar", "clif bar", "nature valley", "larabar", "nut bar", "snack bar", "cereal bar"], 470, 10, 64, 20, 42, { piece: 42, bar: 42 }),
  f("rice cake", ["rice cakes"], 387, 8, 81, 3, 9, { piece: 9 }),
  f("crackers", [], 500, 8, 64, 23, 30, { piece: 3 }),
  f("pretzels", [], 380, 10, 80, 3, 30, { handful: 30, bag: 45 }),
  f("beef jerky", ["jerky"], 410, 33, 11, 26, 28, { piece: 10, bag: 28 }),
  f("hard boiled egg", [], 155, 12.6, 1.1, 10.6, 50, { piece: 50 }),
  f("steak and potatoes", [], 170, 13, 10, 8.5, 400, { plate: 400, piece: 400 }),
  f("rotisserie chicken", [], 190, 27, 0, 8.5, 150, { piece: 150 }),
  f("chipotle burrito bowl", [], 150, 9, 16, 5, 520, { bowl: 520, piece: 520 }),
  f("cheesecake", [], 321, 5.5, 25.5, 22.5, 125, { slice: 125, piece: 125 }),
  f("cake", ["birthday cake", "chocolate cake"], 370, 4.5, 53, 16, 95, { slice: 95, piece: 95 }),
  f("brownie", [], 466, 6, 50, 29, 56, { piece: 56 }),
  f("banana bread", ["zucchini bread", "pumpkin bread"], 326, 4.3, 54.6, 10.5, 60, { slice: 60, piece: 60 }),
  f("empanada", ["empanadas"], 300, 9, 28, 17, 110, { piece: 110 }),
  f("bibimbap", [], 125, 6, 18, 3.5, 500, { bowl: 500, piece: 500 }),
  // Drinks
  f("chocolate milk", [], 83, 3.2, 10.4, 3.4, 250, { cup: 250, glass: 250, bottle: 400 }),
  f("energy drink", ["red bull", "monster"], 45, 0, 11, 0, 250, { can: 250 }),
  f("bubble tea", ["boba", "boba tea", "milk tea"], 70, 0.5, 14, 1.5, 470, { cup: 470, piece: 470 }),
  f("milkshake", [], 115, 3.5, 18, 3.5, 450, { cup: 450, piece: 450 }),
  f("frappuccino", ["iced mocha"], 90, 2, 15, 2.5, 470, { cup: 470, piece: 470 }),
  f("kombucha", [], 20, 0, 5, 0, 480, { bottle: 480 }),
  f("water", ["sparkling water", "la croix"], 0, 0, 0, 0, 500, { glass: 250, bottle: 500, cup: 240, can: 355 }),
  f("coffee", ["black coffee", "americano", "iced coffee", "cold brew", "drip coffee", "espresso", "tea", "green tea", "black tea", "iced tea unsweetened"], 2, 0.3, 0, 0, 240, { cup: 240, mug: 300 }),
  f("mocha", ["cafe mocha", "hot chocolate", "white mocha", "iced mocha"], 80, 3, 11, 3, 355, { cup: 355, piece: 355, mug: 300 }),
  f("whipped cream", ["whip", "cool whip"], 257, 3.2, 12.5, 22, 20, { tbsp: 4, piece: 20, serving: 20 }),
  f("latte", ["cappuccino", "flat white", "iced latte", "oat latte", "oat milk latte", "vanilla latte", "chai latte", "macchiato", "caramel macchiato", "iced caramel macchiato", "cortado"], 54, 3.2, 4.6, 2.7, 355, { cup: 355, piece: 355 }),
  f("diet soda", ["diet coke", "coke zero", "pepsi zero", "diet pepsi", "zero sugar soda", "sprite zero", "diet dr pepper"], 1, 0, 0.1, 0, 355, { can: 355, cup: 240, bottle: 591, piece: 355 }),
  f("soda", ["coke", "pepsi", "sprite", "soft drink", "dr pepper"], 42, 0, 10.6, 0, 355, { can: 355, cup: 240, bottle: 591, piece: 355 }),
  f("orange juice", ["juice", "oj", "apple juice"], 45, 0.7, 10.4, 0.2, 248, { cup: 248, glass: 248 }),
  f("beer", ["ipa", "lager"], 43, 0.5, 3.6, 0, 355, { can: 355, bottle: 355, pint: 473, glass: 355 }),
  f("wine", ["glass of wine"], 83, 0.1, 2.6, 0, 150, { glass: 150 }),
  f("coconut water", [], 19, 0.7, 3.7, 0.2, 240, { cup: 240, glass: 240 }),
  f("sports drink", ["gatorade", "powerade"], 26, 0, 6, 0, 591, { bottle: 591 }),
];

/** Units that mean the same weight whatever the food. */
export const GENERIC_UNITS: Record<string, number> = { g: 1, gram: 1, grams: 1, kg: 1000, oz: 28.35, ounce: 28.35, ounces: 28.35, lb: 453.6, lbs: 453.6, pound: 453.6, pounds: 453.6, ml: 1, floz: 29.6, tall: 355, grande: 473, venti: 591 };

export const UNIT_ALIASES: Record<string, string> = {
  pieces: "piece", pcs: "piece", pumps: "pump", baskets: "basket", orders: "order", footlongs: "footlong", pc: "piece", whole: "piece", item: "piece", items: "piece", large: "piece", medium: "piece", small: "piece",
  slices: "slice", strips: "strip", links: "link", cups: "cup", tablespoon: "tbsp", tablespoons: "tbsp", tbsps: "tbsp", teaspoon: "tsp", teaspoons: "tsp",
  scoops: "scoop", cans: "can", glasses: "glass", bowls: "bowl", plates: "plate", servings: "serving", bars: "bar", bottles: "bottle", fillets: "fillet",
  patties: "patty", handfuls: "handful", packs: "pack", packet: "pack", rolls: "roll", mugs: "mug", pints: "pint",
};

export function normalizeUnit(unit: string | undefined | null) {
  const u = (unit ?? "").toLowerCase().trim().replace(/\.$/, "");
  return UNIT_ALIASES[u] ?? u;
}

export function clean(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9& ]/g, " ").replace(/\s+/g, " ").trim();
}

export const INDEX: [string, Food][] = FOODS.flatMap((food) => [food.name, ...food.aliases].map((n) => [clean(n), food] as [string, Food]));

/** Best table match for a food name: exact name/alias, then the longest name contained in it. */
/** Words that don't change what a food is ("grilled chicken breast" is chicken breast). */
const MODIFIERS = new Set(["meal", "combo", "nonfat", "lowfat", "low fat", "fat free", "unsweetened", "light", "lite", "a", "an", "the", "some", "my", "of", "plain", "homemade", "home", "made", "grilled", "baked", "fried", "boiled", "steamed", "roasted", "fresh", "raw", "cooked", "hot", "iced", "ice", "cold", "whole", "sliced", "diced", "chopped", "small", "large", "medium", "big", "regular", "organic", "frozen", "leftover", "leftovers", "spicy", "warm", "toasted", "scrambled", "side", "piece", "pieces", "bowl", "cup", "slice", "slices", "serving"]);

/**
 * Table match for a food name: exact name/alias, or exact after dropping modifier words.
 * No loose substring matching: "banana bread" is not a banana, so it goes to the model instead.
 */
export function findFood(name: string): Food | null {
  const singular = (s: string) => s.replace(/(?<=[a-z]{3})s\b/g, "");
  const exact = (q: string) => INDEX.find(([n]) => n === q || n === singular(q) || singular(n) === singular(q))?.[1] ?? null;
  const whole = clean(name);
  if (!whole) return null;
  const hit = exact(whole);
  if (hit) return hit;
  const core = whole.split(" ").filter((w) => !MODIFIERS.has(w)).join(" ");
  const coreHit = core && core !== whole ? exact(core) : null;
  if (coreHit) return coreHit;
  const typo = fuzzy(core || whole);
  if (typo) return typo;
  // Head noun: "carrot cake" → cake, "lime dressing" → dressing, "bbq pulled pork" → pulled pork.
  const words = (core || whole).split(" ");
  for (let n = Math.min(3, words.length - 1); n >= 1; n--) {
    const tail = exact(words.slice(-n).join(" "));
    if (tail && !HEAD_NOUN_BLOCK.has(tail.name)) return tail;
  }
  return null;
}

/** Foods too generic to stand in for a longer name ("apple juice" ≠ juice is fine, but "chicken sauce" ≠ chicken). */
const HEAD_NOUN_BLOCK = new Set(["chicken breast", "egg", "white rice", "olive oil", "flavored syrup", "whey protein", "lemon", "vegetables (non-starchy)", "water", "spices"]);

/** Typo-tolerant match: every word within 1 edit (2 for long words) of an alias with the same word count. */
function fuzzy(q: string): Food | null {
  const qw = q.split(" ");
  if (qw.some((w) => w.length < 4) && qw.length === 1) return null;
  let best: { food: Food; cost: number } | null = null;
  for (const [n, food] of INDEX) {
    const nw = n.split(" ");
    if (nw.length !== qw.length) continue;
    let cost = 0;
    for (let i = 0; i < nw.length && cost < 99; i++) {
      const allowed = nw[i].length >= 8 ? 2 : nw[i].length >= 4 ? 1 : 0;
      const d = nw[i] === qw[i] ? 0 : editDistance(nw[i], qw[i], allowed);
      cost = d > allowed ? 99 : cost + d;
    }
    if (cost > 0 && cost < 99 && (!best || cost < best.cost)) best = { food, cost };
  }
  return best?.food ?? null;
}

function editDistance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/** Grams for an amount of a food; null if the unit means nothing for it. */
export function gramsFor(food: Food | null, quantity: number, unit: string | undefined | null): number | null {
  const q = quantity > 0 ? quantity : 1;
  const raw = (unit ?? "").toLowerCase().trim();
  if (food?.units?.[raw]) return q * food.units[raw];
  const u = normalizeUnit(unit);
  // Volume units convert between each other when a food only lists one (1 cup = 16 tbsp = 48 tsp).
  const vol = food?.units;
  if (vol && !vol[u]) {
    if (u === "cup" && vol.tbsp) return q * vol.tbsp * 16;
    if (u === "tbsp" && vol.cup) return (q * vol.cup) / 16;
    if (u === "tbsp" && vol.tsp) return q * vol.tsp * 3;
    if (u === "tsp" && vol.tbsp) return (q * vol.tbsp) / 3;
    if (u === "tsp" && vol.cup) return (q * vol.cup) / 48;
  }
  if (GENERIC_UNITS[u]) return q * GENERIC_UNITS[u];
  if (!food) return null;
  if (!u || u === "serving") return q * (u === "serving" || !food.units?.piece ? food.serving : food.units.piece);
  if (food.units?.[u]) return q * food.units[u];
  if (u === "piece") return q * food.serving;
  return null;
}

/** Typical nutrition per 100 g by kind of food, for foods not in the table. */
export const FOOD_KINDS = {
  "bread, cake or baked goods": { kcal: 340, protein: 6, carbs: 50, fat: 13 },
  "fried food or salty snack": { kcal: 420, protein: 7, carbs: 42, fat: 25 },
  "rice, noodle or pasta dish": { kcal: 150, protein: 6, carbs: 22, fat: 4.5 },
  "meat, fish or egg dish": { kcal: 210, protein: 22, carbs: 4, fat: 12 },
  "sandwich, wrap, burger or pizza": { kcal: 250, protein: 12, carbs: 26, fat: 11 },
  "soup or stew": { kcal: 70, protein: 4, carbs: 7, fat: 2.5 },
  "salad or vegetables": { kcal: 70, protein: 2.5, carbs: 7, fat: 4 },
  "fruit": { kcal: 55, protein: 0.7, carbs: 14, fat: 0.2 },
  "milk drink, smoothie or shake": { kcal: 85, protein: 3.5, carbs: 12, fat: 2.5 },
  "sweet drink, juice or soda": { kcal: 45, protein: 0, carbs: 11, fat: 0 },
  "dessert or candy": { kcal: 400, protein: 5, carbs: 55, fat: 18 },
  "cheese, nuts or spread": { kcal: 520, protein: 15, carbs: 15, fat: 44 },
  "black coffee, tea or water": { kcal: 2, protein: 0.1, carbs: 0.3, fat: 0 },
} as const;
export type FoodKind = keyof typeof FOOD_KINDS;

/** Plausible gram range per unit, to clamp a model's weight guess. */
export const UNIT_GRAM_RANGE: Record<string, [number, number]> = {
  piece: [10, 600], slice: [20, 200], cup: [100, 350], glass: [150, 450], bowl: [200, 800], plate: [250, 900], can: [250, 500],
  bottle: [250, 750], tbsp: [5, 25], tsp: [2, 8], scoop: [15, 50], handful: [15, 60], serving: [30, 600], bar: [20, 100], roll: [100, 350],
};

/** Kind of an unknown food from words in its name; null if nothing fits. Order matters (a "chicken wrap" is a wrap). */
const KIND_WORDS: [RegExp, FoodKind][] = [
  [/\b(coffee|espresso|tea|water|seltzer)\b/, "black coffee, tea or water"],
  [/\b(milk|shake|smoothie|latte|frappe|lassi|kefir|horchata)\b/, "milk drink, smoothie or shake"],
  [/\b(juice|soda|lemonade|punch|cola|slushie|iced tea|sweet tea)\b/, "sweet drink, juice or soda"],
  [/\b(soup|stew|chowder|broth|bisque|gumbo|chili)\b/, "soup or stew"],
  [/\b(wrap|sandwich|sub|hoagie|panini|burger|pizza|taco|burrito|quesadilla|pita|calzone|hot dog)\b/, "sandwich, wrap, burger or pizza"],
  [/\b(candy|gummy|gummies|chocolate|pudding|ice cream|gelato|dessert|fudge|lollipop|marshmallow)\b/, "dessert or candy"],
  [/\b(cake|bread|muffin|pie|pastry|cookie|brownie|scone|biscuit|roll|bun|danish|tart|loaf|cupcake|churro)\b/, "bread, cake or baked goods"],
  [/\b(chips|fries|fried|crisps|nachos|tempura|onion rings|tots|puffs)\b/, "fried food or salty snack"],
  [/\b(salad|veggies|vegetables|slaw|greens)\b/, "salad or vegetables"],
  [/\b(noodle|noodles|pasta|alfredo|carbonara|lo mein|risotto|rice|curry|paella|udon|soba|dumpling|mac|bowl|grain bowl|plate|platter)\b/, "rice, noodle or pasta dish"],
  [/\b(chicken|beef|steak|pork|lamb|fish|salmon|tuna|shrimp|egg|eggs|turkey|meat|tofu|ribs|brisket|kebab)\b/, "meat, fish or egg dish"],
  [/\b(berries|fruit|melon|mango|pineapple|peach|pear|plum|cherries|kiwi|papaya)\b/, "fruit"],
  [/\b(nuts|cheese|butter|seeds|spread|nutella)\b/, "cheese, nuts or spread"],
];

export function kindFor(name: string): FoodKind | null {
  const n = clean(name);
  return KIND_WORDS.find(([re]) => re.test(n))?.[1] ?? null;
}

/** Typical grams for one unit of a kind of food. */
export function portionGrams(kind: FoodKind, unit: string): number {
  const u = normalizeUnit(unit) || "serving";
  const byUnit: Record<string, number> = { slice: kind === "sandwich, wrap, burger or pizza" ? 110 : kind === "bread, cake or baked goods" ? 100 : 60, glass: 250, cup: kind.includes("drink") || kind.includes("coffee") ? 240 : 200, can: 355, bottle: 500, handful: 40, tbsp: 15, tsp: 5, scoop: 70, bar: 50 };
  if (byUnit[u]) return byUnit[u];
  if (u === "bowl") return kind === "soup or stew" ? 400 : kind === "rice, noodle or pasta dish" ? 550 : kind === "salad or vegetables" ? 250 : 350;
  if (u === "plate") return 450;
  const serving: Record<FoodKind, number> = {
    "bread, cake or baked goods": 100, "fried food or salty snack": 100, "rice, noodle or pasta dish": 400, "meat, fish or egg dish": 250,
    "sandwich, wrap, burger or pizza": 250, "soup or stew": 350, "salad or vegetables": 250, fruit: 150, "milk drink, smoothie or shake": 300,
    "sweet drink, juice or soda": 350, "dessert or candy": 80, "cheese, nuts or spread": 30, "black coffee, tea or water": 300,
  };
  return serving[kind];
}
