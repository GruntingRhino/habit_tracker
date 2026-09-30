/**
 * "I have a chem test Friday" → a high-priority to-do due Friday and a reminder Thursday evening.
 * No study plans: he only wants to be kept on track and reminded.
 */
import { addDays } from "date-fns";
import { getStartOfDay } from "@/lib/utils";

export type AssessmentKind = "exam" | "test" | "quiz" | "essay" | "project" | "presentation";

export interface Assessment {
  kind: AssessmentKind;
  subject: string | null;
}

const KIND = /\b(final exam|final|midterm|exam|test|quiz|essay|paper|lab report|project|presentation)s?\b/i;

/** Is this to-do an upcoming assessment? */
export function detectAssessment(title: string, text = ""): Assessment | null {
  const s = `${title} ${text}`.toLowerCase();
  if (/\b(study|prep|review) (for|session)\b/.test(title.toLowerCase())) return null; // already a study item
  const m = s.match(KIND);
  if (!m) return null;
  const word = m[1].toLowerCase();
  const kind: AssessmentKind =
    /final|midterm|exam/.test(word) ? "exam" : word === "quiz" ? "quiz" : /essay|paper|lab report/.test(word) ? "essay" : word === "presentation" ? "presentation" : word === "project" ? "project" : "test";
  // "project" alone is too broad (GoodHours is a project): only school-ish ones.
  if (kind === "project" && !/\b(school|class|group|science|history|english|due)\b/.test(s)) return null;
  const subject =
    s.match(/\b(?:for|in|on)\s+([a-z][a-z ]{1,20}?)\s+(?:class\b|on\b|friday|monday|tuesday|wednesday|thursday|saturday|sunday|tomorrow|next|$)/)?.[1] ??
    s.match(/\b([a-z]{3,}(?: [a-z]{2,})?)\s+(?:final exam|final|midterm|exam|test|quiz|essay|paper|lab report|project|presentation)\b/)?.[1] ??
    null;
  const clean = subject && !/^(a|an|the|my|big|have|has|got|i|unit|chapter|pop|practice)$/.test(subject.trim()) ? subject.trim().replace(/^(a|an|the|my|big) /, "") : null;
  return { kind, subject: clean };
}

/** 7pm the evening before it's due (null if that's already past). */
export function headsUpTime(due: Date, now = new Date()) {
  const at = addDays(getStartOfDay(due), -1);
  at.setHours(19, 0, 0, 0);
  return at > now ? at : null;
}
