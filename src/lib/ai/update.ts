/**
 * A long "here's how my day is going" message: pull out every actionable piece by code instead of
 * dumping the whole thing into the journal (or trusting a 1.7B model to spot five things at once).
 *
 *   "i slept from 11:00 to 6:40"               → sleep 7.7 h (bed 11pm)
 *   "study for my bio and math quiz tomorrow"  → Bio quiz + Math quiz (tomorrow) + "Study for …" to-dos
 *   "add bio and math studying to my todo list"→ to-dos (skipping ones already on the list)
 *   "i have to call the counselor friday"      → to-do due Friday
 *   "we can set up a meeting" (tech leader)    → to-do "Set up meeting with tech district leader" + asks when
 * Everything else (how it went, how he feels) is reflection → the journal.
 */
import * as chrono from "chrono-node";

export interface Extracted {
  sleep: { hours: number; minutes: number; bedtime: string | null } | null;
  assessments: { title: string; start: Date; prepTitle: string }[];
  todos: { title: string; due: Date | null }[];
  meetings: { title: string; who: string | null }[];
  /** Clauses nothing else claimed: how the day went, feelings. */
  reflection: string[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Clauses: sentences, and "also …" / "by the way …" / ", and …" pieces. */
export function clauses(text: string) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+|\s*;\s*|,?\s+(?:also|btw|oh and|and also|plus)\s+|,\s+(?=(?:i|we|my|it'?s|im|i'?m|i'?ll|great|good|bad|but)\b)/i)
    .map((c) => c.replace(/^(also|and|plus|oh|so|ok(ay)?|uhh?|um+)\b[\s,]*/i, "").replace(/\b(too|by the way|lol|btw|tbh|idk|lmao)\b/gi, " ").replace(/\s+/g, " ").replace(/^[\s,.-]+|[\s,.]+$/g, "").trim())
    .filter((c) => c.length > 2);
}

// ---- sleep ------------------------------------------------------------------------------------

function clock(h: string, m: string | undefined, ap: string | undefined, bedside: boolean) {
  let hh = Number(h) % 12;
  const pm = ap ? /p/i.test(ap) : bedside ? Number(h) >= 6 && Number(h) !== 12 : false; // "slept from 11" → 11pm; "to 6:40" → am
  if (pm) hh += 12;
  if (ap && /a/i.test(ap) && Number(h) === 12) hh = 0;
  if (!ap && bedside && Number(h) === 12) hh = 0; // midnight
  return hh * 60 + Number(m ?? 0);
}

export function parseSleep(text: string): Extracted["sleep"] {
  const t = text.toLowerCase();
  const range =
    t.match(/\bslept (?:from )?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|till|until|-|–)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/) ??
    t.match(/\b(?:went to (?:bed|sleep)|fell asleep|slept) at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?.{0,40}?\b(?:woke(?: up)?|got up) at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (range) {
    const bed = clock(range[1], range[2], range[3], true);
    const wake = clock(range[4], range[5], range[6], false);
    const mins = (wake - bed + 1440) % 1440;
    if (mins < 60 || mins > 16 * 60) return null;
    return { hours: Math.round((mins / 60) * 100) / 100, minutes: mins, bedtime: `${pad(Math.floor(bed / 60))}:${pad(bed % 60)}` };
  }
  const hours = t.match(/\b(?:slept|got|only got)(?: for| about| like| around)? (\d{1,2}(?:\.\d)?)\s*(?:h|hrs?|hours)\b(?: of sleep)?/);
  if (hours && Number(hours[1]) > 0 && Number(hours[1]) <= 16) return { hours: Number(hours[1]), minutes: Math.round(Number(hours[1]) * 60), bedtime: null };
  return null;
}

// ---- quizzes, tests, exams ahead ---------------------------------------------------------------

const ASSESS = /\b((?:[a-z0-9]+(?:\s*(?:,|and|&)\s*))*[a-z0-9]+)\s+(quiz|test|exam|midterm|final)(?:z?es|s)?\b/i;
const NOT_SUBJECT = new Set(["my", "a", "the", "big", "pop", "this", "that", "next", "first", "last", "unit", "practice", "for", "our", "and", "have", "had", "study"]);

export function parseAssessments(clause: string, now: Date): Extracted["assessments"] {
  const c = clause.toLowerCase();
  // "had my APUSH test", "took the math test": it's over, nothing to add.
  if (/\b(had|took|finished|did|got (?:it|my \w+ \w+) back|done with)\b[^.]{0,30}\b(quiz|test|exam|midterm|final)/.test(c)) return [];
  const m = c.match(ASSESS);
  if (!m) return [];
  const when = chrono.parse(clause, now, { forwardDate: true })[0];
  if (!when) return [];
  const kind = m[2];
  const subjects = m[1]
    .split(/\s*(?:,|\band\b|&)\s*/)
    .map((s) => s.trim().split(/\s+/).filter((w) => !NOT_SUBJECT.has(w)).slice(-2).join(" "))
    .filter(Boolean);
  const start = when.start.date();
  if (!when.start.isCertain("hour")) start.setHours(0, 0, 0, 0);
  return (subjects.length ? subjects : [""]).map((s) => {
    const name = s ? `${s.length <= 5 && !/\s/.test(s) && /^(apush|ap|sat|act|psat)/.test(s) ? s.toUpperCase() : s} ${kind}` : kind;
    return { title: cap(name), start, prepTitle: `Study for ${name}` };
  });
}

// ---- to-dos ------------------------------------------------------------------------------------

/** "bio and math studying" → ["Study bio", "Study math"]; "groceries and laundry" → two items. */
export function splitItems(phrase: string): string[] {
  const p = phrase.trim().replace(/^(my|the|some)\s+/i, "");
  const shared = p.match(/^([a-z0-9 ]+?) and ([a-z0-9 ]+?) (studying|homework|practice|review|prep|reading)$/i);
  if (shared) {
    const verb = { studying: "Study", homework: "Do homework:", practice: "Practice", review: "Review", prep: "Prep", reading: "Read" }[shared[3].toLowerCase()] ?? cap(shared[3]);
    return [shared[1], shared[2]].map((x) => `${verb} ${x.trim()}`.replace(/: /, " for "));
  }
  if (/\band\b/i.test(p) && p.split(/\s+/).length <= 6) return p.split(/\s*(?:,|\band\b)\s*/i).filter(Boolean).map(cap);
  return [cap(p)];
}

/** "submit the scholarship form asap, it's urgent" → "submit the scholarship form" */
function cleanTitle(t: string) {
  return t
    .split(/\s*[,;(]\s*|\s+(?:and )?(?:it'?s|its|that'?s)\s+(?:urgent|important|due)\b/i)[0]
    .replace(/\b(asap|urgently|urgent|right now|immediately|please|pls|lol|real quick|at some point)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseTodos(clause: string, now: Date): Extracted["todos"] {
  const c = clause.trim();
  // "add X to my todo list", "put X on my list"
  // Typos welcome: "add bio and math studying yo todo list".
  const add = c.match(/\b(?:add|put)\s+(.+?)\s+(?:to|yo|too|2|on|onto|in|into)\s+(?:(?:my|the|ur|your)\s+)?(?:to-?do\s*)?(?:list|todos?)\b/i) ?? c.match(/^(?:add|put)\s+(.+)$/i);
  if (add) {
    const when = chrono.parse(add[1], now, { forwardDate: true })[0];
    const phrase = (when ? add[1].replace(when.text, " ") : add[1]).replace(/\s+/g, " ").trim();
    return splitItems(cleanTitle(phrase)).map((title) => ({ title, due: when?.date() ?? null }));
  }
  // "i have to call the counselor friday", "need to finish the essay"
  const need = c.match(/\b(?:i\s+)?(?:have to|need to|gotta|got to|must|should really)\s+(.+)$/i);
  if (need && !/\b(quiz|test|exam|midterm|final)\b/i.test(need[1])) {
    const when = chrono.parse(need[1], now, { forwardDate: true })[0];
    const title = cleanTitle((when ? need[1].replace(when.text, " ") : need[1]).replace(/\s+/g, " ")).replace(/\b(for|on|by|at)\s*$/i, "").trim();
    if (title.split(/\s+/).length >= 2 && !/^(go|be|say|think|admit)\b/i.test(title)) return [{ title: cap(title), due: when?.date() ?? null }];
  }
  return [];
}

// ---- meetings to set up ------------------------------------------------------------------------

export function parseMeetings(clause: string, whole: string): Extracted["meetings"] {
  const c = clause.toLowerCase();
  const m = c.match(/\b(?:set ?up|schedule|book|arrange|have)\s+(?:a|the|another)?\s*(meeting|call|interview|chat)\b(?:\s+with\s+(?:the\s+|my\s+)?([a-z ]+?))?(?:[.,!]|$|\s+(?:soon|next|this|about|to)\b)/);
  if (!m) return [];
  const who = m[2]?.trim() || whole.toLowerCase().match(/\bheard (?:back )?from (?:the |my )?([a-z ]+?)(?: that| saying| and|[.,])/)?.[1]?.trim() || null;
  return [{ title: `Set up ${m[1]}${who ? ` with ${who}` : ""}`, who }];
}

export function extractUpdate(text: string, now = new Date()): Extracted {
  const out: Extracted = { sleep: parseSleep(text), assessments: [], todos: [], meetings: [], reflection: [] };
  for (const c of clauses(text)) {
    let used = false;
    if (parseSleep(c)) used = true;
    const a = parseAssessments(c, now);
    if (a.length) {
      for (const x of a) if (!out.assessments.some((y) => y.title === x.title)) out.assessments.push(x);
      used = true;
    }
    const m = parseMeetings(c, text);
    if (m.length) {
      out.meetings.push(...m);
      used = true;
    } else if (!a.length) {
      const t = parseTodos(c, now);
      if (t.length) {
        out.todos.push(...t);
        used = true;
      }
    }
    if (!used) out.reflection.push(c);
  }
  return out;
}

/** Worth handling as an update: several things in one message, not just a question. */
export function isUpdate(text: string, x: Extracted) {
  const actionable = (x.sleep ? 1 : 0) + x.assessments.length + x.todos.length + x.meetings.length;
  return text.length >= 120 && !/\?\s*$/.test(text.trim()) ? true : actionable >= 2 || (actionable >= 1 && x.reflection.length >= 1 && text.length >= 80);
}
