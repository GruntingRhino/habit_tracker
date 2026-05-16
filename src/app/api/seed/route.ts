import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { calculateScores } from "@/lib/scoring";
import { subDays, startOfDay } from "date-fns";
import { isProduction, secureCompare } from "@/lib/runtime-config";

export async function POST(req: NextRequest) {
  try {
    if (isProduction()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const url = new URL(req.url);
    const full = url.searchParams.get("full") === "true";
    const seedSecret = process.env.SEED_SECRET;

    if (!seedSecret) {
      return NextResponse.json(
        { message: "SEED_SECRET env var is required" },
        { status: 403 }
      );
    }

    if (!secureCompare(seedSecret, req.headers.get("x-seed-secret"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
      return NextResponse.json(
        { message: "ADMIN_EMAIL and ADMIN_PASSWORD env vars are required" },
        { status: 400 }
      );
    }

    // ── Ensure user exists ──────────────────────────────────────────────────
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const hashedPassword = await bcrypt.hash(password, 12);
      user = await prisma.user.create({
        data: { email, password: hashedPassword, name: "Abhay" },
      });
    }

    if (!full) {
      return NextResponse.json({ message: "user ready — pass ?full=true for demo data" });
    }

    const userId = user.id;

    // ── Wipe existing user data (keep user record) ─────────────────────────
    await prisma.$transaction([
      prisma.workoutExerciseLog.deleteMany({ where: { session: { userId } } }),
      prisma.workoutSession.deleteMany({ where: { userId } }),
      prisma.weightExercise.deleteMany({ where: { routine: { userId } } }),
      prisma.weightRoutine.deleteMany({ where: { userId } }),
      prisma.habitLog.deleteMany({ where: { habit: { userId } } }),
      prisma.habit.deleteMany({ where: { userId } }),
      prisma.projectTask.deleteMany({ where: { project: { userId } } }),
      prisma.project.deleteMany({ where: { userId } }),
      prisma.categoryScore.deleteMany({ where: { userId } }),
      prisma.dailyEntry.deleteMany({ where: { userId } }),
      prisma.meal.deleteMany({ where: { userId } }),
    ]);

    // ── 1. Daily entries + category scores (30 days) ────────────────────────
    // Data shows steady improvement over 30 days with realistic variation
    const dailyData = [
      // [daysAgo, sleep, workout, sports, steps, deepWork, screen, tasksP, tasksC, diff, spent, saved, rating]
      [30, 5.5, false, 0,   4200,  1.5, 7, 4, 2, 2, 120, 20,  2],
      [29, 6.0, false, 0,   5000,  2.0, 6, 5, 3, 2, 80,  30,  3],
      [28, 7.0, true,  45,  7500,  3.0, 5, 6, 5, 3, 60,  50,  4],
      [27, 7.5, true,  60,  9000,  3.5, 4, 6, 6, 3, 40,  80,  5],
      [26, 6.5, false, 30,  6000,  2.5, 5, 5, 4, 2, 90,  40,  3],
      [25, 5.0, false, 0,   3500,  1.0, 8, 4, 2, 2, 150, 10,  2],
      [24, 6.0, false, 0,   4000,  1.5, 7, 4, 3, 2, 110, 20,  3],
      [23, 7.5, true,  60,  9500,  4.0, 4, 7, 6, 4, 45,  80,  5],
      [22, 8.0, true,  75,  10000, 4.5, 3, 7, 7, 4, 30,  90,  5],
      [21, 7.0, true,  45,  8000,  3.5, 4, 6, 5, 3, 55,  70,  4],
      [20, 6.5, false, 20,  5500,  2.0, 6, 5, 3, 2, 95,  35,  3],
      [19, 5.5, false, 0,   4000,  1.5, 7, 4, 2, 2, 130, 15,  2],
      [18, 7.0, true,  60,  9000,  4.0, 4, 7, 6, 4, 40,  85,  5],
      [17, 8.0, true,  90,  11000, 5.0, 3, 8, 7, 5, 25,  100, 5],
      [16, 7.5, true,  60,  9500,  4.5, 3, 7, 7, 4, 35,  90,  5],
      [15, 7.0, true,  45,  8500,  4.0, 4, 7, 6, 4, 50,  75,  4],
      [14, 6.0, false, 0,   5000,  2.0, 6, 5, 3, 2, 100, 30,  3],
      [13, 5.5, false, 0,   3800,  1.5, 7, 4, 2, 2, 140, 10,  2],
      [12, 7.5, true,  75,  10000, 5.0, 3, 8, 7, 5, 30,  95,  5],
      [11, 8.0, true,  90,  11500, 5.5, 2, 8, 8, 5, 20,  110, 5],
      [10, 8.0, true,  60,  10500, 5.0, 3, 8, 7, 5, 25,  100, 5],
      [9,  7.5, true,  75,  10000, 4.5, 3, 7, 7, 4, 30,  90,  5],
      [8,  7.0, true,  60,  9000,  4.0, 4, 7, 6, 4, 40,  80,  4],
      [7,  6.5, false, 30,  6500,  2.5, 5, 5, 4, 3, 80,  50,  3],
      [6,  6.0, false, 0,   4500,  2.0, 6, 5, 3, 2, 110, 25,  3],
      [5,  8.0, true,  90,  11000, 5.5, 2, 8, 8, 5, 20,  110, 5],
      [4,  8.0, true,  90,  12000, 6.0, 2, 9, 8, 5, 15,  120, 5],
      [3,  7.5, true,  75,  10500, 5.0, 3, 8, 7, 5, 25,  100, 5],
      [2,  8.0, true,  90,  11500, 5.5, 2, 8, 8, 5, 20,  110, 5],
      [1,  8.0, true,  90,  12000, 6.0, 2, 9, 9, 5, 15,  120, 5],
    ] as const;

    for (const row of dailyData) {
      const [daysAgo, sleep, workout, sports, steps, deepWork, screen,
             tasksP, tasksC, diff, spent, saved, rating] = row;
      const date = startOfDay(subDays(new Date(), daysAgo));

      const entry = await prisma.dailyEntry.create({
        data: {
          userId,
          date,
          sleepHours: sleep,
          workoutCompleted: workout,
          workoutRoutineName: workout ? "Demo Routine" : null,
          workoutDurationMinutes: workout ? Math.max(30, sports) : null,
          workoutIntensity: workout && sports >= 75 ? "hard" : workout ? "moderate" : null,
          sportsTrainingMinutes: sports,
          steps,
          deepWorkHours: deepWork,
          screenTimeHours: screen,
          tasksPlanned: tasksP,
          tasksCompleted: tasksC,
          taskDifficultyRating: diff,
          moneySpent: spent,
          moneySaved: saved,
          overallDayRating: rating,
        },
      });

      const scores = calculateScores({
        entry: {
          sleepHours: sleep,
          workoutCompleted: workout,
          workoutRoutineName: workout ? "Demo Routine" : null,
          workoutDurationMinutes: workout ? Math.max(30, sports) : null,
          workoutIntensity: workout && sports >= 75 ? "hard" : workout ? "moderate" : null,
          sportsTrainingMinutes: sports, steps,
          deepWorkHours: deepWork, screenTimeHours: screen,
          tasksPlanned: tasksP, tasksCompleted: tasksC,
          taskDifficultyRating: diff, moneySpent: spent,
          moneySaved: saved, overallDayRating: rating,
        },
        habitCompletionRate: workout ? 0.8 : 0.4,
        projectStats: { completedThisWeek: 1, overdueCount: 0, totalActive: 2 },
        recentStreak: Math.max(0, 15 - daysAgo),
      });

      await prisma.categoryScore.create({
        data: {
          userId,
          dailyEntryId: entry.id,
          date,
          physical:   scores.physical,
          financial:  scores.financial,
          discipline: scores.discipline,
          focus:      scores.focus,
          mental:     scores.mental,
          appearance: scores.appearance,
          overall:    scores.overall,
        },
      });
    }

    // ── 2. Habits + logs ───────────────────────────────────────────────────
    const habitDefs = [
      { name: "Morning Workout",  category: "physical",     color: "#22c55e", targetDays: ["mon","tue","wed","thu","fri","sat","sun"] },
      { name: "Meditation",       category: "mental",       color: "#8b5cf6", targetDays: ["mon","tue","wed","thu","fri","sat","sun"] },
      { name: "Read 30 min",      category: "focus",        color: "#3b82f6", targetDays: ["mon","tue","wed","thu","fri","sat","sun"] },
      { name: "Cold Shower",      category: "physical",     color: "#06b6d4", targetDays: ["mon","tue","wed","thu","fri","sat","sun"] },
      { name: "No Junk Food",     category: "physical",     color: "#f59e0b", targetDays: ["mon","tue","wed","thu","fri","sat","sun"] },
      { name: "Journal",          category: "mental",       color: "#ec4899", targetDays: ["mon","tue","wed","thu","fri"] },
      { name: "10k Steps",        category: "physical",     color: "#10b981", targetDays: ["mon","tue","wed","thu","fri","sat","sun"] },
    ];

    // completion pattern: improving over time (mirrors the entry data)
    const completionPattern = [
      false,false,true,true,false,false,false,true,true,true,
      false,false,true,true,true,true,false,false,true,true,
      true,true,true,false,false,true,true,true,true,true,
    ];

    for (const def of habitDefs) {
      const habit = await prisma.habit.create({
        data: { userId, ...def },
      });

      for (let i = 0; i < 30; i++) {
        const date = startOfDay(subDays(new Date(), 30 - i));
        await prisma.habitLog.create({
          data: { habitId: habit.id, date, completed: completionPattern[i] ?? false },
        });
      }
    }

    // ── 3. Weight routines + sessions ──────────────────────────────────────
    const routineDefs = [
      {
        name: "Push Day",
        description: "Chest, shoulders, triceps",
        exercises: [
          { name: "Bench Press",            descriptor: "4x8" },
          { name: "Incline Dumbbell Press", descriptor: "3x10" },
          { name: "Overhead Press",         descriptor: "3x8" },
          { name: "Lateral Raises",         descriptor: "3x15" },
          { name: "Tricep Pushdown",        descriptor: "3x12 — rope attachment" },
          { name: "Overhead Tricep Ext",    descriptor: "3x10" },
        ],
        sessions: [
          { daysAgo: 21, logs: [{ name: "Bench Press", weight: 115, sets: 4, reps: "8" }, { name: "Overhead Press", weight: 75, sets: 3, reps: "8" }] },
          { daysAgo: 14, logs: [{ name: "Bench Press", weight: 125, sets: 4, reps: "8" }, { name: "Overhead Press", weight: 80, sets: 3, reps: "8" }] },
          { daysAgo:  7, logs: [{ name: "Bench Press", weight: 135, sets: 4, reps: "8" }, { name: "Overhead Press", weight: 85, sets: 3, reps: "8" }] },
          { daysAgo:  2, logs: [{ name: "Bench Press", weight: 145, sets: 4, reps: "8" }, { name: "Overhead Press", weight: 90, sets: 3, reps: "8" }] },
        ],
      },
      {
        name: "Pull Day",
        description: "Back, biceps, rear delts",
        exercises: [
          { name: "Pull Ups",           descriptor: "4 sets to failure" },
          { name: "Barbell Row",        descriptor: "4x8" },
          { name: "Seated Cable Row",   descriptor: "3x12" },
          { name: "Face Pulls",         descriptor: "3x15" },
          { name: "Dumbbell Curl",      descriptor: "3x10" },
          { name: "Hammer Curl",        descriptor: "3x12" },
        ],
        sessions: [
          { daysAgo: 20, logs: [{ name: "Barbell Row", weight: 115, sets: 4, reps: "8" }] },
          { daysAgo: 13, logs: [{ name: "Barbell Row", weight: 125, sets: 4, reps: "8" }] },
          { daysAgo:  6, logs: [{ name: "Barbell Row", weight: 135, sets: 4, reps: "8" }] },
          { daysAgo:  1, logs: [{ name: "Barbell Row", weight: 140, sets: 4, reps: "8" }] },
        ],
      },
      {
        name: "Legs Day",
        description: "Quads, hamstrings, glutes, calves",
        exercises: [
          { name: "Back Squat",              descriptor: "4x8" },
          { name: "Romanian Deadlift",        descriptor: "3x10" },
          { name: "Leg Press",               descriptor: "3x12" },
          { name: "Walking Lunges",          descriptor: "3x12 each leg" },
          { name: "Leg Curl",                descriptor: "3x12" },
          { name: "Calf Raises",             descriptor: "4x20" },
        ],
        sessions: [
          { daysAgo: 19, logs: [{ name: "Back Squat", weight: 155, sets: 4, reps: "8" }] },
          { daysAgo: 12, logs: [{ name: "Back Squat", weight: 165, sets: 4, reps: "8" }] },
          { daysAgo:  5, logs: [{ name: "Back Squat", weight: 175, sets: 4, reps: "8" }] },
        ],
      },
      {
        name: "Cardio",
        description: "Conditioning and endurance",
        exercises: [
          { name: "Treadmill Run",   descriptor: "30 min @ Zone 2" },
          { name: "Jump Rope",       descriptor: "10 min intervals" },
          { name: "Stair Climber",   descriptor: "20 min" },
        ],
        sessions: [
          { daysAgo: 18, logs: [] },
          { daysAgo: 11, logs: [] },
          { daysAgo:  4, logs: [] },
        ],
      },
    ];

    for (const [rIdx, rDef] of routineDefs.entries()) {
      const routine = await prisma.weightRoutine.create({
        data: { userId, name: rDef.name, description: rDef.description, order: rIdx },
      });

      for (const [eIdx, ex] of rDef.exercises.entries()) {
        const exercise = await prisma.weightExercise.create({
          data: { routineId: routine.id, name: ex.name, descriptor: ex.descriptor, order: eIdx },
        });
        // attach sessions to exercises later
        void exercise;
      }

      // Sessions
      for (const sess of rDef.sessions) {
        const session = await prisma.workoutSession.create({
          data: {
            userId,
            routineId: routine.id,
            date: startOfDay(subDays(new Date(), sess.daysAgo)),
          },
        });

        for (const log of sess.logs) {
          // find the exercise
          const ex = await prisma.weightExercise.findFirst({
            where: { routineId: routine.id, name: log.name },
          });
          await prisma.workoutExerciseLog.create({
            data: {
              sessionId: session.id,
              exerciseId: ex?.id ?? undefined,
              exerciseName: log.name,
              weight: log.weight,
              sets: log.sets,
              reps: log.reps,
            },
          });
        }
      }
    }

    // ── 4. Projects + tasks ────────────────────────────────────────────────
    const p1 = await prisma.project.create({
      data: {
        userId,
        title: "Build Personal Brand",
        description: "Establish online presence and portfolio",
        priority: "high",
        status: "active",
        deadline: subDays(new Date(), -30),
      },
    });
    const p1Tasks = [
      { title: "Set up personal website", status: "completed" },
      { title: "Write bio and about page", status: "completed" },
      { title: "Create content calendar", status: "in_progress" },
      { title: "Post 3x per week on LinkedIn", status: "todo" },
      { title: "Record intro video", status: "todo" },
    ];
    for (const [i, t] of p1Tasks.entries()) {
      await prisma.projectTask.create({ data: { projectId: p1.id, ...t, order: i, priority: "medium" } });
    }

    const p2 = await prisma.project.create({
      data: {
        userId,
        title: "Read 12 Books This Year",
        description: "One book per month — focus on business and self-improvement",
        priority: "medium",
        status: "active",
      },
    });
    for (const [i, t] of [
      { title: "Atomic Habits — James Clear", status: "completed" },
      { title: "Deep Work — Cal Newport", status: "completed" },
      { title: "The Psychology of Money", status: "in_progress" },
      { title: "Essentialism — Greg McKeown", status: "todo" },
    ].entries()) {
      await prisma.projectTask.create({ data: { projectId: p2.id, ...t, order: i, priority: "low" } });
    }

    const p3 = await prisma.project.create({
      data: {
        userId,
        title: "Get to 180 lbs Lean",
        description: "Physique goal by end of year — progressive overload + diet",
        priority: "high",
        status: "active",
        deadline: subDays(new Date(), -270),
      },
    });
    for (const [i, t] of [
      { title: "Set baseline measurements", status: "completed" },
      { title: "Design push/pull/legs program", status: "completed" },
      { title: "Track calories for 30 days", status: "in_progress" },
      { title: "Reach 185 lbs milestone", status: "todo" },
      { title: "Final deload and photo", status: "todo" },
    ].entries()) {
      await prisma.projectTask.create({ data: { projectId: p3.id, ...t, order: i, priority: "high" } });
    }

    // ── 5. Meals ───────────────────────────────────────────────────────────
    const mealDefs = [
      // Breakfast
      {
        category: "breakfast", name: "Greek Yogurt Protein Bowl", calories: 420, servings: 1,
        recipe: `Ingredients:\n- 200g Greek yogurt (non-fat)\n- 1 scoop vanilla protein powder\n- 1/2 cup mixed berries\n- 30g granola\n- 1 tbsp honey\n- 1 tbsp chia seeds\n\nSteps:\n1. Mix protein powder into yogurt until smooth\n2. Add berries and granola on top\n3. Drizzle honey and sprinkle chia seeds`,
        notes: "High protein, great post-workout breakfast",
      },
      {
        category: "breakfast", name: "Scrambled Eggs & Avocado Toast", calories: 510, servings: 1,
        recipe: `Ingredients:\n- 3 whole eggs\n- 1 slice sourdough bread\n- 1/2 avocado\n- Salt, pepper, red chili flakes\n- 1 tsp olive oil\n\nSteps:\n1. Toast the bread\n2. Mash avocado with salt and lemon\n3. Scramble eggs on medium heat in olive oil\n4. Layer avocado then eggs on toast`,
        notes: "Fill avocado with lemon juice to prevent browning",
      },
      {
        category: "breakfast", name: "Overnight Oats", calories: 380, servings: 1,
        recipe: `Ingredients:\n- 80g rolled oats\n- 200ml oat milk\n- 1 banana, sliced\n- 1 tbsp peanut butter\n- 1 tsp cinnamon\n\nPrep night before:\n1. Mix oats, milk, and cinnamon in a jar\n2. Refrigerate overnight\n3. Morning: top with banana slices and peanut butter`,
        notes: "Prep 3-4 jars on Sunday for the week",
      },
      // Lunch
      {
        category: "lunch", name: "Chicken & Rice Meal Prep", calories: 650, servings: 1,
        recipe: `Ingredients:\n- 200g chicken breast\n- 150g white rice (cooked)\n- 1 cup broccoli\n- 1 tbsp olive oil\n- Garlic powder, paprika, salt\n\nSteps:\n1. Season chicken with spices\n2. Pan-sear chicken 6-7 min each side\n3. Steam broccoli 5 min\n4. Serve chicken over rice with broccoli`,
        notes: "Batch cook 5 portions on Sunday",
      },
      {
        category: "lunch", name: "Salmon & Quinoa Bowl", calories: 580, servings: 1,
        recipe: `Ingredients:\n- 180g salmon fillet\n- 100g quinoa (cooked)\n- Spinach, cucumber, cherry tomatoes\n- Lemon tahini dressing\n\nSteps:\n1. Bake salmon 400°F for 12-15 min\n2. Cook quinoa per package instructions\n3. Assemble bowl with greens and veggies\n4. Drizzle dressing and top with salmon`,
        notes: "Omega-3 rich — great for recovery and brain health",
      },
      {
        category: "lunch", name: "Turkey & Veggie Wrap", calories: 480, servings: 1,
        recipe: `Ingredients:\n- 1 large whole wheat tortilla\n- 120g sliced turkey breast\n- Romaine lettuce, tomato, red onion\n- 2 tbsp hummus\n- Dijon mustard\n\nSteps:\n1. Spread hummus on tortilla\n2. Layer turkey and vegetables\n3. Add mustard\n4. Roll tightly and cut in half`,
        notes: "Quick 5-minute lunch",
      },
      // Dinner
      {
        category: "dinner", name: "Beef Stir-Fry with Brown Rice", calories: 720, servings: 1,
        recipe: `Ingredients:\n- 200g lean beef strips\n- 150g brown rice (cooked)\n- Bell peppers, broccoli, snap peas\n- 2 tbsp soy sauce, 1 tbsp oyster sauce\n- Garlic, ginger, sesame oil\n\nSteps:\n1. Cook rice first\n2. High heat wok — sear beef 2 min each side, set aside\n3. Stir-fry veggies 4-5 min\n4. Add sauces, return beef, toss to coat\n5. Drizzle sesame oil, serve over rice`,
        notes: "High protein dinner — great for muscle building",
      },
      {
        category: "dinner", name: "Baked Salmon with Sweet Potato", calories: 620, servings: 1,
        recipe: `Ingredients:\n- 200g salmon fillet\n- 1 medium sweet potato\n- Asparagus\n- Lemon, garlic butter\n- Salt, pepper, dill\n\nSteps:\n1. Preheat oven to 400°F\n2. Cube sweet potato, toss in olive oil, roast 25 min\n3. Season salmon with salt, pepper, dill, lemon\n4. Bake salmon 12-15 min\n5. Roast asparagus last 10 min of potato time`,
        notes: "Anti-inflammatory meal — ideal 2-3x per week",
      },
      {
        category: "dinner", name: "Pasta with Turkey Bolognese", calories: 680, servings: 1,
        recipe: `Ingredients:\n- 120g whole wheat pasta\n- 200g ground turkey\n- 1 can crushed tomatoes\n- Onion, garlic, Italian herbs\n- Parmesan to taste\n\nSteps:\n1. Cook pasta al dente\n2. Brown turkey with onion and garlic\n3. Add tomatoes + herbs, simmer 20 min\n4. Toss pasta with sauce\n5. Top with parmesan`,
        notes: "Leaner bolognese — swap beef for turkey to cut fat",
      },
      // Snacks
      {
        category: "snack", name: "Protein Shake", calories: 220, servings: 1,
        recipe: `Ingredients:\n- 1 scoop whey protein (chocolate)\n- 250ml whole milk\n- 1 banana\n- 1 tbsp almond butter\n- Ice cubes\n\nBlend all ingredients until smooth. Consume within 30 min of workout.`,
        notes: "Post-workout — drink within the anabolic window",
      },
      {
        category: "snack", name: "Rice Cakes with Peanut Butter", calories: 190, servings: 2,
        recipe: `- 2 plain rice cakes\n- 2 tbsp natural peanut butter\n- Optional: banana slices or honey\n\nSpread PB on rice cakes. Top with banana or drizzle honey.`,
        notes: "Clean pre-workout carbs + fats",
      },
      {
        category: "snack", name: "Mixed Nuts & Fruit", calories: 280, servings: 1,
        recipe: `- 40g mixed nuts (almonds, walnuts, cashews)\n- 1 apple or pear\n\nPair nuts with fruit for balanced snack with fiber and healthy fats.`,
        notes: "Keep a pre-portioned bag in your bag",
      },
    ];

    for (const [i, def] of mealDefs.entries()) {
      await prisma.meal.create({
        data: {
          userId,
          name: def.name,
          category: def.category,
          recipe: def.recipe,
          calories: def.calories,
          servings: def.servings,
          notes: def.notes,
          order: i,
        },
      });
    }

    return NextResponse.json({
      message: "Full seed complete",
      counts: {
        dailyEntries: dailyData.length,
        habits: habitDefs.length,
        routines: routineDefs.length,
        projects: 3,
        meals: mealDefs.length,
      },
    }, { status: 201 });

  } catch (error) {
    console.error("[seed] error:", error);
    return NextResponse.json({ message: "Internal server error", error: String(error) }, { status: 500 });
  }
}
