/**
 * Live scores: grade today from numbered facts, and explain the grade with those facts only.
 *
 * Code writes every word he reads: the facts ("✓ Pay rent", "Slept 6h, under 7") and the
 * improvement options ("Finish “Call bank”"). The model only picks numbers: a score near the
 * rule-based baseline, which facts matter, which option helps most. It can't invent anything.
 */
import { addDays } from "date-fns";
import prisma from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { SCORED_AREAS, type ScoredArea } from "@/lib/areas";
import { chat, parseJson, LLM_MODEL } from "@/lib/ai/llm";
import type { NutritionTargets } from "@/lib/nutrition-schema";
import { MICRO_META, sumMicros, type MicroKey, type Micros } from "@/lib/nutrition-micros";
import { readRationale, type AreaRationale, type Rationale } from "@/lib/score-rationale";
import { getDayOfWeek, getStartOfDay } from "@/lib/utils";
import { shortHash } from "./storage";
import { reportError } from "@/lib/monitoring";

export interface Fact {
  n: number;
  area: ScoredArea;
  text: string;
  /** +1 good for the score, -1 bad, 0 neutral. */
  polarity: 1 | 0 | -1;
  /** How much it counts (a workout or a night's sleep outweighs one small to-do). */
  weight: number;
}

export interface Option {
  code: string;
  area: ScoredArea;
  text: string;
}

export interface DayFacts {
  facts: Fact[];
  options: Option[];
  journal: string | null;
  entryId: string | null;
  fingerprint: string;
}

const q = (s: string) => `“${s.length > 60 ? `${s.slice(0, 59)}…` : s}”`;
const pct = (v: number, t: number) => Math.round((v / t) * 100);
const r0 = (n: number) => Math.round(n);

/** Share of the waking day (7am–10pm) that has passed, so "so far" targets are fair mid-day. */
export function dayProgress(now: Date, day: Date, final: boolean) {
  if (final || getStartOfDay(now).getTime() > day.getTime()) return 1;
  const h = now.getHours() + now.getMinutes() / 60;
  return Math.max(0.1, Math.min(1, (h - 7) / 15));
}

/** "23:30", "11:30pm", "1am" → minutes after 6pm (so after-midnight times sort later). Null if unreadable. */
export function bedtimeMinutes(s: string | null | undefined) {
  const m = s?.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]) % 24;
  if (m[3] === "pm" && h < 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  const mins = h * 60 + Number(m[2] ?? 0);
  return (mins - 18 * 60 + 1440) % 1440;
}

/** Body stats and targets (BrainState "body"): age, height, weight, goal, sleep and step targets. */
export interface BodyInfo {
  age?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  goal?: "cut" | "bulk" | "maintain" | "recomp" | null;
  sleepTargetHours?: number | null;
  stepsTarget?: number | null;
  measurementDate?: string | null;
}
export const BODY_STATE_KEY = "body";

const WORKOUT_HABIT = /\b(workout|work out|train(ing)?|gym|lift(ing)?)\b/i;

/** "Drink 100 oz of water" + "did 60 oz" → 0.6. Null when there aren't comparable numbers. */
export function partialRatio(habit: string, note: string) {
  const target = habit.match(/(\d+(?:\.\d+)?)/)?.[1];
  const got = note.match(/(\d+(?:\.\d+)?)/)?.[1];
  if (!target || !got) return null;
  const r = Number(got) / Number(target);
  return Number.isFinite(r) && r > 0 ? Math.min(1, r) : null;
}

const GOOD_MICROS: MicroKey[] = ["potassium", "magnesium", "vitaminC", "vitaminA", "zinc", "calcium", "iron"];

/**
 * Everything knowable about a day, as numbered facts and improvement options per area.
 * Every area takes in all of its factors:
 * - physical: training (sessions, volume, sports, weekly count, days since last), nutrition
 *   (calories, protein, carbs, fat vs targets, fiber, sugar, sodium, vitamins and minerals, meal
 *   regularity, late eating), sleep (hours, bedtime), steps, physical habits and tasks
 * - mental: tasks done, due and overdue, day-plan completion, deep work, screen time, mood,
 *   journal depth, reminders, mental/work habits
 * - financial: spending vs your usual, saving, income work, money tasks
 * - spiritual: right with God, spiritual habits, prayer/gratitude in the journal
 * Live (mid-day) grading scales targets to how much of the day has passed.
 */
export async function buildFacts(userId: string, date: Date, opts: { final?: boolean; now?: Date } = {}): Promise<DayFacts> {
  const day = getStartOfDay(date);
  const next = addDays(day, 1);
  const dow = getDayOfWeek(day);
  const final = opts.final ?? false;
  const now = opts.now ?? new Date();
  const progress = dayProgress(now, day, final);
  const [entry, todosDone, todosDue, tasksDone, habits, workouts, recentWorkouts, meals, remindersDone, owner, plan, recentEntries, bodyRow, weekMeals] = await Promise.all([
    prisma.dailyEntry.findUnique({ where: { userId_date: { userId, date: day } } }),
    prisma.todo.findMany({ where: { userId, status: "done", completedAt: { gte: day, lt: next } }, select: { id: true, title: true, area: true }, orderBy: { completedAt: "asc" } }),
    prisma.todo.findMany({ where: { userId, status: "open", dueAt: { lt: next } }, select: { title: true, area: true, dueAt: true }, orderBy: { dueAt: "asc" }, take: 30 }),
    prisma.projectTask.findMany({
      where: { project: { userId }, status: "completed", completedAt: { gte: day, lt: next } },
      select: { id: true, title: true, area: true, project: { select: { title: true, area: true } } },
    }),
    prisma.habit.findMany({
      where: { userId, isActive: true, targetDays: { has: dow }, createdAt: { lt: next } },
      select: { name: true, area: true, logs: { where: { date: day }, select: { completed: true, notes: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.workoutSession.findMany({
      where: { userId, date: { gte: day, lt: next } },
      select: { routine: { select: { name: true } }, exerciseLogs: { select: { exerciseName: true, weight: true, sets: true, reps: true } } },
    }),
    prisma.workoutSession.findMany({ where: { userId, date: { gte: addDays(day, -6), lt: day } }, select: { date: true }, orderBy: { date: "desc" } }),
    prisma.meal.findMany({
      where: { userId, status: "eaten", plannedFor: { gte: day, lt: next } },
      select: { name: true, calories: true, protein: true, carbs: true, fat: true, micros: true, plannedFor: true },
      orderBy: { plannedFor: "asc" },
    }),
    prisma.reminder.count({ where: { userId, status: "done", updatedAt: { gte: day, lt: next } } }),
    prisma.user.findUnique({ where: { id: userId }, select: { nutritionTargets: true } }),
    prisma.dayPlan.findUnique({ where: { userId_date: { userId, date: day } } }),
    prisma.dailyEntry.findMany({ where: { userId, date: { gte: addDays(day, -14), lt: day } }, select: { date: true, moneySpent: true, workoutCompleted: true, sportsTrainingMinutes: true } }),
    prisma.brainState.findUnique({ where: { key: BODY_STATE_KEY } }),
    prisma.meal.findMany({ where: { userId, status: "eaten", plannedFor: { gte: addDays(day, -6), lt: day } }, select: { calories: true, protein: true, plannedFor: true } }),
  ]);
  const body = (bodyRow?.value ?? {}) as BodyInfo;
  const sleepTarget = body.sleepTargetHours ?? 8;
  const stepsTarget = body.stepsTarget ?? 8000;
  const bulking = body.goal === "bulk";

  const facts: Fact[] = [];
  const options: Option[] = [];
  const fact = (area: string | null | undefined, text: string, polarity: Fact["polarity"], weight = 1) => {
    const a = (SCORED_AREAS as readonly string[]).includes(area ?? "") ? (area as ScoredArea) : "mental";
    // Every line starts with ✓ (helps), ✗ (hurts) or • (neutral), so the UI can show it at a glance.
    const marked = /^[✓✗•]/.test(text) ? text : `${polarity > 0 ? "✓" : polarity < 0 ? "✗" : "•"} ${text}`;
    facts.push({ n: facts.length + 1, area: a, text: marked, polarity, weight });
  };
  const option = (area: ScoredArea, text: string) => {
    if (options.filter((o) => o.area === area).length >= 6 || options.some((o) => o.text === text)) return;
    options.push({ code: String.fromCharCode(65 + options.length), area, text });
  };
  const scoredArea = (a: string | null | undefined): ScoredArea => ((SCORED_AREAS as readonly string[]).includes(a ?? "") ? (a as ScoredArea) : "mental");
  const soFar = final ? "" : " so far";

  // ---- PHYSICAL: training ---------------------------------------------------------------------
  let trained = false;
  for (const w of workouts) {
    trained = true;
    const sets = w.exerciseLogs.reduce((sum, x) => sum + (x.sets ?? 1), 0);
    const top = w.exerciseLogs.slice(0, 3).map((x) => `${x.exerciseName}${x.weight ? ` ${x.weight}` : ""}${x.sets ? ` ${x.sets}×${x.reps ?? ""}` : ""}`).join(", ");
    const size = w.exerciseLogs.length ? ` — ${w.exerciseLogs.length} exercise${w.exerciseLogs.length === 1 ? "" : "s"}, ${sets} sets${top ? ` (${top})` : ""}` : "";
    fact("physical", `Workout: ${q(w.routine.name)}${size}`, 1, sets >= 12 ? 3 : 2.5);
  }
  if (entry?.workoutCompleted && !workouts.length) {
    trained = true;
    const mins = entry.workoutDurationMinutes;
    fact("physical", `Workout: ${entry.workoutRoutineName ?? entry.workoutDetails ?? "done"}${mins ? ` (${mins} min${entry.workoutIntensity ? `, ${entry.workoutIntensity}` : ""})` : ""}`, 1, mins && mins >= 45 ? 3 : 2.5);
  }
  // A ticked "Workout" habit counts as training even without a logged session.
  const workoutHabit = habits.find((h) => WORKOUT_HABIT.test(h.name) && h.logs[0]?.completed);
  if (workoutHabit && !trained) {
    trained = true;
    fact("physical", `Worked out (checked off “${workoutHabit.name}”)${workoutHabit.logs[0]?.notes ? ` — “${workoutHabit.logs[0].notes.slice(0, 80)}”` : ""}`, 1, 2.5);
  }
  if (entry?.sportsTrainingMinutes) {
    trained = true;
    fact("physical", `Sports / fight training ${entry.sportsTrainingMinutes} min`, entry.sportsTrainingMinutes >= 20 ? 1 : 0, entry.sportsTrainingMinutes >= 60 ? 3 : 2);
  }
  const habitTrained = await prisma.habitLog.findMany({
    where: { completed: true, date: { gte: addDays(day, -6), lt: day }, habit: { userId, OR: [{ name: { contains: "workout", mode: "insensitive" } }, { name: { contains: "gym", mode: "insensitive" } }, { name: { contains: "train", mode: "insensitive" } }] } },
    select: { date: true },
  });
  const trainedDays = new Set([
    ...habitTrained.map((l) => getStartOfDay(l.date).getTime()),
    ...recentWorkouts.map((w) => getStartOfDay(w.date).getTime()),
    ...recentEntries.filter((e) => e.workoutCompleted || (e.sportsTrainingMinutes ?? 0) >= 20).map((e) => getStartOfDay(e.date).getTime()),
  ]);
  const weekCount = [...trainedDays].filter((t) => t >= addDays(day, -6).getTime()).length + (trained ? 1 : 0);
  if (weekCount) fact("physical", `${weekCount} training day${weekCount === 1 ? "" : "s"} in the last 7`, weekCount >= 3 ? 1 : 0, 1);
  if (!trained) {
    const last = [...trainedDays].sort((a, b) => b - a)[0];
    const since = last ? Math.round((day.getTime() - last) / 86_400_000) : null;
    if (since === 1 && final) fact("physical", "Rest day (trained yesterday)", 0, 1);
    else if (since == null || since >= 3) fact("physical", since == null ? `No training${soFar} this week` : `No training${soFar} — last session ${since} days ago`, final || since == null || since >= 3 ? -1 : 0, final ? 2 : 1.5);
    option("physical", "Get a workout or training session in and log it");
  }

  // ---- PHYSICAL: nutrition --------------------------------------------------------------------
  const targets = (owner?.nutritionTargets ?? null) as NutritionTargets | null;
  if (meals.length) {
    const sum = (k: "calories" | "protein" | "carbs" | "fat") => meals.reduce((t, m) => t + (m[k] ?? 0), 0);
    const kcal = r0(sum("calories"));
    const protein = r0(sum("protein"));
    const carbs = r0(sum("carbs"));
    const fat = r0(sum("fat"));
    fact("physical", `Food logged${soFar}: ${meals.length} meal${meals.length === 1 ? "" : "s"}, ${kcal} kcal, P ${protein} g · C ${carbs} g · F ${fat} g`, meals.length >= 2 || !final ? 1 : 0, 0.75);

    if (targets?.calories) {
      const t = targets.calories;
      if (final) {
        const off = kcal / t;
        // Bulking: a bit over is fine, under is what hurts. Otherwise both directions count.
        const [lo, hi, bad] = bulking ? [0.9, 1.2, [0.8, 1.35]] : [0.9, 1.1, [0.7, 1.25]];
        const label = off > hi ? " — over" : off < lo ? ` — under${bulking ? " your bulk target" : ""}` : " — on target";
        fact("physical", `Calories ${kcal}/${t} (${pct(kcal, t)}% of target)${label}`, off >= lo && off <= hi ? 1 : off > bad[1] || off < bad[0] ? -1 : 0, 1.5);
      } else if (kcal > t * (bulking ? 1.3 : 1.1)) {
        fact("physical", `Calories ${kcal}/${t} — already over the day's target`, -1, 2);
        option("physical", "Keep the rest of today's food light — you're over on calories");
      } else {
        fact("physical", `Calories ${kcal}/${t}${soFar} (${kcal >= t * progress * 0.7 ? "on pace" : "behind pace"})`, 0, 1);
      }
    } else fact("physical", `Calories ${kcal}${soFar} (no daily target set)`, 0, 0.5);

    if (targets?.protein) {
      const t = targets.protein;
      const ratio = protein / t;
      if (ratio >= 0.9) fact("physical", `Protein ${protein}/${t} g — target hit`, 1, 1.5);
      else if (final) fact("physical", `Protein ${protein}/${t} g (${pct(protein, t)}%)`, ratio < 0.7 ? -1 : 0, 1.5);
      else fact("physical", `Protein ${protein}/${t} g${soFar}${ratio >= progress * 0.8 ? " (on pace)" : " (behind)"}`, ratio >= progress * 0.8 ? 0 : -1, 1);
      if (ratio < 0.9) option("physical", `Get ~${r0(t - protein)} g more protein (you're at ${protein}/${t} g)`);
    } else if (final) fact("physical", `Protein ${protein} g`, protein >= 100 ? 1 : protein < 50 ? -1 : 0, 1);
    for (const [k, v] of [["carbs", carbs], ["fat", fat]] as const) {
      const t = targets?.[k];
      if (!t || !final) continue;
      const ratio = v / t;
      if (ratio > 1.3 || ratio < 0.5) fact("physical", `${k === "carbs" ? "Carbs" : "Fat"} ${v}/${t} g (${pct(v, t)}%)`, -1, 0.5);
    }

    const micros = sumMicros(meals.map((m) => m.micros as Micros | null));
    if (Object.keys(micros).length) {
      const target = (k: MicroKey) => (targets as Record<string, number | null | undefined> | null)?.[k] ?? MICRO_META[k].target;
      for (const k of ["sugar", "sodium"] as MicroKey[]) {
        const v = micros[k] ?? 0;
        // Tracked sugar is TOTAL sugar (fruit and milk included); his limit is for added sugar,
        // so total sugar is judged against the general 50 g line, never tighter.
        const t = k === "sugar" ? Math.max(target(k), MICRO_META.sugar.target) : target(k);
        if (v > t) {
          fact("physical", `${k === "sugar" ? "Total sugar" : MICRO_META[k].label} ${r0(v)}/${t} ${MICRO_META[k].unit} — over the limit`, -1, k === "sugar" ? 0.75 : 1);
          option("physical", `Go easy on ${k === "sugar" ? "sweets and sugary drinks" : "salty and processed food"} for the rest of today`);
        } else if (final) fact("physical", `${k === "sugar" ? "Total sugar" : MICRO_META[k].label} ${r0(v)} ${MICRO_META[k].unit} — under the ${t} ${MICRO_META[k].unit} limit`, 1, 0.5);
      }
      const fiber = micros.fiber ?? 0;
      const ft = target("fiber");
      if (final || fiber >= ft * 0.8) fact("physical", `Fiber ${r0(fiber)}/${ft} g`, fiber >= ft * 0.8 ? 1 : fiber < ft * 0.4 ? -1 : 0, 0.75);
      const met = GOOD_MICROS.filter((k) => (micros[k] ?? 0) >= target(k) * 0.7 * progress);
      const low = GOOD_MICROS.filter((k) => !met.includes(k))
        .sort((a, b) => (micros[a] ?? 0) / target(a) - (micros[b] ?? 0) / target(b))
        .map((k) => MICRO_META[k].label);
      fact(
        "physical",
        `Vitamins & minerals${soFar}: ${met.length}/${GOOD_MICROS.length} on track${low.length ? ` (low: ${low.slice(0, 4).join(", ")})` : ""}`,
        met.length >= 5 ? 1 : final && met.length <= 2 ? -1 : 0,
        1
      );
      if (low.length) option("physical", `Add foods rich in ${low.slice(0, 2).join(" and ")}`);
    }
    const late = meals.filter((m) => m.plannedFor && (m.plannedFor.getHours() >= 22 || m.plannedFor.getHours() < 4));
    if (late.length) fact("physical", `Ate late at night: ${late.map((m) => q(m.name)).join(", ")}`, -1, 0.5);
    if (final && meals.length === 1) fact("physical", "Only one meal logged all day", -1, 0.5);
  } else {
    if (final) fact("physical", "No food logged — nutrition can't be judged", 0, 0.5);
    option("physical", "Log what you eat on the Food page");
  }

  // One day is noisy: the last 7 days of logged food say more about calories and protein.
  const byDay = new Map<string, { kcal: number; protein: number }>();
  for (const m of weekMeals) {
    if (!m.plannedFor) continue;
    const k = getStartOfDay(m.plannedFor).toISOString();
    const d = byDay.get(k) ?? { kcal: 0, protein: 0 };
    d.kcal += m.calories ?? 0;
    d.protein += m.protein ?? 0;
    byDay.set(k, d);
  }
  if (byDay.size >= 3) {
    const days = [...byDay.values()];
    const avgK = r0(days.reduce((a, d) => a + d.kcal, 0) / days.length);
    const avgP = r0(days.reduce((a, d) => a + d.protein, 0) / days.length);
    const tk = targets?.calories;
    const tp = targets?.protein;
    const kOk = tk ? avgK / tk : null;
    const pOk = tp ? avgP / tp : null;
    const good = (kOk == null || kOk >= 0.9) && (pOk == null || pOk >= 0.9) && (kOk != null || pOk != null);
    const bad = (kOk != null && kOk < 0.8) || (pOk != null && pOk < 0.75);
    fact("physical", `Last ${days.length} logged days: avg ${avgK}${tk ? `/${tk}` : ""} kcal, ${avgP}${tp ? `/${tp}` : ""} g protein`, good ? 1 : bad ? -1 : 0, 1.5);
  }

  // ---- PHYSICAL: sleep, steps ------------------------------------------------------------------
  if (entry?.sleepHours != null) {
    const sl = entry.sleepHours;
    const t = sleepTarget;
    const note = sl < t - 1.5 ? ` (well under your ${t} h target)` : sl < t - 0.5 ? ` (under your ${t} h target)` : sl > t + 1.5 ? " (oversleeping)" : ` (on your ${t} h target)`;
    fact("physical", `Slept ${sl} h${note}`, sl < t - 1 ? -1 : sl >= t - 0.5 && sl <= t + 1.5 ? 1 : 0, sl < t - 1.5 ? 2.5 : 2);
  } else option("physical", "Log last night's sleep in the Journal");
  const bed = bedtimeMinutes(entry?.bedtime);
  if (bed != null) fact("physical", `Bedtime ${entry!.bedtime}${bed > 6.5 * 60 ? " (after 12:30am)" : bed <= 5 * 60 ? " (before 11pm)" : ""}`, bed > 6.5 * 60 ? -1 : bed <= 5 * 60 ? 1 : 0, 0.75);
  if (entry?.steps != null) {
    const st = entry.steps;
    fact("physical", `${st.toLocaleString("en-US")} steps (target ${stepsTarget.toLocaleString("en-US")})`, st >= stepsTarget ? 1 : st < stepsTarget * 0.5 && final ? -1 : 0, 1);
    if (st < stepsTarget) option("physical", `Walk ~${(stepsTarget - st).toLocaleString("en-US")} more steps`);
  }
  if (entry?.caloriesEaten != null && !meals.length) fact("physical", `Calories ${entry.caloriesEaten} (quick log)`, 0, 0.5);

  // ---- tasks and habits (every area) -----------------------------------------------------------
  for (const t of todosDone) fact(t.area, `Done: ${q(t.title)}`, 1, 1);
  for (const t of tasksDone) fact(t.area ?? t.project.area, `Done: ${q(t.title)} (${t.project.title})`, 1, 1);
  const overdue = todosDue.filter((t) => t.dueAt! < day);
  const dueToday = todosDue.filter((t) => t.dueAt! >= day);
  for (const t of dueToday) {
    fact(t.area, `${final ? "Not done (was due today)" : "Due today, not done yet"}: ${q(t.title)}`, final ? -1 : 0, final ? 1.25 : 0.75);
    option(scoredArea(t.area), `Finish ${q(t.title)}`);
  }
  // Old overdue items count once per area, not once per day forever.
  const overdueBy = new Map<ScoredArea, typeof overdue>();
  for (const t of overdue) overdueBy.set(scoredArea(t.area), [...(overdueBy.get(scoredArea(t.area)) ?? []), t]);
  for (const [area, list] of overdueBy) {
    const oldest = list[0];
    const days = Math.max(1, Math.round((day.getTime() - getStartOfDay(oldest.dueAt!).getTime()) / 86_400_000));
    fact(area, list.length === 1 ? `Overdue ${days}d: ${q(oldest.title)}` : `${list.length} overdue items (oldest: ${q(oldest.title)}, ${days}d)`, -1, Math.min(2, 1 + list.length * 0.25));
    option(area, `Clear ${q(oldest.title)} (overdue ${days}d)`);
  }
  for (const h of habits) {
    const done = h.logs[0]?.completed;
    const note = h.logs[0]?.notes?.trim();
    const area = h.area === "general" || h.area === "work" ? "mental" : h.area;
    // The workout habit is counted once, as training (above).
    if (WORKOUT_HABIT.test(h.name) && (done || trained)) continue;
    if (!done && note) {
      // His note says how much he did ("did 60 oz"): partial credit, not a zero.
      const ratio = partialRatio(h.name, note);
      const polarity = ratio == null ? 0 : ratio >= 0.9 ? 1 : ratio >= 0.5 ? 0 : final ? -1 : 0;
      fact(area, `Habit partly done: ${q(h.name)} — “${note.slice(0, 80)}”${ratio != null ? ` (${Math.round(ratio * 100)}%)` : ""}`, polarity as Fact["polarity"], 1.25);
      if (ratio == null || ratio < 0.9) option(scoredArea(area), `Finish ${q(h.name)}`);
      continue;
    }
    fact(area, done ? `Habit done: ${q(h.name)}${note ? ` — “${note.slice(0, 80)}”` : ""}` : `Habit ${final ? "missed" : "not done yet"}: ${q(h.name)}`, done ? 1 : final ? -1 : 0, done ? 1.25 : final ? 1.25 : 0.75);
    if (!done) option(scoredArea(area), `Do your habit ${q(h.name)}`);
  }

  // ---- MENTAL ----------------------------------------------------------------------------------
  const planItems = ((plan?.items ?? []) as { id: string; type: string }[]).filter((i) => i.type === "todo" || i.type === "task");
  if (planItems.length) {
    const doneIds = new Set([...todosDone.map((t) => t.id), ...tasksDone.map((t) => t.id)]);
    const done = planItems.filter((i) => doneIds.has(i.id)).length;
    const ratio = done / planItems.length;
    fact("mental", `Day plan: ${done}/${planItems.length} focus items done${soFar}`, ratio >= 0.7 ? 1 : final && ratio < 0.4 ? -1 : 0, 2);
  }
  if (entry?.screenTimeHours != null) {
    const st = entry.screenTimeHours;
    fact("mental", `Screen time ${st} h${st > 4 ? " (high)" : st <= 2 ? " (low, good)" : ""}`, st > 4 ? -1 : st <= 2 ? 1 : 0, st > 6 ? 2 : 1.5);
    if (st > 4) option("mental", "Put the phone away for the next hour");
  }
  if (entry?.deepWorkHours != null) fact("mental", `Deep work ${entry.deepWorkHours} h`, entry.deepWorkHours >= 2 ? 1 : final && entry.deepWorkHours < 0.5 ? -1 : 0, 2);
  if (entry?.overallDayRating != null) fact("mental", `You rated the day ${entry.overallDayRating}/10`, entry.overallDayRating >= 7 ? 1 : entry.overallDayRating <= 4 ? -1 : 0, 1.5);
  if (entry?.tasksPlanned != null) fact("mental", `Tasks ${entry.tasksCompleted ?? 0}/${entry.tasksPlanned}`, (entry.tasksCompleted ?? 0) >= entry.tasksPlanned * 0.7 ? 1 : -1, 1.5);
  if (remindersDone) fact("mental", `${remindersDone} reminder${remindersDone === 1 ? "" : "s"} acted on`, 1, 0.5);
  const journal = entry?.notes?.trim() || null;
  if (journal) {
    const words = journal.split(/\s+/).length;
    fact("mental", words >= 40 ? `Journal written (${words} words, reflective)` : `Journal written (${words} words)`, 1, words >= 40 ? 1.5 : 0.75);
  } else {
    if (final) fact("mental", "No journal entry", -1, 0.75);
    option("mental", "Write a few lines in your Journal");
  }

  // ---- FINANCIAL -------------------------------------------------------------------------------
  const usualSpend = recentEntries.map((e) => e.moneySpent).filter((x): x is number => x != null);
  const usual = usualSpend.length >= 3 ? usualSpend.reduce((a, b) => a + b, 0) / usualSpend.length : null;
  if (entry?.moneySpent != null) {
    const sp = entry.moneySpent;
    if (usual != null && sp > Math.max(20, usual * 2)) {
      fact("financial", `Spent $${sp} — ${(sp / Math.max(1, usual)).toFixed(1)}× your usual $${r0(usual)}`, -1, 2);
      option("financial", "No more spending today");
    } else if (usual != null) fact("financial", `Spent $${sp} (your usual: $${r0(usual)})`, sp <= usual ? 1 : 0, 1.5);
    else fact("financial", `Spent $${sp}`, sp === 0 ? 1 : 0, 1);
  }
  if (entry?.moneySaved != null) fact("financial", `Saved $${entry.moneySaved}`, entry.moneySaved > 0 ? 1 : 0, 2);
  if (entry?.incomeActivity) fact("financial", "Worked on income / business", 1, 2);
  if (entry?.moneySpent == null && entry?.moneySaved == null) option("financial", "Log what you spent or saved today (Journal → Quick log)");
  if (!entry?.incomeActivity) option("financial", "Put 30 minutes into your business or income");

  // ---- SPIRITUAL -------------------------------------------------------------------------------
  if (entry?.rightWithGod) fact("spiritual", "Marked right with God", 1, 2);
  else {
    if (final && (entry || facts.some((f) => f.area === "spiritual"))) fact("spiritual", "Didn't mark right with God", -1, 1.5);
    option("spiritual", "Take a few minutes to pray, then mark “Right with God” in the Journal");
  }
  const faithWords = journal?.match(/\b(god|pray(ed|ing)?|prayer|bible|church|grateful|thankful|blessed|faith|jesus|lord)\b/gi);
  if (faithWords?.length) fact("spiritual", `Journal mentions ${[...new Set(faithWords.map((w) => w.toLowerCase()))].slice(0, 3).join(", ")}`, 1, 0.75);

  const fingerprint = shortHash(JSON.stringify([facts.map((f) => [f.text, f.polarity]), !!journal, final]), 12);
  return { facts, options, journal, entryId: entry?.id ?? null, fingerprint };
}

/** Rule-based anchor: 5 with no signal, up with good facts, down with bad ones, weighted. Null = no data. */
export function baseline(facts: Fact[]): number | null {
  if (!facts.length) return null;
  const w = (f: Fact) => f.weight ?? 1;
  const pos = facts.filter((f) => f.polarity > 0).reduce((s, f) => s + w(f), 0);
  const neg = facts.filter((f) => f.polarity < 0).reduce((s, f) => s + w(f), 0);
  return Math.max(0, Math.min(10, Math.round(5 + (5 * (pos - neg)) / (pos + neg + 1))));
}

// Byte-stable for the prompt cache.
export const GRADE_SYSTEM = `You grade Abhay's day in life areas from 0 to 10, using ONLY his numbered facts. Weigh ALL of an area's facts, not just one: for physical that means training, food and nutrients, sleep and steps together.
Facts marked (major) matter most. ✓ helps, ✗ hurts, • is neutral context.
Scale: 10 exceptional, 8 strong, 6 decent, 4 weak, 2 very poor. Each area has a suggested score computed from all its facts; stay within 1 of it.
For each area give:
- score
- why: the numbers of the 2 to 4 facts that matter most for that area's score, good and bad
- improve: the letter of the ONE option that would raise that area most, or "" if it has no options
Use only numbers and letters that appear under that area. Reply with minified JSON only.`;

export interface AreaGrade {
  score: number | null;
  rationale: AreaRationale;
}

const byWeight = (a: Fact, b: Fact) => (b.weight ?? 1) - (a.weight ?? 1) || a.n - b.n;

/** Turn the model's picks (or none) into a grade whose every word comes from code. */
export function renderGrade(area: ScoredArea, facts: Fact[], options: Option[], pick: { score?: unknown; why?: unknown; improve?: unknown } | null): AreaGrade {
  const mine = facts.filter((f) => f.area === area);
  const opts = options.filter((o) => o.area === area);
  const h = shortHash(JSON.stringify(mine.map((f) => [f.text, f.polarity])), 10);
  const base = baseline(mine);
  if (base == null) return { score: null, rationale: { why: [], improve: opts[0]?.text ?? null, more: opts.slice(1, 3).map((o) => o.text), all: [], noData: true, h } };

  let score = base;
  const n = Number(pick?.score);
  // The model may only nudge the fact-based score by one point either way.
  if (Number.isFinite(n)) score = Math.max(Math.max(0, base - 1), Math.min(Math.min(10, base + 1), Math.round(n)));

  const cited = (Array.isArray(pick?.why) ? pick!.why : [])
    .map(Number)
    .map((x) => mine.find((f) => f.n === x))
    .filter((f): f is Fact => !!f);
  const why = [...new Set(cited)].slice(0, 4);
  if (why.length < 2) {
    // Top up with the heaviest signals either way, so a reason is never one-sided by accident.
    const signals = [...mine].filter((f) => f.polarity !== 0).sort(byWeight);
    const fill = [...signals.filter((f) => f.polarity < 0).slice(0, 1), ...signals.filter((f) => f.polarity > 0).slice(0, 2), ...[...mine].sort(byWeight)];
    for (const f of fill) if (why.length < 3 && !why.includes(f)) why.push(f);
  }
  const code = String(pick?.improve ?? "").trim().toUpperCase();
  const chosen = opts.find((o) => o.code === code) ?? opts[0] ?? null;
  const all = [...mine].sort((a, b) => a.polarity - b.polarity || byWeight(a, b)).map((f) => f.text);
  return {
    score,
    rationale: { why: why.map((f) => f.text), improve: chosen?.text ?? null, more: opts.filter((o) => o !== chosen).slice(0, 2).map((o) => o.text), all, noData: false, h },
  };
}

function gradeSchema(areas: ScoredArea[]) {
  return {
    type: "object",
    properties: Object.fromEntries(
      areas.map((a) => [
        a,
        {
          type: "object",
          properties: { score: { type: "integer", minimum: 0, maximum: 10 }, why: { type: "array", items: { type: "integer" }, maxItems: 4 }, improve: { type: "string" } },
          required: ["score", "why", "improve"],
        },
      ])
    ),
    required: areas,
  };
}

export function gradePrompt(areas: ScoredArea[], facts: Fact[], options: Option[]) {
  return areas
    .map((a) => {
      const mine = facts.filter((f) => f.area === a).sort(byWeight);
      const opts = options.filter((o) => o.area === a);
      return [
        `${a.toUpperCase()} (suggested ${baseline(mine)})`,
        ...mine.map((f) => `${f.n}. ${f.text}${(f.weight ?? 1) >= 2 ? " (major)" : ""}`),
        opts.length ? `Options: ${opts.map((o) => `${o.code}) ${o.text}`).join(" ")}` : "Options: none",
      ].join("\n");
    })
    .join("\n\n");
}

export interface GradeResult {
  scores: Record<ScoredArea, number | null>;
  rationale: Rationale;
  overall: number;
  usedModel: boolean;
  skipped: boolean;
}

/**
 * Grade a day and store it. Areas whose facts haven't changed since the last grade keep their
 * score and reasons (no drift without new facts). Throws LlmAborted if cancelled.
 */
export async function gradeDay(userId: string, date: Date, opts: { final?: boolean; useModel?: boolean; signal?: AbortSignal; facts?: DayFacts } = {}): Promise<GradeResult> {
  const day = getStartOfDay(date);
  const df = opts.facts ?? (await buildFacts(userId, day, { final: opts.final }));
  const existing = await prisma.categoryScore.findUnique({ where: { userId_date: { userId, date: day } } });
  // Reuse only model grades; a rules-only grade (model was busy/down) gets another try.
  const prev = existing?.judgedBy && existing.judgedBy !== "rules" && !existing.finalized ? readRationale(existing.rationale) : null;

  const grades = {} as Record<ScoredArea, AreaGrade>;
  const toGrade: ScoredArea[] = [];
  for (const a of SCORED_AREAS) {
    const fresh = renderGrade(a, df.facts, df.options, null);
    if (prev?.[a]?.h && prev[a].h === fresh.rationale.h && !opts.final) {
      grades[a] = { score: prev[a].noData ? null : existing![a], rationale: { ...prev[a], improve: fresh.rationale.improve, more: fresh.rationale.more, all: fresh.rationale.all } };
    } else {
      grades[a] = fresh;
      if (fresh.score != null) toGrade.push(a);
    }
  }

  let usedModel = false;
  if (toGrade.length && opts.useModel !== false) {
    try {
      const result = await chat({
        messages: [
          { role: "system", content: GRADE_SYSTEM },
          { role: "user", content: gradePrompt(toGrade, df.facts, df.options) },
        ],
        schema: gradeSchema(toGrade),
        temperature: 0.2,
        maxTokens: 70 * toGrade.length,
        timeoutMs: 150_000,
        signal: opts.signal,
      });
      const raw = parseJson<Record<string, { score?: unknown; why?: unknown; improve?: unknown }>>(result.content);
      if (raw) {
        for (const a of toGrade) grades[a] = renderGrade(a, df.facts, df.options, raw[a] ?? null);
        usedModel = true;
      }
    } catch (error) {
      if (opts.signal?.aborted) throw error;
      // Model down or confused: the rule-based grade with code-picked reasons stands.
      reportError({ context: "grade", error, userId });
    }
  }

  const scores = Object.fromEntries(SCORED_AREAS.map((a) => [a, grades[a].score])) as Record<ScoredArea, number | null>;
  const scored = SCORED_AREAS.filter((a) => scores[a] != null);
  const overall = scored.length ? Math.round((scored.reduce((s, a) => s + scores[a]!, 0) / scored.length) * 10) / 10 : 0;
  const rationale = Object.fromEntries(SCORED_AREAS.map((a) => [a, grades[a].rationale])) as Rationale;
  const data = {
    physical: scores.physical ?? 0,
    mental: scores.mental ?? 0,
    financial: scores.financial ?? 0,
    spiritual: scores.spiritual ?? 0,
    overall,
    rationale: { v: 2, ...rationale } as unknown as Prisma.InputJsonValue,
    judgedBy: usedModel ? LLM_MODEL : prev ? existing!.judgedBy : "rules",
    dailyEntryId: df.entryId,
    finalized: !!opts.final,
  };
  await prisma.categoryScore.upsert({
    where: { userId_date: { userId, date: day } },
    update: data,
    create: { userId, date: day, ...data },
  });
  return { scores, rationale, overall, usedModel, skipped: false };
}

export const LIVE_STATE_KEY = "live-scores";

export interface LiveScoreState {
  /** Something changed and a re-grade is waiting for the 10 s quiet period. */
  pending: boolean;
  since?: string;
  gradedAt?: string;
  fingerprint?: string;
  day?: string;
}

export async function readLiveState(): Promise<LiveScoreState> {
  const row = await prisma.brainState.findUnique({ where: { key: LIVE_STATE_KEY } });
  return ((row?.value ?? { pending: false }) as unknown) as LiveScoreState;
}

export async function writeLiveState(value: LiveScoreState) {
  await prisma.brainState.upsert({
    where: { key: LIVE_STATE_KEY },
    update: { value: value as unknown as Prisma.InputJsonValue },
    create: { key: LIVE_STATE_KEY, value: value as unknown as Prisma.InputJsonValue },
  });
}
