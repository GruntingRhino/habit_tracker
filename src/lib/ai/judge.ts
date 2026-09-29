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
    const n = Number(raw?.journalScore);
    return {
      journalScore: Number.isFinite(n) ? Math.max(0, Math.min(10, Math.round(n))) : null,
      journalFeedback: typeof raw?.journalFeedback === "string" ? raw.journalFeedback.slice(0, 800) : null,
    };
  } catch {
    return { journalScore: null, journalFeedback: null };
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
