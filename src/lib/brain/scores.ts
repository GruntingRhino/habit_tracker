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
import { readRationale, type AreaRationale, type Rationale } from "@/lib/score-rationale";
import { getDayOfWeek, getStartOfDay } from "@/lib/utils";
import { shortHash } from "./storage";

export interface Fact {
  n: number;
  area: ScoredArea;
  text: string;
  /** +1 good for the score, -1 bad, 0 neutral. */
  polarity: 1 | 0 | -1;
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

/** Everything knowable about a day, as numbered facts and improvement options per area. */
export async function buildFacts(userId: string, date: Date, opts: { final?: boolean; now?: Date } = {}): Promise<DayFacts> {
  const day = getStartOfDay(date);
  const next = addDays(day, 1);
  const dow = getDayOfWeek(day);
  const final = opts.final ?? false;
  const [entry, todosDone, todosDue, tasksDone, habits, workouts, meals, remindersDone, owner] = await Promise.all([
    prisma.dailyEntry.findUnique({ where: { userId_date: { userId, date: day } } }),
    prisma.todo.findMany({ where: { userId, status: "done", completedAt: { gte: day, lt: next } }, select: { title: true, area: true }, orderBy: { completedAt: "asc" } }),
    prisma.todo.findMany({ where: { userId, status: "open", dueAt: { lt: next } }, select: { title: true, area: true, dueAt: true }, orderBy: { dueAt: "asc" }, take: 20 }),
    prisma.projectTask.findMany({
      where: { project: { userId }, status: "completed", completedAt: { gte: day, lt: next } },
      select: { title: true, area: true, project: { select: { title: true, area: true } } },
    }),
    prisma.habit.findMany({
      where: { userId, isActive: true, targetDays: { has: dow } },
      select: { name: true, area: true, logs: { where: { date: day }, select: { completed: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.workoutSession.findMany({ where: { userId, date: { gte: day, lt: next } }, select: { routine: { select: { name: true } } } }),
    prisma.meal.findMany({ where: { userId, status: "eaten", plannedFor: { gte: day, lt: next } }, select: { name: true, calories: true, protein: true } }),
    prisma.reminder.count({ where: { userId, status: "done", updatedAt: { gte: day, lt: next } } }),
    prisma.user.findUnique({ where: { id: userId }, select: { nutritionTargets: true } }),
  ]);

  const facts: Fact[] = [];
  const options: Option[] = [];
  const fact = (area: string | null | undefined, text: string, polarity: Fact["polarity"]) => {
    const a = (SCORED_AREAS as readonly string[]).includes(area ?? "") ? (area as ScoredArea) : "mental";
    // Every line starts with ✓ (helps), ✗ (hurts) or • (neutral), so the UI can show it at a glance.
    const marked = /^[✓✗•]/.test(text) ? text : `${polarity > 0 ? "✓" : polarity < 0 ? "✗" : "•"} ${text}`;
    facts.push({ n: facts.length + 1, area: a, text: marked, polarity });
  };
  const option = (area: ScoredArea, text: string) => {
    if (options.filter((o) => o.area === area).length >= 5 || options.some((o) => o.text === text)) return;
    options.push({ code: String.fromCharCode(65 + options.length), area, text });
  };
  const scoredArea = (a: string | null | undefined): ScoredArea => ((SCORED_AREAS as readonly string[]).includes(a ?? "") ? (a as ScoredArea) : "mental");

  for (const t of todosDone) fact(t.area, `✓ Done: ${q(t.title)}`, 1);
  for (const t of tasksDone) fact(t.area ?? t.project.area, `✓ Done: ${q(t.title)} (${t.project.title})`, 1);
  for (const t of todosDue) {
    const overdue = t.dueAt! < day;
    fact(t.area, `✗ ${overdue ? "Overdue" : final ? "Not done (was due)" : "Due today, not done yet"}: ${q(t.title)}`, -1);
    option(scoredArea(t.area), `Finish ${q(t.title)}`);
  }
  for (const h of habits) {
    const done = h.logs[0]?.completed;
    const area = h.area === "general" || h.area === "work" ? "mental" : h.area;
    fact(area, done ? `✓ Habit done: ${q(h.name)}` : `✗ Habit ${final ? "missed" : "not done yet"}: ${q(h.name)}`, done ? 1 : -1);
    if (!done) option(scoredArea(area), `Do your habit ${q(h.name)}`);
  }
  for (const w of workouts) fact("physical", `✓ Workout logged: ${q(w.routine.name)}`, 1);
  if (entry?.workoutCompleted && !workouts.length) fact("physical", `✓ Workout: ${entry.workoutRoutineName ?? entry.workoutDetails ?? "done"}${entry.workoutDurationMinutes ? ` (${entry.workoutDurationMinutes} min)` : ""}`, 1);
  if (!workouts.length && !entry?.workoutCompleted) option("physical", "Get a workout or training session in and log it");

  const targets = owner?.nutritionTargets as NutritionTargets | null;
  if (meals.length) {
    const kcal = meals.reduce((s, m) => s + (m.calories ?? 0), 0);
    const protein = Math.round(meals.reduce((s, m) => s + (m.protein ?? 0), 0));
    fact("physical", `Food logged: ${meals.length} meal${meals.length === 1 ? "" : "s"}${kcal ? `, ${kcal} kcal` : ""}${protein ? `, ${protein} g protein` : ""}`, 1);
    if (targets?.protein && protein < targets.protein * 0.8) {
      fact("physical", `Protein ${protein}/${targets.protein} g target`, final ? -1 : 0);
      option("physical", `Get ~${Math.round(targets.protein - protein)} g more protein (you're at ${protein}/${targets.protein} g)`);
    }
  } else {
    option("physical", "Log what you eat on the Food page");
  }

  if (entry?.sleepHours != null) {
    const s = entry.sleepHours;
    fact("physical", `Slept ${s} h${s < 6 ? " (well under 7)" : s < 7 ? " (under 7)" : s > 9.5 ? " (over 9)" : " (7–9, good)"}`, s < 6 ? -1 : s >= 7 && s <= 9.5 ? 1 : 0);
  } else option("physical", "Log last night's sleep in the Journal");
  if (entry?.steps != null) fact("physical", `${entry.steps.toLocaleString("en-US")} steps`, entry.steps >= 8000 ? 1 : entry.steps < 3000 ? -1 : 0);
  if (entry?.caloriesEaten != null && !meals.length) fact("physical", `Calories ${entry.caloriesEaten}`, 0);

  if (entry?.screenTimeHours != null) {
    const s = entry.screenTimeHours;
    fact("mental", `Screen time ${s} h${s > 4 ? " (high)" : s <= 2 ? " (low, good)" : ""}`, s > 4 ? -1 : s <= 2 ? 1 : 0);
    if (s > 4) option("mental", "Put the phone away for the next hour");
  }
  if (entry?.deepWorkHours != null) fact("mental", `Deep work ${entry.deepWorkHours} h`, entry.deepWorkHours >= 2 ? 1 : 0);
  if (entry?.overallDayRating != null) fact("mental", `You rated the day ${entry.overallDayRating}/10`, entry.overallDayRating >= 7 ? 1 : entry.overallDayRating <= 4 ? -1 : 0);
  if (entry?.tasksPlanned != null) fact("mental", `Tasks ${entry.tasksCompleted ?? 0}/${entry.tasksPlanned}`, (entry.tasksCompleted ?? 0) >= entry.tasksPlanned * 0.7 ? 1 : -1);
  if (remindersDone) fact("mental", `${remindersDone} reminder${remindersDone === 1 ? "" : "s"} acted on`, 1);
  const journal = entry?.notes?.trim() || null;
  if (journal) fact("mental", "✓ Journal written", 1);
  else option("mental", "Write a few lines in your Journal");

  if (entry?.moneySpent != null) fact("financial", `Spent $${entry.moneySpent}`, 0);
  if (entry?.moneySaved != null) fact("financial", `Saved $${entry.moneySaved}`, entry.moneySaved > 0 ? 1 : 0);
  if (entry?.incomeActivity) fact("financial", "✓ Worked on income", 1);
  if (entry?.moneySpent == null && entry?.moneySaved == null) option("financial", "Log what you spent or saved today (Journal → Quick log)");

  if (entry?.rightWithGod) fact("spiritual", "✓ Marked right with God", 1);
  else option("spiritual", "Take a few minutes to pray, then mark “Right with God” in the Journal");

  const fingerprint = shortHash(JSON.stringify([facts.map((f) => f.text), !!journal, final]), 12);
  return { facts, options, journal, entryId: entry?.id ?? null, fingerprint };
}

/** Rule-based anchor: 5 with no signal, up with good facts, down with bad ones. Null = no data. */
export function baseline(facts: Fact[]): number | null {
  if (!facts.length) return null;
  const pos = facts.filter((f) => f.polarity > 0).length;
  const neg = facts.filter((f) => f.polarity < 0).length;
  return Math.max(0, Math.min(10, Math.round(5 + (5 * (pos - neg)) / (pos + neg + 1))));
}

// Byte-stable for the prompt cache.
export const GRADE_SYSTEM = `You grade Abhay's day in life areas from 0 to 10, using ONLY his numbered facts.
Scale: 10 exceptional, 8 strong, 6 decent, 4 weak, 2 very poor. Each area has a suggested score; stay within 2 of it.
For each area give:
- score
- why: the numbers of the 1 to 3 facts that matter most for that area
- improve: the letter of the ONE option that would raise that area most, or "" if it has no options
Use only numbers and letters that appear under that area. Reply with minified JSON only.`;

export interface AreaGrade {
  score: number | null;
  rationale: AreaRationale;
}

/** Turn the model's picks (or none) into a grade whose every word comes from code. */
export function renderGrade(area: ScoredArea, facts: Fact[], options: Option[], pick: { score?: unknown; why?: unknown; improve?: unknown } | null): AreaGrade {
  const mine = facts.filter((f) => f.area === area);
  const opts = options.filter((o) => o.area === area);
  const h = shortHash(JSON.stringify(mine.map((f) => f.text)), 10);
  const base = baseline(mine);
  if (base == null) return { score: null, rationale: { why: [], improve: opts[0]?.text ?? null, noData: true, h } };

  let score = base;
  const n = Number(pick?.score);
  if (Number.isFinite(n)) score = Math.max(Math.max(0, base - 2), Math.min(Math.min(10, base + 2), Math.round(n)));

  const cited = (Array.isArray(pick?.why) ? pick!.why : [])
    .map(Number)
    .map((x) => mine.find((f) => f.n === x))
    .filter((f): f is Fact => !!f);
  let why = [...new Set(cited)].slice(0, 3);
  if (!why.length) {
    // Deterministic fallback: the strongest signals either way.
    why = [...mine.filter((f) => f.polarity < 0).slice(0, 1), ...mine.filter((f) => f.polarity > 0).slice(0, 2)];
    if (!why.length) why = mine.slice(0, 2);
  }
  const code = String(pick?.improve ?? "").trim().toUpperCase();
  const improve = opts.find((o) => o.code === code)?.text ?? opts[0]?.text ?? null;
  return { score, rationale: { why: why.map((f) => f.text), improve, noData: false, h } };
}

function gradeSchema(areas: ScoredArea[]) {
  return {
    type: "object",
    properties: Object.fromEntries(
      areas.map((a) => [
        a,
        {
          type: "object",
          properties: { score: { type: "integer", minimum: 0, maximum: 10 }, why: { type: "array", items: { type: "integer" }, maxItems: 3 }, improve: { type: "string" } },
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
      const mine = facts.filter((f) => f.area === a);
      const opts = options.filter((o) => o.area === a);
      return [
        `${a.toUpperCase()} (suggested ${baseline(mine)})`,
        ...mine.map((f) => `${f.n}. ${f.text}`),
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
      grades[a] = { score: prev[a].noData ? null : existing![a], rationale: { ...prev[a], improve: fresh.rationale.improve } };
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
        maxTokens: 60 * toGrade.length,
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
