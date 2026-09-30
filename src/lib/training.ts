/**
 * Training coach: what to lift today, from his last sessions and his rules.
 *
 * - Double progression: stay at a weight until every working set reaches the top of the rep range,
 *   then add load (+5 lb upper body / dumbbells, +10 lb lower-body barbell/Smith) and restart at the
 *   bottom of the range. Bodyweight: add reps, then a harder variation. Timed holds: add 5 s.
 * - Stall: same weight and no more total reps for 3 sessions → check sleep and calories first; if it
 *   persists, swap the variation.
 * - Deload: 2+ lifts in a routine went backwards in each of the last 2 sessions → one easier week.
 * - Blocks: Upper A → B → C, ~6 weeks each (4–8); keep lifts that still progress.
 * All of it is plain arithmetic on what he logged: nothing is guessed by a model.
 */
import { addDays, differenceInCalendarWeeks } from "date-fns";
import prisma from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { getDayOfWeek, getStartOfDay } from "@/lib/utils";

export interface RepTarget {
  sets: number;
  lo: number;
  hi: number;
  seconds: boolean;
  perSide: boolean;
}

/** "3x6-10", "3x8-12/side", "3x20-40s", "2-3x30-60s/side", "2x10", "60s". */
export function parseTarget(descriptor: string | null | undefined): RepTarget | null {
  const d = (descriptor ?? "").toLowerCase().replace(/\s+/g, "");
  const m = d.match(/^(?:(\d+)(?:-(\d+))?x)?(\d+)(?:-(\d+))?(s|sec)?/);
  if (!m) return null;
  const sets = Number(m[2] ?? m[1] ?? 1);
  const lo = Number(m[3]);
  const hi = Number(m[4] ?? m[3]);
  return { sets, lo, hi, seconds: !!m[5] || /\d+s\b|sec/.test(d), perSide: /side|leg|arm|each/.test(d) };
}

/** "9,9,8" / "9/9/8" / "10" (all sets) → per-set numbers. */
export function parseReps(reps: string | null | undefined, sets: number | null | undefined): number[] {
  const nums = (reps ?? "").match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
  if (nums.length === 1 && (sets ?? 1) > 1) return new Array(sets!).fill(nums[0]);
  return nums;
}

export interface SetLog {
  date: Date;
  weight: number | null;
  sets: number | null;
  reps: string | null;
}

export interface Suggestion {
  status: "new" | "progress" | "increase" | "stalled" | "harder";
  last: string | null;
  next: string;
  nextWeight: number | null;
  nextReps: string;
  why: string;
}

const LOWER = /squat|deadlift|rdl|lunge|leg press|calf|glute|hip thrust|split|step-up/i;
const DUMBBELL = /dumbbell|\bdb\b|hammer|lateral|curl|fly|raise/i;

export function increment(name: string) {
  return LOWER.test(name) && !DUMBBELL.test(name) ? 10 : 5;
}

const fmtSets = (reps: number[]) => reps.join(",");
const describe = (l: SetLog) => {
  const reps = parseReps(l.reps, l.sets);
  return `${l.weight ? `${l.weight} × ` : ""}${reps.length ? fmtSets(reps) : `${l.sets ?? "?"} sets`}`;
};

/** Next target for one exercise from its logs (newest first). */
export function suggest(name: string, descriptor: string | null, logs: SetLog[]): Suggestion {
  const t = parseTarget(descriptor) ?? { sets: 3, lo: 8, hi: 12, seconds: false, perSide: false };
  const unit = t.seconds ? " s" : "";
  const last = logs[0];
  if (!last) {
    return {
      status: "new",
      last: null,
      next: t.seconds ? `${t.sets} × ${t.lo}${unit}` : `${t.sets} × ${t.lo}${t.hi !== t.lo ? `–${t.hi}` : ""}`,
      nextWeight: null,
      nextReps: t.seconds ? String(t.lo) : String(t.lo),
      why: t.seconds ? "First time: hold with clean form." : "First time: pick a weight you can do for the rep range with 1–3 reps left in the tank.",
    };
  }
  const reps = parseReps(last.reps, last.sets);
  const working = reps.slice(0, Math.max(t.sets, 1));
  const allTop = working.length >= t.sets && working.every((r) => r >= t.hi);

  // Stall: same weight, total reps not up across the last 3 sessions.
  const recent = logs.slice(0, 3);
  const total = (l: SetLog) => parseReps(l.reps, l.sets).slice(0, t.sets).reduce((a, b) => a + b, 0);
  const stalled = recent.length === 3 && recent.every((l) => l.weight === last.weight) && total(recent[0]) <= total(recent[2]) && !allTop;

  if (t.seconds) {
    const next = allTop ? `${t.sets} × ${t.hi}${unit} — try a harder variation` : `${t.sets} × ${Math.min(t.hi, Math.max(...working, t.lo) + 5)}${unit}`;
    return { status: allTop ? "harder" : "progress", last: describe(last), next, nextWeight: null, nextReps: String(Math.min(t.hi, Math.max(...working, t.lo) + 5)), why: allTop ? "Top of the range on every set." : "Add ~5 s per hold." };
  }
  if (!last.weight) {
    if (allTop) return { status: "harder", last: describe(last), next: `harder variation (slow tempo, pause or one-sided) × ${t.lo}–${t.hi}`, nextWeight: null, nextReps: String(t.lo), why: "Every set hit the top of the range." };
    const aim = working.map((r) => Math.min(t.hi, r + 1));
    while (aim.length < t.sets) aim.push(t.lo);
    return { status: stalled ? "stalled" : "progress", last: describe(last), next: `${fmtSets(aim)} reps`, nextWeight: null, nextReps: fmtSets(aim), why: stalled ? "Same reps 3 sessions running — check sleep and food first." : "One more rep per set." };
  }
  if (allTop) {
    const w = last.weight + increment(name);
    return { status: "increase", last: describe(last), next: `${w} × ${t.lo}+`, nextWeight: w, nextReps: String(t.lo), why: `All ${t.sets} sets hit ${t.hi}: add ${increment(name)} lb.` };
  }
  const aim = working.map((r) => Math.min(t.hi, r + 1));
  while (aim.length < t.sets) aim.push(t.lo);
  return {
    status: stalled ? "stalled" : "progress",
    last: describe(last),
    next: `${last.weight} × ${fmtSets(aim)}`,
    nextWeight: last.weight,
    nextReps: fmtSets(aim),
    why: stalled ? "No progress in 3 sessions — sleep and calories first; if it continues next block, swap the variation." : "Same weight, one more rep on the sets below the top.",
  };
}

/** Did performance drop for 2+ lifts in each of the last 2 sessions of a routine? */
export function needsDeload(sessions: { logs: SetLog[] & { exerciseName?: string }[] }[]): boolean {
  if (sessions.length < 3) return false;
  const score = (l: { weight: number | null; reps: string | null; sets: number | null }) => (l.weight ?? 1) * parseReps(l.reps, l.sets).reduce((a, b) => a + b, 0);
  const dropped = (newer: (typeof sessions)[number], older: (typeof sessions)[number]) => {
    let n = 0;
    for (const l of newer.logs as (SetLog & { exerciseName: string })[]) {
      const prev = (older.logs as (SetLog & { exerciseName: string })[]).find((o) => o.exerciseName === l.exerciseName);
      if (prev && score(l) < score(prev) * 0.95) n++;
    }
    return n >= 2;
  };
  return dropped(sessions[0], sessions[1]) && dropped(sessions[1], sessions[2]);
}

// ---- his split and blocks ----------------------------------------------------------------------

export const TRAINING_KEY = "training";

export interface TrainingState {
  upperBlock: "A" | "B" | "C";
  blockStartedAt: string;
  /** Day → what to train: "upper" (current block), a routine name, or "rest". */
  split: Record<string, string[]>;
}

export const DEFAULT_TRAINING: TrainingState = {
  upperBlock: "A",
  blockStartedAt: new Date().toISOString().slice(0, 10),
  split: { mon: ["upper"], tue: ["Lower A"], wed: ["Daily posture"], thu: ["upper"], fri: ["Abs A", "Daily posture"], sat: ["Lower B", "Abs A"], sun: [] },
};

export async function readTraining(): Promise<TrainingState> {
  const row = await prisma.brainState.findUnique({ where: { key: TRAINING_KEY } });
  return { ...DEFAULT_TRAINING, ...((row?.value ?? {}) as Partial<TrainingState>) };
}

export async function writeTraining(t: TrainingState) {
  const value = t as unknown as Prisma.InputJsonValue;
  await prisma.brainState.upsert({ where: { key: TRAINING_KEY }, update: { value }, create: { key: TRAINING_KEY, value } });
}

/** "Upper A – Upper chest…" → "A". */
export function upperLetter(name: string) {
  return name.match(/^upper\s+([abc])\b/i)?.[1]?.toUpperCase() as "A" | "B" | "C" | undefined;
}

/**
 * After a session is logged: an Upper B session while on block A means he switched (follow him),
 * and the day's matching training habit ("Upper workout", "Lower A workout") gets ticked.
 */
export async function noteSession(userId: string, routineName: string, at = new Date()) {
  const letter = upperLetter(routineName);
  if (letter) {
    const t = await readTraining();
    if (t.upperBlock !== letter) await writeTraining({ ...t, upperBlock: letter, blockStartedAt: at.toISOString().slice(0, 10) });
  }
  const key = letter ? "upper" : routineName.match(/^(lower [ab])\b/i)?.[1]?.toLowerCase();
  if (!key) return;
  const day = getStartOfDay(at);
  const habits = await prisma.habit.findMany({ where: { userId, isActive: true, targetDays: { has: getDayOfWeek(day) } }, select: { id: true, name: true } });
  for (const h of habits.filter((h) => h.name.toLowerCase().includes(key))) {
    await prisma.habitLog.upsert({ where: { habitId_date: { habitId: h.id, date: day } }, update: { completed: true }, create: { habitId: h.id, date: day, completed: true } });
  }
}

export interface ExercisePlan {
  exerciseId: string;
  name: string;
  target: string | null;
  suggestion: Suggestion;
}

export interface RoutinePlan {
  routineId: string;
  name: string;
  exercises: ExercisePlan[];
  deload: boolean;
}

type RoutineWithLogs = {
  id: string;
  name: string;
  exercises: { id: string; name: string; descriptor: string | null }[];
};

/** Suggestions for every exercise of the given routines, from the last 8 weeks of logs. */
export async function planRoutines(userId: string, routines: RoutineWithLogs[]): Promise<RoutinePlan[]> {
  const sessions = await prisma.workoutSession.findMany({
    where: { userId, date: { gte: addDays(new Date(), -56) } },
    orderBy: { date: "desc" },
    select: { date: true, routineId: true, exerciseLogs: { select: { exerciseId: true, exerciseName: true, weight: true, sets: true, reps: true } } },
  });
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return routines.map((r) => {
    const exercises = r.exercises.map((e) => {
      // The same lift in another routine counts too (dips in Upper A and C).
      const logs: SetLog[] = sessions.flatMap((s) =>
        s.exerciseLogs.filter((l) => l.exerciseId === e.id || norm(l.exerciseName) === norm(e.name)).map((l) => ({ date: s.date, weight: l.weight, sets: l.sets, reps: l.reps }))
      );
      return { exerciseId: e.id, name: e.name, target: e.descriptor, suggestion: suggest(e.name, e.descriptor, logs) };
    });
    const own = sessions
      .filter((s) => s.routineId === r.id)
      .slice(0, 3)
      .map((s) => ({ logs: s.exerciseLogs.map((l) => ({ date: s.date, weight: l.weight, sets: l.sets, reps: l.reps, exerciseName: l.exerciseName })) }));
    return { routineId: r.id, name: r.name, exercises, deload: needsDeload(own as never) };
  });
}

/** Today's routines from the split (current upper block on upper days). */
export async function todaysTraining(userId: string, date = new Date()) {
  const t = await readTraining();
  const plan = t.split[getDayOfWeek(getStartOfDay(date))] ?? [];
  const routines = await prisma.weightRoutine.findMany({ where: { userId }, select: { id: true, name: true, exercises: { orderBy: { order: "asc" }, select: { id: true, name: true, descriptor: true } } } });
  const pick = (want: string) =>
    want === "upper" ? routines.find((r) => upperLetter(r.name) === t.upperBlock) : routines.find((r) => r.name.toLowerCase().startsWith(want.toLowerCase()));
  const chosen = plan.map(pick).filter((r): r is RoutineWithLogs => !!r);
  return { state: t, routines: chosen, plans: chosen.length ? await planRoutines(userId, chosen) : [] };
}

/** Block status: weeks in, and whether its lifts are still progressing. */
export async function blockStatus(userId: string, now = new Date()) {
  const t = await readTraining();
  const weeks = differenceInCalendarWeeks(now, new Date(t.blockStartedAt), { weekStartsOn: 1 });
  const routines = await prisma.weightRoutine.findMany({ where: { userId }, select: { id: true, name: true, exercises: { select: { id: true, name: true, descriptor: true } } } });
  const upper = routines.find((r) => upperLetter(r.name) === t.upperBlock);
  const plans = upper ? await planRoutines(userId, [upper]) : [];
  const lifts = plans[0]?.exercises.filter((e) => e.suggestion.status !== "new") ?? [];
  const stalled = lifts.filter((e) => e.suggestion.status === "stalled").length;
  const next = t.upperBlock === "A" ? "B" : t.upperBlock === "B" ? "C" : "A";
  return { block: t.upperBlock, weeks, stalled, tracked: lifts.length, next, name: upper?.name ?? `Upper ${t.upperBlock}` };
}

/** One line for the morning brief / chat: today's lifts with targets. */
export function describeToday(plans: RoutinePlan[], max = 4) {
  return plans.map((p) => {
    const lifts = p.exercises.slice(0, max).map((e) => `${e.name} ${e.suggestion.next}`);
    return `${p.name}${p.deload ? " (deload week suggested)" : ""}: ${lifts.join(" · ")}${p.exercises.length > max ? " …" : ""}`;
  });
}
