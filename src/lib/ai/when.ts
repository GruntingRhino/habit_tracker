import * as chrono from "chrono-node";

export interface ParsedWhen {
  date: Date;
  /** true when the phrase included an explicit clock time */
  hasTime: boolean;
  /** the words that meant the date ("on saturday") */
  text?: string;
}

/**
 * Resolve a natural-language time phrase in code (small models are bad at date math).
 * Relies on process TZ (set TZ=America/New_York on the server).
 */
export function parseWhen(phrase: string | undefined | null, ref = new Date()): ParsedWhen | null {
  if (!phrase?.trim()) return null;
  const results = chrono.parse(phrase, ref, { forwardDate: true });
  const first = results[0];
  if (!first) return null;
  const hasTime = first.start.isCertain("hour");
  let date = first.start.date();
  // "sunday night", "tomorrow morning": a time of day without a clock time.
  if (!hasTime) date.setHours(/\b(night|tonight|evening)\b/i.test(phrase) ? 20 : /\bafternoon\b/i.test(phrase) ? 15 : /\bmorning\b/i.test(phrase) ? 8 : 9, 0, 0, 0);
  // A bare "at 6" at 3pm means 6pm today, not 6am tomorrow (nobody sets 1–6am reminders).
  if (hasTime && !first.start.isCertain("meridiem") && date.getHours() >= 1 && date.getHours() <= 6) {
    const dated = first.start.isCertain("day") || first.start.isCertain("weekday");
    const base = dated ? date : chrono.parse(phrase, ref)[0]?.start.date() ?? date;
    date = new Date(base.getTime() + 12 * 3_600_000);
    if (!dated && date <= ref) date = new Date(date.getTime() + 86_400_000);
  }
  return { date, hasTime, text: first.text };
}

/** Find a time phrase inside free text (used when the model forgot to fill `when`). */
export function findWhenInText(text: string, ref = new Date()): ParsedWhen | null {
  return parseWhen(text, ref);
}

const VAGUE = new Set(["next", "first", "last", "later", "soon", "now", "then", "after", "before"]);

/**
 * Accept a model-extracted time phrase only if it really came from the user's text
 * (models sometimes turn "thesis next" into a date).
 */
export function parseWhenFrom(phrase: string | undefined | null, sourceText: string, ref = new Date()): ParsedWhen | null {
  const p = phrase?.trim().toLowerCase();
  if (!p || VAGUE.has(p)) return null;
  if (!sourceText.toLowerCase().includes(p)) return null;
  return parseWhen(p, ref);
}
