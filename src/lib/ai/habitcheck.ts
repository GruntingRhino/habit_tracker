/**
 * "just did my posture routine", "read my bible this morning", "drank like 60 oz so far",
 * "didn't read my bible today": which of HIS habits a sentence is about, and whether it's done.
 * Pure code: a habit is only ticked when its own words (or a known synonym) are in the sentence.
 */
export interface HabitRef {
  id: string;
  name: string;
}
export interface HabitReport {
  habit: HabitRef;
  done: boolean;
  note: string | null;
  /** About last night / yesterday, not today. */
  yesterday?: boolean;
}

/** habit-name pattern → how he says it */
const SYNONYMS: [RegExp, RegExp][] = [
  [/\b(workout|work out|gym|lift|train)/i, /\b(work(?:ed|ing)? ?out|workout|gym|lift(?:ed)?|train(?:ed)?|exercised?)\b/i],
  [/posture/i, /\bposture\b/i],
  [/\b(water|hydrat)/i, /\bwater\b|\bhydrat\w*|\b(?:drank|drunk)\s+(?:like\s+|about\s+|around\s+)?\d+(?:\.\d+)?\s*(?:oz|ounces|bottles?|cups?|liters?|l)\b(?!\s+of\s+(?!water))/i],
  [/\b(bible|scripture|devotion)/i, /\b(bible|scripture|devotional?|verse)\b/i],
  [/\bpray/i, /\bpray(?:ed|ing)?\b/i],
  [/\b(sleep|bed)\b/i, /\b(slept|sleep|asleep|bed)\b/i],
  [/\b(phone|screen)\b/i, /\b(phone|screen|scroll\w*)\b/i],
  [/\bstretch/i, /\bstretch\w*\b/i],
  [/\bmeditat/i, /\bmeditat\w*\b/i],
  [/\bjournal/i, /\bjournal\w*\b/i],
  [/\bskincare|skin care\b/i, /\bskin ?care\b/i],
];

const STOP = new Set(["my", "the", "a", "an", "to", "of", "for", "and", "every", "day", "daily", "at", "by", "after", "before", "in", "on", "no", "do", "some", "min", "mins", "minutes", "routine"]);

const NEG = /\b(didn'?t|did not|haven'?t|have not|hasn'?t|never|skipped|skip|forgot|missed|failed|couldn'?t|wasn'?t able|not yet|no time)\b/i;
const FUTURE = /\b(gonna|going to|will|i'?ll|need to|have to|gotta|should|want to|plan(?:ning)? to|about to|later|remind)\b/i;
const DONE = /\b(did|done|finished|completed|just|already|read|drank|drunk|had|got|went|worked out|hit|knocked out|stayed|kept|put|slept|was in bed|prayed|stretched|meditated|journaled|today|this morning|so far)\b/i;

export function mentions(habit: HabitRef, text: string) {
  for (const [name, said] of SYNONYMS) if (name.test(habit.name)) return said.test(text);
  const words = habit.name.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w));
  const lc = text.toLowerCase();
  return words.length > 0 && words.some((w) => new RegExp(`\\b${w.slice(0, Math.max(4, w.length - 2))}`).test(lc));
}

const OZ: Record<string, number> = { oz: 1, ounce: 1, ounces: 1, bottle: 16.9, bottles: 16.9, cup: 8, cups: 8, l: 33.8, liter: 33.8, liters: 33.8 };

/** "60 oz" against "Drink 100 oz water": done only when the target's met. */
function amountNote(habit: HabitRef, text: string): { done: boolean; note: string } | null {
  const target = habit.name.match(/(\d+(?:\.\d+)?)\s*(oz|ounces|cups?|l|liters?|bottles?)\b/i);
  const said = text.match(/(\d+(?:\.\d+)?)\s*(oz|ounces?|bottles?|cups?|liters?|l)\b/i);
  if (!said) return null;
  const oz = Math.round(Number(said[1]) * (OZ[said[2].toLowerCase()] ?? 1));
  if (!target) return { done: true, note: `${oz} oz` };
  const goal = Math.round(Number(target[1]) * (OZ[target[2].toLowerCase()] ?? 1));
  return { done: oz >= goal, note: `${oz} oz of ${goal}` };
}

/** Bedtime / phone habits with a clock time ("Sleep by 10:30"): compare with the time he said. */
function clockNote(habit: HabitRef, text: string): { done: boolean; note: string } | null {
  const limit = habit.name.match(/\b(?:by|before|after)\s+(\d{1,2})(?::(\d{2}))?/i);
  const said = text.match(/\b(?:at|around|by|till|until|from)\s+(?:like\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!limit || !said) return null;
  const toMin = (h: string, m?: string, ap?: string) => {
    let hh = Number(h) % 12;
    if (!ap || /p/i.test(ap)) hh += Number(h) >= 6 || !ap ? 12 : 0; // evening habits: "11" = 11pm, "1" = 1am
    if (ap && /a/i.test(ap)) hh = Number(h) % 12;
    const mins = hh * 60 + Number(m ?? 0);
    return mins < 12 * 60 ? mins + 24 * 60 : mins; // after midnight counts as late
  };
  const lim = toMin(limit[1], limit[2]);
  const got = toMin(said[1], said[2], said[3]);
  const after = /\bafter\b/i.test(habit.name);
  const t = `${said[1]}${said[2] ? `:${said[2]}` : ""}${said[3] ?? ""}`;
  // "Sleep by 10:30": in bed at or before it. "No phone after 10": phone put away at or before it.
  return { done: got <= lim, note: after ? `phone off at ${t}` : `bed at ${t}` };
}

export function parseHabitReports(text: string, habits: HabitRef[]): HabitReport[] {
  if (/\?\s*$/.test(text.trim())) return [];
  const out: HabitReport[] = [];
  // "didn't read my bible but did posture": each piece on its own.
  const pieces = text.split(/(?<=[.!])\s+|\s*;\s*|,\s*|\s+but\s+|\s+and\s+(?=(?:i\s+)?(?:did|didn'?t|also|drank|read|skipped|went|just)\b)/i);
  for (const piece of pieces) {
    // "going to bed" (now) is a report, not a plan.
    const now = /\b(going to|heading to|off to)\s+(bed|sleep)\b/i.test(piece) && !/\b(later|tonight at|at \d)/i.test(piece);
    if (FUTURE.test(piece) && !NEG.test(piece) && !now) continue;
    for (const h of habits) {
      if (out.some((r) => r.habit.id === h.id) || !mentions(h, piece)) continue;
      const amount = /water|drink|hydrat/i.test(h.name) ? amountNote(h, piece) ?? amountNote(h, text) : null;
      const clock = !amount ? clockNote(h, piece) ?? clockNote(h, text) : null;
      if (NEG.test(piece)) out.push({ habit: h, done: false, note: "not done" });
      else if (amount) out.push({ habit: h, done: amount.done, note: amount.note });
      else if (clock) out.push({ habit: h, done: clock.done, note: clock.note });
      else if (DONE.test(piece)) out.push({ habit: h, done: true, note: null });
    }
  }
  // "slept from 11:15 to 6:45" / "went to bed at 11:30" in the morning is about last night.
  const past = /\b(last night|yesterday)\b/i.test(text) || (/\b(slept|went to bed|fell asleep|crashed)\b/i.test(text) && new Date().getHours() < 14);
  const lastNight = /\b(last night|yesterday)\b/i.test(text);
  return past ? out.map((r) => (lastNight || /\b(sleep|bed)\b/i.test(r.habit.name) ? { ...r, yesterday: true } : r)) : out;
}

export const isWorkoutHabit = (name: string) => /\b(workout|work out|gym|train(ing)?|lift(ing)?)\b/i.test(name);
