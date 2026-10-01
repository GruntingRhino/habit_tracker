/**
 * Body stats (imperial) and nutrition targets that follow them.
 *
 * Everything is shown in imperial units (lb, ft/in, oz). Macros stay in grams like US food labels.
 * Targets are recomputed from his current weight, height and age whenever those change, and
 * calories also follow his weight trend at the weekly check-in:
 *
 *   maintenance  Mifflin–St Jeor (male) × 1.55 activity (lifts ~4×/week, ~9k steps), to 50 kcal
 *   calories     maintenance + goal offset (lean bulk +250) + trend adjustment
 *   trend        every ≥14 days at a check-in: gaining < 0.2 lb/week → +125 kcal,
 *                > 0.75 lb/week → −125 kcal (bulk); clamped to −300…+500 in total
 *   protein      0.8 g per lb of bodyweight (≈ 1.76 g/kg, inside his 1.6–1.8 g/kg rule)
 *   fat          30% of calories;  carbs: the rest (so carbs absorb calorie changes)
 *   fiber        14 g per 1,000 kcal (30–45 g)
 *   micros       daily values for his age (14–18 vs 19+); sodium 2,300 mg; added sugar 30 g
 *   sleep        9 h under 18, then 8 h;  water: ½ oz per lb + 16 oz on training days
 *
 * Weight used is the 7-day average of logged morning weights when there are 3+, so one weigh-in
 * never swings the numbers.
 */
import { stateKey } from "@/lib/request-context";
import { addDays, differenceInCalendarDays, format } from "date-fns";
import prisma from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { getStartOfDay } from "@/lib/utils";

export const BODY_KEY = "body";
const LB_PER_KG = 2.20462;

export interface BodyState {
  weightLb?: number | null;
  heightIn?: number | null;
  /** Age on `ageAsOf`; the current age is derived from it. */
  age?: number | null;
  ageAsOf?: string | null;
  goal?: "cut" | "bulk" | "maintain" | "recomp" | null;
  stepsTarget?: number | null;
  sleepTargetHours?: number | null;
  /** Cumulative kcal from weekly trend adjustments. */
  calorieAdjust?: number;
  lastAdjustAt?: string | null;
  lastCheckIn?: string | null;
  measuredAt?: string | null;
  history?: { date: string; weightLb?: number; heightIn?: number }[];
  // Older metric fields (converted on read).
  weightKg?: number | null;
  heightCm?: number | null;
  measurementDate?: string | null;
}

export interface Targets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  potassium: number;
  magnesium: number;
  calcium: number;
  iron: number;
  zinc: number;
  vitaminC: number;
  vitaminA: number;
  vitaminD: number;
}

export function fmtHeight(inches: number) {
  const ft = Math.floor(Math.round(inches) / 12);
  return `${ft}'${Math.round(inches) - ft * 12}"`;
}
export const fmtLb = (lb: number) => `${Math.round(lb * 10) / 10} lb`;

/** Current age from the age he gave on a date. */
export function currentAge(b: BodyState, now = new Date()) {
  if (b.age == null) return null;
  const since = b.ageAsOf ? (now.getTime() - new Date(b.ageAsOf).getTime()) / (365.25 * 86_400_000) : 0;
  return Math.floor(b.age + Math.max(0, since));
}

/** Old metric fields → imperial. */
export function normalizeBody(b: BodyState): BodyState {
  return {
    ...b,
    weightLb: b.weightLb ?? (b.weightKg ? Math.round(b.weightKg * LB_PER_KG * 10) / 10 : null),
    heightIn: b.heightIn ?? (b.heightCm ? Math.round((b.heightCm / 2.54) * 10) / 10 : null),
    measuredAt: b.measuredAt ?? b.measurementDate ?? null,
  };
}

export interface TargetResult {
  targets: Targets;
  maintenance: number;
  weightUsed: number;
  lines: string[];
}

/** Every target from weight, height, age and goal. Pure; tested. */
export function computeTargets(b: BodyState, weightLb: number, now = new Date()): TargetResult {
  const age = currentAge(b, now) ?? 18;
  const kg = weightLb / LB_PER_KG;
  const cm = (b.heightIn ?? 70) * 2.54;
  const bmr = 10 * kg + 6.25 * cm - 5 * age + 5;
  const maintenance = Math.round((bmr * 1.55) / 50) * 50;
  const offset = b.goal === "bulk" ? 250 : b.goal === "cut" ? -400 : 0;
  const adjust = Math.max(-300, Math.min(500, b.calorieAdjust ?? 0));
  const calories = Math.round((maintenance + offset + adjust) / 25) * 25;
  const protein = Math.round(weightLb * 0.8);
  const fat = Math.round((calories * 0.3) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  const fiber = Math.max(30, Math.min(45, Math.round((calories / 1000) * 14)));
  const teen = age < 19;
  const targets: Targets = {
    calories,
    protein,
    carbs,
    fat,
    fiber,
    sugar: 30,
    sodium: 2300,
    potassium: teen ? 3000 : 3400,
    magnesium: teen ? 410 : age <= 30 ? 400 : 420,
    calcium: teen ? 1300 : 1000,
    iron: teen ? 11 : 8,
    zinc: 11,
    vitaminC: teen ? 75 : 90,
    vitaminA: 900,
    vitaminD: 15,
  };
  const lines = [
    `Maintenance ≈ ${maintenance.toLocaleString("en-US")} kcal (${fmtLb(weightLb)}, ${fmtHeight(b.heightIn ?? 70)}, age ${age})`,
    `Calories ${calories.toLocaleString("en-US")} = maintenance ${offset >= 0 ? "+" : "−"} ${Math.abs(offset)} (${b.goal ?? "maintain"})${adjust ? ` ${adjust > 0 ? "+" : "−"} ${Math.abs(adjust)} from your weight trend` : ""}`,
    `Protein ${protein} g (0.8 g/lb) · Fat ${fat} g (30%) · Carbs ${carbs} g (the rest) · Fiber ${fiber} g`,
  ];
  return { targets, maintenance, weightUsed: weightLb, lines };
}

export function sleepTargetFor(age: number | null) {
  return age != null && age < 18 ? 9 : 8;
}

export function waterOz(weightLb: number) {
  return Math.round((weightLb * 0.5) / 5) * 5;
}

/** Average of logged morning weights in the 7 days up to `end` (needs 3+). */
function avg7(weights: { date: Date; lb: number }[], end: Date) {
  const inWindow = weights.filter((w) => w.date > addDays(end, -7) && w.date <= end);
  return inWindow.length >= 3 ? inWindow.reduce((s, w) => s + w.lb, 0) / inWindow.length : null;
}

/**
 * Weekly trend in lb/week over the last ~2–3 weeks, from daily weigh-ins (7-day averages) or,
 * failing that, from check-in weights. Null without enough data.
 */
export function weightTrend(daily: { date: Date; lb: number }[], history: { date: string; weightLb?: number }[], now = new Date()) {
  const today = getStartOfDay(now);
  const recent = avg7(daily, today);
  const earlier = avg7(daily, addDays(today, -14));
  if (recent != null && earlier != null) return { perWeek: (recent - earlier) / 2, from: "daily" as const };
  const points = history.filter((h) => h.weightLb != null).map((h) => ({ d: new Date(h.date), lb: h.weightLb! }));
  const last = points[points.length - 1];
  const base = [...points].reverse().find((p) => last && differenceInCalendarDays(last.d, p.d) >= 13);
  if (last && base) return { perWeek: ((last.lb - base.lb) / differenceInCalendarDays(last.d, base.d)) * 7, from: "check-ins" as const };
  return null;
}

export async function readBody(userId?: string): Promise<BodyState> {
  const row = await prisma.brainState.findUnique({ where: { key: stateKey(BODY_KEY, userId) } });
  return normalizeBody((row?.value ?? {}) as BodyState);
}

async function writeBody(b: BodyState, userId?: string) {
  const value = b as unknown as Prisma.InputJsonValue;
  await prisma.brainState.upsert({ where: { key: stateKey(BODY_KEY, userId) }, update: { value }, create: { key: stateKey(BODY_KEY, userId), value } });
}

export interface UpdateResult {
  lines: string[];
  targets: Targets | null;
  changed: string[];
}

/**
 * Record new stats (if any), then recompute and save every target. `checkIn` allows the weekly
 * calorie trend adjustment (at most every 14 days).
 */
export async function updateBody(userId: string, update: { weightLb?: number; heightIn?: number; age?: number } = {}, opts: { checkIn?: boolean; now?: Date } = {}): Promise<UpdateResult> {
  const now = opts.now ?? new Date();
  const b = await readBody(userId);
  const today = format(now, "yyyy-MM-dd");
  const history = [...(b.history ?? [])];
  if (update.weightLb != null || update.heightIn != null) {
    history.push({ date: today, ...(update.weightLb != null ? { weightLb: update.weightLb } : {}), ...(update.heightIn != null ? { heightIn: update.heightIn } : {}) });
    b.measuredAt = today;
  }
  if (update.weightLb != null) {
    b.weightLb = update.weightLb;
    // Today's weigh-in also goes into the journal so the 7-day average sees it.
    const day = getStartOfDay(now);
    await prisma.dailyEntry.upsert({ where: { userId_date: { userId, date: day } }, update: { weightLb: update.weightLb }, create: { userId, date: day, weightLb: update.weightLb } });
  }
  if (update.heightIn != null) b.heightIn = update.heightIn;
  if (update.age != null) {
    b.age = update.age;
    b.ageAsOf = today;
  }
  b.history = history.slice(-104);
  if (!b.weightLb) {
    await writeBody(b, userId);
    return { lines: ["Tell me your weight (e.g. “134 lb”) and I'll set your targets."], targets: null, changed: [] };
  }

  const entries = await prisma.dailyEntry.findMany({ where: { userId, weightLb: { not: null }, date: { gte: addDays(now, -28) } }, select: { date: true, weightLb: true } });
  const daily = entries.map((e) => ({ date: e.date, lb: e.weightLb! }));
  const lines: string[] = [];

  if (opts.checkIn) {
    b.lastCheckIn = today;
    const trend = weightTrend(daily, b.history, now);
    const dueForAdjust = !b.lastAdjustAt || differenceInCalendarDays(now, new Date(b.lastAdjustAt)) >= 14;
    if (trend) {
      const rate = Math.round(trend.perWeek * 100) / 100;
      lines.push(`Trend: ${rate >= 0 ? "+" : ""}${rate} lb/week (${trend.from === "daily" ? "7-day averages" : "check-ins"}).`);
      if (b.goal === "bulk" && dueForAdjust) {
        // His rule: watch the waist. If it's climbing fast (≥ 0.75" in ~4+ weeks), don't add food,
        // and trim if weight is also rising quickly.
        const waist = (await measurementTrend(userId, now)).change.waist;
        const waistFast = !!waist && waist.days >= 21 && waist.delta >= 0.75;
        let step = rate < 0.2 ? 125 : rate > 0.75 ? -125 : 0;
        if (waistFast && step > 0) {
          step = 0;
          lines.push(`Waist is up ${waist!.delta}" in ${Math.round(waist!.days / 7)} weeks, so calories stay put despite the slow scale.`);
        } else if (waistFast && rate > 0.5) step = -125;
        if (step) {
          b.calorieAdjust = Math.max(-300, Math.min(500, (b.calorieAdjust ?? 0) + step));
          b.lastAdjustAt = today;
          lines.push(step > 0 ? "Gaining slower than a lean bulk should (0.25–0.75 lb/week): +125 kcal." : "Gaining faster than a lean bulk should: −125 kcal to keep it lean.");
        } else lines.push("Right in the lean-bulk range (0.25–0.75 lb/week): calories stay.");
      }
    } else lines.push("Not enough weigh-ins for a trend yet — calories adjust once there are ~2 weeks of data.");
  }

  const weightUsed = avg7(daily, getStartOfDay(now)) ?? b.weightLb;
  const age = currentAge(b, now);
  b.sleepTargetHours = sleepTargetFor(age);
  b.stepsTarget = b.stepsTarget ?? 9000;
  const result = computeTargets(b, Math.round(weightUsed * 10) / 10, now);
  const owner = await prisma.user.findUnique({ where: { id: userId }, select: { nutritionTargets: true } });
  const prev = (owner?.nutritionTargets ?? {}) as Partial<Targets>;
  const changed = (["calories", "protein", "carbs", "fat", "fiber"] as const)
    .filter((k) => prev[k] != null && prev[k] !== result.targets[k])
    .map((k) => `${k} ${prev[k]} → ${result.targets[k]}${k === "calories" ? "" : " g"}`);
  await prisma.user.update({ where: { id: userId }, data: { nutritionTargets: result.targets as unknown as Prisma.InputJsonValue } });
  await writeBody(b, userId);
  return { lines: [...lines, ...result.lines, `Water ≈ ${waterOz(weightUsed)} oz a day (+16 oz on training days). Sleep ${b.sleepTargetHours} h.`], targets: result.targets, changed };
}

/** "134 lb", "i weigh 135.5", "weighed in at 136 lbs", "6'1", "6 ft 1 in", "i'm 73 inches", "i'm 16 now". */
export function parseBodyUpdate(text: string): { weightLb?: number; heightIn?: number; age?: number } | null {
  const t = text.toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').trim();
  if (t.length > 120 || /\?$/.test(t)) return null;
  const out: { weightLb?: number; heightIn?: number; age?: number } = {};
  const w = t.match(/\b(\d{2,3}(?:\.\d)?)\s*(?:lbs?|pounds?)\b/) ?? t.match(/\b(?:weigh(?:ed)?(?:\s+in)?(?:\s+at)?|weight(?:\s+is)?|bw)\s*:?\s*(\d{2,3}(?:\.\d)?)\b/);
  if (w) {
    const lb = Number(w[1]);
    if (lb >= 60 && lb <= 450) out.weightLb = lb;
  }
  const h = t.match(/\b([4-7])\s*(?:'|ft|feet|foot)\s*(?:(\d{1,2}(?:\.\d)?)\s*(?:"|''|in(?:ches)?)?)?/) ?? t.match(/\b(\d{2}(?:\.\d)?)\s*(?:inches|in)\s*(?:tall)?\b/);
  // A bare "6'" only counts as a height when it's the whole message or said as a height ("6'ish" isn't).
  const bareFeet = h && h[0].includes("'") && h[2] == null && !/^\s*[4-7]\s*'\s*$/.test(t) && !/\b(tall|height|i'?m|i am)\b/.test(t);
  if (h && !bareFeet) {
    const inches = h[0].includes("'") || /ft|feet|foot/.test(h[0]) ? Number(h[1]) * 12 + Number(h[2] ?? 0) : Number(h[1]);
    if (inches >= 48 && inches <= 90) out.heightIn = inches;
  }
  const a = t.match(/\b(?:i'?m|i am|turned)\s+(\d{2})\s*(?:now|years? old|yo)?\s*$/);
  if (a && !out.weightLb && !out.heightIn) {
    const age = Number(a[1]);
    if (age >= 10 && age <= 90) out.age = age;
  }
  return Object.keys(out).length ? out : null;
}

/** Reply text for a logged body update (chat and Telegram). */
export async function recordBodyUpdate(userId: string, update: { weightLb?: number; heightIn?: number; age?: number }, now = new Date()) {
  const b = await readBody(userId);
  // A weigh-in within a day of the Sunday check-in counts as the check-in (the trend step).
  const checkIn = update.weightLb != null && (now.getDay() === 0 || now.getDay() === 1) && b.lastCheckIn !== format(now, "yyyy-MM-dd");
  const r = await updateBody(userId, update, { checkIn, now });
  const logged = [update.weightLb != null ? fmtLb(update.weightLb) : null, update.heightIn != null ? fmtHeight(update.heightIn) : null, update.age != null ? `age ${update.age}` : null].filter(Boolean).join(", ");
  return [`Logged ${logged}.`, r.changed.length ? `Targets updated: ${r.changed.join(", ")}.` : "Targets unchanged.", ...r.lines].join("\n");
}

// ---- tape measurements (inches) -----------------------------------------------------------------

export const MEASURE_KEYS = ["waist", "chest", "shoulders", "arms", "thighs", "neck"] as const;
export type MeasureKey = (typeof MEASURE_KEYS)[number];
const MEASURE_WORDS: Record<string, MeasureKey> = { waist: "waist", chest: "chest", shoulder: "shoulders", shoulders: "shoulders", arm: "arms", arms: "arms", bicep: "arms", biceps: "arms", thigh: "thighs", thighs: "thighs", leg: "thighs", neck: "neck" };

/** "waist 29", "chest 36.5 in, arms 12.25", "shoulders: 44" → inches. */
export function parseMeasurements(text: string): Partial<Record<MeasureKey, number>> | null {
  const t = text.toLowerCase();
  if (/\?$/.test(t.trim())) return null;
  const out: Partial<Record<MeasureKey, number>> = {};
  for (const m of t.matchAll(/\b(waist|chest|shoulders?|arms?|biceps?|thighs?|leg|neck)\b\s*(?:is|was|:|=|at)?\s*(\d{1,2}(?:\.\d{1,2})?)(?!\s*(?:x\b|x\d|sets?|reps?|lbs?|pounds?|min|minutes|kg|%|\d))\s*(?:in(?:ches)?|")?/g)) {
    const key = MEASURE_WORDS[m[1]];
    const v = Number(m[2]);
    if (key && v >= 5 && v <= 70) out[key] = v;
  }
  return Object.keys(out).length ? out : null;
}

export async function recordMeasurements(userId: string, m: Partial<Record<MeasureKey, number>>, now = new Date()) {
  await prisma.bodyMeasurement.create({ data: { userId, date: now, ...m } });
  const lines = [`Logged ${Object.entries(m).map(([k, v]) => `${k} ${v}"`).join(", ")}.`];
  const trend = await measurementTrend(userId, now);
  for (const [k, d] of Object.entries(trend.change)) if (d.days >= 21) lines.push(`${k}: ${d.delta >= 0 ? "+" : ""}${d.delta}" in ${Math.round(d.days / 7)} weeks.`);
  if (trend.ratio) lines.push(`Shoulder-to-waist ratio ${trend.ratio} (V-taper goal: ~1.6).`);
  return lines.join("\n");
}

/** Latest value per measurement, change vs ~4+ weeks earlier, shoulder:waist ratio. */
export async function measurementTrend(userId: string, now = new Date()) {
  const rows = await prisma.bodyMeasurement.findMany({ where: { userId, date: { gte: addDays(now, -365) } }, orderBy: { date: "asc" } });
  const latest: Partial<Record<MeasureKey, number>> = {};
  const change: Record<string, { delta: number; days: number }> = {};
  for (const k of MEASURE_KEYS) {
    const withK = rows.filter((r) => r[k] != null);
    const last = withK[withK.length - 1];
    if (!last) continue;
    latest[k] = last[k]!;
    const base = [...withK].reverse().find((r) => differenceInCalendarDays(last.date, r.date) >= 21);
    if (base) change[k] = { delta: Math.round((last[k]! - base[k]!) * 100) / 100, days: differenceInCalendarDays(last.date, base.date) };
  }
  const ratio = latest.shoulders && latest.waist ? Math.round((latest.shoulders / latest.waist) * 100) / 100 : null;
  const lastDate = rows[rows.length - 1]?.date ?? null;
  return { latest, change, ratio, lastDate };
}
