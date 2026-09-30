/**
 * "I have a chem test Friday" → the test itself plus spaced study sessions before it, using what
 * works for him (active recall and practice, not rereading). Pure; applyCapture creates the to-dos.
 */
import { addDays, differenceInCalendarDays } from "date-fns";
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

export interface StudySession {
  title: string;
  dueAt: Date;
  priority: "medium" | "high";
}

const STEPS: Record<AssessmentKind, string[]> = {
  exam: ["make an active-recall sheet of everything on it", "practice problems / past questions", "self-quiz, then fix weak spots", "mixed practice under time", "light review of mistakes (sleep early)"],
  test: ["active-recall sheet + practice problems", "self-quiz and fix weak spots", "quick review of mistakes (sleep early)"],
  quiz: ["active recall + a few practice problems"],
  essay: ["outline + thesis", "full rough draft", "edit, cite, final read"],
  project: ["plan the parts and split the work", "build the main part", "finish and polish"],
  presentation: ["outline + slides", "finish slides", "rehearse twice out loud"],
};

/** Study sessions on the days before `due` (7pm each), spread over what's left. */
export function studyPlan(a: Assessment, due: Date, now = new Date()): StudySession[] {
  const daysLeft = differenceInCalendarDays(getStartOfDay(due), getStartOfDay(now));
  if (daysLeft < 1) return [];
  const steps = STEPS[a.kind];
  const count = Math.min(steps.length, daysLeft);
  // Keep the last steps (review right before) when time is short.
  const chosen = steps.slice(steps.length - count);
  const label = `${a.subject ? `${a.subject.replace(/\b\w/g, (c) => c.toUpperCase())} ` : ""}${a.kind === "essay" ? "essay" : a.kind === "presentation" ? "presentation" : a.kind}`;
  const verb = a.kind === "essay" || a.kind === "project" || a.kind === "presentation" ? "" : "Study for ";
  return chosen.map((step, i) => {
    const d = addDays(getStartOfDay(due), -(count - i));
    // Spread sessions evenly when there are more days than sessions.
    const spread = daysLeft > count ? addDays(getStartOfDay(due), -Math.round(((count - i) * daysLeft) / count)) : d;
    const at = new Date(Math.max(spread.getTime(), getStartOfDay(now).getTime()));
    at.setHours(19, 0, 0, 0);
    return { title: `${verb}${label}${count > 1 ? ` (${i + 1}/${count})` : ""}: ${step}`, dueAt: at, priority: i === count - 1 ? "high" : "medium" };
  });
}
