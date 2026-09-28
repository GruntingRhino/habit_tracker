import prisma from "@/lib/prisma";
import { SCORED_AREAS, type ScoredArea } from "@/lib/areas";
import { chat, parseJson, LLM_MODEL } from "@/lib/ai/llm";
import { recomputeCategoryScoreForDate } from "@/lib/category-score";
import { getDayOfWeek, getStartOfDay } from "@/lib/utils";
import { reportError } from "@/lib/monitoring";
import { addDays, format } from "date-fns";

export interface Judgement {
  scores: Record<ScoredArea, number>;
  overall: number;
  reasons: Partial<Record<ScoredArea, string>>;
  journalScore: number | null;
  journalFeedback: string | null;
  judgedBy: string;
}

const areaProps = Object.fromEntries(SCORED_AREAS.map((a) => [a, { type: "integer", minimum: 0, maximum: 10 }]));
const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    ...areaProps,
    reasons: {
      type: "object",
      properties: Object.fromEntries(SCORED_AREAS.map((a) => [a, { type: "string" }])),
      required: [...SCORED_AREAS],
    },
    journalScore: { type: "integer", minimum: 0, maximum: 10 },
    journalFeedback: { type: "string" },
  },
  required: [...SCORED_AREAS, "reasons", "journalScore", "journalFeedback"],
};

const JUDGE_SYSTEM = `You are Abhay's honest life coach. Score his day from 0 to 10 in each area using ONLY the facts given.
Scale: 10 exceptional, 8 strong, 6 decent, 4 weak, 2 very poor, 0 nothing at all. 5 when there is little data for that area.
- physical: training, sleep (7-9h ideal), steps, eating logged, physical routines/tasks
- mental: mental routines, reading/learning, screen time (less is better), mood, stress handling in journal
- financial: spending vs saving, income work, money tasks done
- spiritual: prayer/faith routines, "right with God", spiritual tasks, gratitude
- work: deep work hours, work/school tasks and project tasks completed, overdue work
Be fair but demanding; don't inflate. Each reason: max 12 words, cite a concrete fact.
Journal: score 0-10 for honesty, reflection and intention (0 if no journal). journalFeedback: 2-3 sentences, warm but direct, one concrete suggestion for tomorrow. If no journal, encourage him to write one tonight.
Reply with minified JSON only.`;

async function collectFacts(userId: string, day: Date) {
  const next = addDays(day, 1);
  const dow = getDayOfWeek(day);
  const [entry, todosDone, todosDueOpen, tasksDone, habits, workouts, meals, remindersDone] = await Promise.all([
    prisma.dailyEntry.findUnique({ where: { userId_date: { userId, date: day } } }),
    prisma.todo.findMany({ where: { userId, status: "done", completedAt: { gte: day, lt: next } }, select: { title: true, area: true } }),
    prisma.todo.findMany({ where: { userId, status: "open", dueAt: { lt: next } }, select: { title: true, area: true } }),
    prisma.projectTask.findMany({
      where: { project: { userId }, status: "completed", completedAt: { gte: day, lt: next } },
      select: { title: true, area: true, project: { select: { title: true, area: true } } },
    }),
    prisma.habit.findMany({
      where: { userId, isActive: true, targetDays: { has: dow } },
      select: { name: true, area: true, logs: { where: { date: day }, select: { completed: true } } },
    }),
    prisma.workoutSession.findMany({ where: { userId, date: { gte: day, lt: next } }, select: { routine: { select: { name: true } } } }),
    prisma.meal.findMany({ where: { userId, status: "eaten", plannedFor: { gte: day, lt: next } }, select: { name: true, category: true } }),
    prisma.reminder.count({ where: { userId, status: "done", updatedAt: { gte: day, lt: next } } }),
  ]);

  const byArea: Record<string, string[]> = Object.fromEntries(SCORED_AREAS.map((a) => [a, []]));
  const push = (area: string | null | undefined, line: string) => (byArea[area ?? ""] ?? byArea.work).push(line);

  for (const t of todosDone) push(t.area === "general" ? "work" : t.area, `done: ${t.title}`);
  for (const t of tasksDone) push(t.area ?? t.project.area, `done: ${t.title} (${t.project.title})`);
  for (const t of todosDueOpen) push(t.area === "general" ? "work" : t.area, `NOT done (due): ${t.title}`);
  for (const h of habits) push(h.area === "general" ? "mental" : h.area, `routine ${h.logs[0]?.completed ? "done" : "missed"}: ${h.name}`);
  for (const w of workouts) push("physical", `workout logged: ${w.routine.name}`);
  if (meals.length) push("physical", `meals logged: ${meals.map((m) => `${m.category} ${m.name}`).join(", ")}`);

  if (entry) {
    if (entry.sleepHours != null) push("physical", `sleep ${entry.sleepHours}h`);
    if (entry.steps != null) push("physical", `steps ${entry.steps}`);
    if (entry.workoutCompleted && !workouts.length) push("physical", `workout: ${entry.workoutRoutineName ?? entry.workoutDetails ?? "yes"}${entry.workoutDurationMinutes ? ` ${entry.workoutDurationMinutes}min` : ""}`);
    if (entry.caloriesEaten != null) push("physical", `calories ${entry.caloriesEaten}`);
    if (entry.screenTimeHours != null) push("mental", `screen time ${entry.screenTimeHours}h`);
    if (entry.overallDayRating != null) push("mental", `self-rated day ${entry.overallDayRating}/10`);
    if (entry.deepWorkHours != null) push("work", `deep work ${entry.deepWorkHours}h`);
    if (entry.tasksPlanned != null) push("work", `tasks ${entry.tasksCompleted ?? 0}/${entry.tasksPlanned}`);
    if (entry.moneySpent != null) push("financial", `spent $${entry.moneySpent}`);
    if (entry.moneySaved != null) push("financial", `saved $${entry.moneySaved}`);
    if (entry.incomeActivity) push("financial", "worked on income");
    push("spiritual", entry.rightWithGod ? "felt right with God" : "did not mark right with God");
  }
  if (remindersDone) push("work", `${remindersDone} reminders acted on`);

  const facts = SCORED_AREAS.map((a) => `${a}: ${byArea[a].length ? byArea[a].join("; ") : "nothing logged"}`).join("\n");
  const journal = entry?.notes?.trim().slice(0, 1500) || null;
  return { entry, facts, journal };
}

function clampScore(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(10, Math.round(n))) : null;
}

/** Judge a day with the model and store the result. Falls back to the rule-based score. */
export async function judgeDay(userId: string, date = new Date(), opts: { think?: boolean } = {}): Promise<Judgement> {
  const day = getStartOfDay(date);
  const { entry, facts, journal } = await collectFacts(userId, day);
  const user = `Day: ${format(day, "EEEE MMM d")}\n\nFacts:\n${facts}\n\nJournal:\n${journal ?? "(none)"}`;

  let judgement: Judgement | null = null;
  try {
    const result = await chat({
      messages: [
        { role: "system", content: JUDGE_SYSTEM },
        { role: "user", content: user },
      ],
      schema: JUDGE_SCHEMA,
      think: opts.think ?? true,
      temperature: 0.4,
      maxTokens: opts.think === false ? 500 : 3000,
      timeoutMs: 12 * 60_000,
    });
    const raw = parseJson<Record<string, unknown>>(result.content);
    if (raw) {
      const scores = {} as Record<ScoredArea, number>;
      let ok = true;
      for (const a of SCORED_AREAS) {
        const v = clampScore(raw[a]);
        if (v == null) ok = false;
        scores[a] = v ?? 5;
      }
      if (ok) {
        const reasons = (raw.reasons ?? {}) as Record<string, string>;
        judgement = {
          scores,
          overall: Math.round((SCORED_AREAS.reduce((s, a) => s + scores[a], 0) / SCORED_AREAS.length) * 10) / 10,
          reasons: Object.fromEntries(SCORED_AREAS.map((a) => [a, String(reasons[a] ?? "").slice(0, 160)])),
          journalScore: journal ? clampScore(raw.journalScore) : null,
          journalFeedback: typeof raw.journalFeedback === "string" ? raw.journalFeedback.slice(0, 800) : null,
          judgedBy: LLM_MODEL,
        };
      }
    }
  } catch (error) {
    reportError({ context: "judge", error, userId });
  }

  if (!judgement) {
    const base = await recomputeCategoryScoreForDate(userId, day);
    judgement = {
      scores: { physical: base.physical, mental: base.mental, financial: base.financial, spiritual: base.spiritual, work: base.work },
      overall: base.overall,
      reasons: {},
      journalScore: null,
      journalFeedback: null,
      judgedBy: "rules",
    };
  }

  await prisma.categoryScore.upsert({
    where: { userId_date: { userId, date: day } },
    update: {
      ...judgement.scores,
      overall: judgement.overall,
      rationale: judgement.reasons,
      journalScore: judgement.journalScore,
      journalFeedback: judgement.journalFeedback,
      judgedBy: judgement.judgedBy === "rules" ? null : judgement.judgedBy,
      dailyEntryId: entry?.id ?? null,
      finalized: true,
    },
    create: {
      userId,
      date: day,
      dailyEntryId: entry?.id,
      ...judgement.scores,
      overall: judgement.overall,
      rationale: judgement.reasons,
      journalScore: judgement.journalScore,
      journalFeedback: judgement.journalFeedback,
      judgedBy: judgement.judgedBy === "rules" ? null : judgement.judgedBy,
      finalized: true,
    },
  });
  return judgement;
}
