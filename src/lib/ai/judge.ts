import prisma from "@/lib/prisma";
import { chat, parseJson, LLM_MODEL } from "@/lib/ai/llm";
import { buildFacts, gradeDay, type GradeResult } from "@/lib/brain/scores";
import { getStartOfDay } from "@/lib/utils";
import { reportError } from "@/lib/monitoring";

const JOURNAL_SCHEMA = {
  type: "object",
  properties: { journalScore: { type: "integer", minimum: 0, maximum: 10 }, journalFeedback: { type: "string" } },
  required: ["journalScore", "journalFeedback"],
};

// Byte-stable for the prompt cache.
const JOURNAL_SYSTEM = `You are Abhay's honest life coach reading his journal entry for the day.
journalScore: 0-10 for honesty, reflection and intention.
journalFeedback: 2-3 sentences, warm but direct, about what he actually wrote, with one concrete suggestion for tomorrow. Never mention anything he didn't write.
Reply with minified JSON only.`;

/**
 * The journal score, by rubric (the model once wrote "solid reflection" next to a 2/10):
 * length, what happened, how he felt, why, and what he'll do next.
 */
export function scoreJournal(journal: string) {
  const t = journal.toLowerCase();
  const words = t.split(/\s+/).filter(Boolean).length;
  let score = words >= 80 ? 4 : words >= 40 ? 3 : words >= 15 ? 2 : words >= 5 ? 1 : 0;
  if (/\b(felt|feel|feeling|stressed|tired|happy|proud|anxious|frustrated|motivated|bored|excited|annoyed|grateful|nervous|calm)\b/.test(t)) score += 2; // how he felt
  if (/\b(because|since|so i|which|that'?s why|made me|got in the way|the reason)\b/.test(t)) score += 1; // why
  if (/\b(win|went well|proud|locked in|finished|good|solid|strong|got done)\b/.test(t) && /\b(but|though|struggl|miss|didn'?t|barely|hard|rough|stressed|bad)\b/.test(t)) score += 1; // honest about both
  if (/\b(tomorrow|next time|going to|want to|gonna|plan to|i will|i'?ll)\b/.test(t)) score += 2; // intention
  return Math.min(10, score);
}

export async function judgeJournal(journal: string): Promise<{ journalScore: number | null; journalFeedback: string | null }> {
  try {
    const result = await chat({
      messages: [
        { role: "system", content: JOURNAL_SYSTEM },
        { role: "user", content: journal.slice(0, 1500) },
      ],
      schema: JOURNAL_SCHEMA,
      temperature: 0.4,
      maxTokens: 220,
      timeoutMs: 5 * 60_000,
    });
    const raw = parseJson<{ journalScore?: unknown; journalFeedback?: unknown }>(result.content);
    return {
      journalScore: scoreJournal(journal),
      journalFeedback: typeof raw?.journalFeedback === "string" ? raw.journalFeedback.slice(0, 800) : null,
    };
  } catch {
    return { journalScore: scoreJournal(journal), journalFeedback: null };
  }
}

/**
 * The nightly (23:30) final grade: the same cited-facts grader as the live scores, graded as a
 * finished day ("missed", not "not done yet"), plus journal feedback.
 */
export async function judgeDay(userId: string, date = new Date()): Promise<GradeResult> {
  const day = getStartOfDay(date);
  const facts = await buildFacts(userId, day, { final: true });
  let result: GradeResult;
  try {
    result = await gradeDay(userId, day, { final: true, facts });
  } catch (error) {
    reportError({ context: "judge", error, userId });
    result = await gradeDay(userId, day, { final: true, facts, useModel: false });
  }
  const journal = facts.journal
    ? await judgeJournal(facts.journal)
    : { journalScore: null, journalFeedback: "No journal today. Two honest lines tonight about what went well and what didn't make tomorrow easier to plan." };
  await prisma.categoryScore.update({
    where: { userId_date: { userId, date: day } },
    data: { ...journal, ...(result.usedModel ? { judgedBy: LLM_MODEL } : {}) },
  });
  return result;
}
