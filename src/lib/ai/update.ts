/**
 * A "here's my day" message, read by code piece by piece (slang and typos included):
 *
 *   sleep        "slept 11 to 6:40", "crashed at like midnight, up at 7", "got maybe 6 hrs"
 *   tests ahead  "bio and math quiz tomorrow", "gotta hit the books for chem tmrw, big test"
 *   events       "coach wants to meet thursday", "meeting with the principal friday at 10"
 *   to-dos       "have to / gotta / remember to / dont forget to …", "add X to my list",
 *                "i owe my mom 20 bucks"
 *   set-ups      "we can set up a meeting", "need to schedule a call with the district"
 *   workouts     "hit legs", "did push day", "ran 3 miles";  meals "had chipotle for lunch"
 * Everything else (how it went, how he feels) is reflection → the journal.
 */
import * as chrono from "chrono-node";
import { parseEventStatement } from "@/lib/calendar";

export interface UpdateEvent {
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  hasTime: boolean;
}

export interface Extracted {
  sleep: { hours: number; minutes: number; bedtime: string | null } | null;
  assessments: { title: string; start: Date; prepTitle: string }[];
  events: UpdateEvent[];
  /** deadline: "X is due friday" (reminded the evening before). */
  todos: { title: string; due: Date | null; deadline?: boolean }[];
  meetings: { title: string; who: string | null }[];
  workouts: string[];
  meals: { name: string; category: string | null; text: string }[];
  /** Clauses nothing claimed: how the day went, feelings. */
  reflection: string[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** His shorthand → words chrono and the patterns understand. */
export function normalize(text: string) {
  return text
    .replace(/[’‘]/g, "'")
    .replace(/\b(tmrw|tmr|tmrow|tmmrw|tomoro|tomorow|tommorow|tommorrow|2morrow|2mrw)\b/gi, "tomorrow")
    .replace(/\b(tonite|2nite)\b/gi, "tonight")
    .replace(/\b(thurs|thur)\b/gi, "thursday")
    .replace(/\btues\b/gi, "tuesday")
    .replace(/\bweds\b/gi, "wednesday")
    .replace(/\bw\/\s*/gi, "with ")
    .replace(/\bb4\b/gi, "before")
    .replace(/\babt\b/gi, "about")
    .replace(/\bdont\b/gi, "don't");
}

/** Clauses: sentences, and "also …" / ", had …" / ", and dont …" pieces. */
export function clauses(text: string) {
  const lead = "(?:i|we|my|it'?s|im|i'?m|i'?ll|great|good|bad|but|had|ate|hit|did|went|got|gotta|need|don'?t|remember|ran|lifted|coach|mr|ms|mrs|then|and (?:then|i|don'?t|gotta|need|remember))";
  return normalize(text)
    .replace(/\s+/g, " ")
    .split(new RegExp(`(?<=[.!?])\\s+|\\s*;\\s*|,\\s*(?:also|btw|oh and|and also|plus)\\s+|\\s+(?:btw|oh and|and also|plus)\\s+|,\\s+(?=${lead}\\b)|\\s+and (?=(?:i|we) (?:should|have to|need to|gotta|got to|must|still|also)\\b)|,?\\s+and\\s+(?=(?:a|an|my|the)\\s+[a-z]+\\s+(?:quiz|test|exam|midterm|final)\\b)`, "i"))
    .map((c) =>
      c
        .replace(/^((also|and|plus|oh|so|ok(ay)?|uhh?|um+|honestly|like)\b[\s,]*)+/gi, "")
        .replace(/\b(too|by the way|lol|btw|tbh|idk|lmao|ngl)\b/gi, " ")
        .replace(/\s+/g, " ")
        .replace(/^[\s,.-]+|[\s,.]+$/g, "")
        .trim()
    )
    .filter((c) => c.length > 2);
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "on the 14th" (no month): chrono can't, so name the month — this month if it's still ahead, else next. */
export function withMonths(text: string, now: Date) {
  return text.replace(/\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b(?!\s+(?:of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/gi, (m, d: string) => {
    const day = Number(d);
    if (day < 1 || day > 31) return m;
    const month = day >= now.getDate() ? now.getMonth() : now.getMonth() + 1;
    return `on ${MONTHS[month % 12]} ${day}`;
  });
}

/** chrono, plus: a bare "at 5" in a plan means 5pm today, not 5am tomorrow; "the 14th" is a date. */
export function when(text: string, now: Date) {
  text = withMonths(text, now);
  const all = chrono.parse(text, now, { forwardDate: true });
  let r = all[0];
  if (!r) return null;
  // "tomorrow im going to start studying bio at 4": the day and the time are separate phrases.
  const timed = !r.start.isCertain("hour") ? all.slice(1).find((x) => x.start.isCertain("hour") && !x.start.isCertain("day") && !x.start.isCertain("weekday")) : null;
  if (timed) r = chrono.parse(`${r.text} at ${timed.text.replace(/^at\s+/i, "")}`, now, { forwardDate: true })[0] ?? r;
  const hasTime = r.start.isCertain("hour");
  let date = r.start.date();
  if (hasTime && !r.start.isCertain("meridiem") && date.getHours() >= 1 && date.getHours() <= 6) {
    const dated = r.start.isCertain("day") || r.start.isCertain("weekday");
    // Time only: chrono pushed "5" to 5am tomorrow; take today's 5pm unless that's already gone.
    const base = dated ? date : chrono.parse(text, now)[0]?.start.date() ?? date;
    date = new Date(base.getTime() + 12 * 3_600_000);
    if (!dated && date <= now) date = new Date(date.getTime() + 86_400_000);
  }
  return { date, hasTime, text: timed ? `${all[0].text}|${timed.text}` : r.text };
}

/** Remove the time phrases when() used from a title. */
const stripWhen = (s: string, w: { text: string } | null) => (w ? w.text.split("|").reduce((acc, t) => acc.replace(t, " "), s) : s).replace(/\s+/g, " ");

// ---- sleep ------------------------------------------------------------------------------------

const T = "(\\d{1,2}(?::\\d{2})?(?:\\s*(?:am|pm|a|p)\\b)?|midnight|noon)";
const FILL = "(?:\\s+(?:at|around|like|about|by|maybe|ish|from))*\\s+";

function toMinutes(tok: string, bedside: boolean) {
  const t = tok.trim().toLowerCase();
  if (t === "midnight") return 0;
  if (t === "noon") return 12 * 60;
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  let h = n % 12;
  // Bed "11" → 11pm, bed "12:30" → just after midnight, wake "6:40" → am.
  const pm = m[3] ? /p/.test(m[3]) : bedside ? n >= 6 && n !== 12 : false;
  if (pm) h += 12;
  return h * 60 + Number(m[2] ?? 0);
}

export function parseSleep(text: string): Extracted["sleep"] {
  const t = normalize(text).toLowerCase();
  const range =
    t.match(new RegExp(`\\bslept${FILL}${T}\\s*(?:to|till|until|-|–)\\s*${T}`)) ??
    t.match(new RegExp(`\\b(?:went to (?:bed|sleep)|fell asleep|crashed|passed out|knocked out|slept|got to bed)${FILL}${T}.{0,40}?\\b(?:woke(?: up)?|got up|up)${FILL}${T}`));
  if (range) {
    const bed = toMinutes(range[1], true);
    const wake = toMinutes(range[2], false);
    if (bed == null || wake == null) return null;
    const mins = (wake - bed + 1440) % 1440;
    if (mins < 60 || mins > 16 * 60) return null;
    return { hours: Math.round((mins / 60) * 100) / 100, minutes: mins, bedtime: `${pad(Math.floor(bed / 60))}:${pad(bed % 60)}` };
  }
  const dur =
    t.match(/\b(?:slept|got|had)\s+(?:in,?\s+)?(?:(?:maybe|like|about|around|only|just|roughly|barely|a solid|a good|for)\s+)*(\d{1,2}(?:\.\d+)?)\s*(?:h|hrs?|hours?)\b/) ??
    t.match(/\b(\d{1,2}(?:\.\d+)?)\s*(?:h|hrs?|hours?) of sleep\b/);
  if (dur) {
    const h = Number(dur[1]);
    if (h > 0 && h <= 16) return { hours: h, minutes: Math.round(h * 60), bedtime: null };
  }
  return null;
}

// ---- tests ahead -------------------------------------------------------------------------------

const KIND = "(quiz|test|exam|midterm|final)";
const SUBJECTS = /\b(math|algebra|geometry|precalc|calc(?:ulus)?|stats|bio(?:logy)?|chem(?:istry)?|physics|science|apush|history|english|lit(?:erature)?|spanish|french|latin|chinese|econ(?:omics)?|gov(?:ernment)?|psych(?:ology)?|ela|sat|act|psat)\b/i;
const NOT_SUBJECT = new Set(["my", "a", "the", "big", "pop", "this", "that", "next", "first", "last", "unit", "practice", "for", "our", "and", "have", "had", "study", "got", "huge", "hard", "an", "another"]);
const PAST_TEST = new RegExp(`\\b(had|took|finished|did|done with|got)\\b[^.]{0,30}\\b${KIND}\\b(?!\\s+(?:on|tomorrow|next|this|monday|tuesday|wednesday|thursday|friday|saturday|sunday))|\\b${KIND}s?\\s+(went|was|were)\\b|\\b${KIND}\\s+back\\b`, "i");

export function parseAssessments(clause: string, now: Date): Extracted["assessments"] {
  const c = normalize(clause).toLowerCase();
  const when = chrono.parse(withMonths(c, now), now, { forwardDate: true })[0];
  if (!when) return [];
  if (PAST_TEST.test(c) && !/\b(tomorrow|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(c)) return [];
  const m = c.match(new RegExp(`\\b((?:[a-z0-9]+(?:\\s*(?:,|and|&)\\s*))*[a-z0-9]+)\\s+${KIND}(?:z?es|s)?\\b`, "i"));
  if (!m) return [];
  const kind = m[2];
  let subjects = m[1]
    .split(/\s*(?:,|\band\b|&)\s*/)
    .map((s) => s.trim().split(/\s+/).filter((w) => !NOT_SUBJECT.has(w)).slice(-2).join(" "))
    .filter((s) => s && !/^\d+$/.test(s));
  // "gotta hit the books for chem tomorrow, big test": the subject sits elsewhere in the sentence.
  if (!subjects.some((s) => SUBJECTS.test(s))) {
    const known = c.match(SUBJECTS)?.[1];
    subjects = known ? [known] : subjects.filter((s) => !/\b(books|lock|grind|tomorrow|today)\b/.test(s));
  }
  const start = when.start.date();
  if (!when.start.isCertain("hour")) start.setHours(0, 0, 0, 0);
  return (subjects.length ? subjects : [""]).map((s) => {
    const name = s ? `${/^(apush|sat|act|psat|ela|ap\b.*)$/.test(s) ? s.toUpperCase() : s} ${kind}` : kind;
    return { title: cap(name), start, prepTitle: `Study for ${name}` };
  });
}

// ---- events with people ------------------------------------------------------------------------

const DAYWORD = "(?:on|at|this|next|tomorrow|today|tonight|after|before|about|monday|tuesday|wednesday|thursday|friday|saturday|sunday)";

function eventFrom(title: string, clause: string, now: Date): UpdateEvent | null {
  const w = when(clause, now);
  if (!w) return null;
  const { hasTime } = w;
  const start = w.date;
  if (!hasTime) start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + (hasTime ? 3_600_000 : 86_400_000));
  return { title: cap(title), start, end, allDay: !hasTime, hasTime };
}

export function parseEvents(clause: string, now: Date): UpdateEvent[] {
  const c = normalize(clause);
  const lc = c.toLowerCase();
  const one = (title: string) => {
    const e = eventFrom(title, c, now);
    return e ? [e] : [];
  };
  // "coach wants to meet thursday", "mr lee wants to talk after school tomorrow"
  const wants = lc.match(/\b((?:(?:mr|ms|mrs|dr)\.?\s+)?[a-z]+)\s+wants?\s+to\s+(meet|talk|call|chat|see me)\b/);
  if (wants && !/^(he|she|they|it|who|that|everyone|nobody)$/.test(wants[1])) {
    const what = { meet: "Meeting", "see me": "Meeting", call: "Call", talk: "Talk", chat: "Talk" }[wants[2]]!;
    return one(`${what} with ${wants[1].replace(/\./, "")}`);
  }
  // "meeting with the principal friday at 10"
  const withWho = lc.match(new RegExp(`\\b(meeting|call|interview|appointment|session|dinner|lunch)\\s+with\\s+(.+?)(?=\\s+${DAYWORD}\\b|[.,!]|$)`));
  if (withWho && !/\b(set ?up|schedule|book|arrange|had|went)\b/.test(lc)) return one(`${withWho[1]} with ${withWho[2].trim()}`);
  // "hanging with jake saturday", "going out with sam friday night"
  const hang = lc.match(new RegExp(`\\b(hanging(?: out)?|hang(?:ing)? out|chilling|going out|meeting up|linking(?: up)?)\\s+with\\s+(.+?)(?=\\s+${DAYWORD}\\b|[.,!]|$)`));
  if (hang) return one(`${hang[1].replace(/\s+(out|up)$/, "")} with ${hang[2].trim()}`);
  // "soccer game saturday at 4", "debate tournament next weekend"
  const thing = lc.match(/\b([a-z]+ (?:game|match|tournament|scrimmage|recital|concert|party|competition)|(?:track|swim) meet)\b/);
  if (thing && !/^(the|a|my|our|this|next|that|big) /.test(thing[1]) && !/\b(had|went|was|were|won|lost|played)\b/.test(lc)) return one(thing[1]);
  // "doctor appointment next monday at 10am", "haircut saturday at 2"
  const noun = lc.match(/^(?:(?:so|also|oh|and|btw|yo|i have|i've got|ive got|i got|i just got|we have|got)\s+)*(?:(?:a|an|my|the)\s+)?((?:[a-z]+\s+)?(?:appointment|appt|checkup|check-up|physical|haircut|interview|lesson|tutoring|orientation|recital|rehearsal|tryouts?|conference|dentist|doctor|orthodontist))\b(?:\s+(at|with)\s+((?:the\s+)?[a-z][a-z'&]+(?:\s+(?!on\b|at\b|this\b|next\b|tomorrow\b|today\b|tonight\b)[a-z][a-z'&]+)?))?/);
  if (noun && !/\b(had|went|was|cancel|move|reschedule|remind)\b/.test(lc)) {
    // "job interview at target on the 9th" → "Job interview at Target"
    const where = noun[3] && !/^(the\s+)?(\d|noon|night|morning|lunch)/.test(noun[3]) ? ` ${noun[2]} ${noun[3].replace(/\b[a-z]/g, (ch) => ch.toUpperCase()).replace(/^The /, "the ")}` : "";
    const e = eventFrom(noun[1].replace(/\bappt\b/, "appointment") + where, c, now);
    if (e) return [e];
  }
  // "i have to be at the airport sunday at 6am"
  const beAt = lc.match(new RegExp(`\\b(?:have to|need to|gotta|got to|must) be at (?:the |my )?([a-z ]+?)(?=\\s+${DAYWORD}\\b|\\s+for\\b|[.,!]|$)`));
  if (beAt) {
    const e = eventFrom(`Be at the ${beAt[1].trim()}`, c, now);
    if (e) return [e];
  }
  // "i have a dentist appointment friday at 3": the calendar's own reader.
  const own = parseEventStatement(c, now);
  return own ? [{ title: own.title, start: own.start, end: own.end, allDay: own.allDay, hasTime: own.hasTime }] : [];
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

const TODO_CUE = /\b(?:i\s+)?(?:have to|need to|gotta|got to|must|should really|really need to|really have to|remember to|don'?t forget to|make sure (?:i |to )+)\s*(.+)$/i;

export function parseTodos(clause: string, now: Date): Extracted["todos"] {
  const c = normalize(clause).trim();
  // "add X to my todo list" (typos welcome: "yo todo list"), "put X on my list"
  if (suggestOnly(c)) return [];
  const add = c.match(/\b(?:add|put)\s+(.+?)\s+(?:to|yo|too|2|on|onto|in|into)\s+(?:(?:my|the|ur|your)\s+)?(?:to-?do\s*)?(?:list|todos?)\b/i) ?? (/\b(?:to|on|in)\s+(?:my|the)\s+calendar\b/i.test(c) ? null : c.match(/^(?:add|put)\s+(.+)$/i));
  if (add) {
    const when = chrono.parse(add[1], now, { forwardDate: true })[0];
    const phrase = (when ? add[1].replace(when.text, " ") : add[1]).replace(/\s+/g, " ").trim();
    return splitItems(cleanTitle(phrase)).map((title) => ({ title, due: when?.date() ?? null }));
  }
  // "my science fair project is due nov 3", "the essay's due friday": a to-do with that due date.
  const deadline = c.match(/^(?:(?:so|and|oh|also|btw)\s+)*(?:(?:my|the|our|a|an)\s+)?([a-z0-9][a-z0-9 '-]{2,60}?)\s+(?:is|are|'s|s)\s+due\s+(.+?)$/i);
  if (deadline && !/^(it|that|this|which|everything|something|nothing)$/i.test(deadline[1].trim())) {
    const w = when(withMonths(deadline[2], now), now);
    if (w) {
      if (!w.hasTime) w.date.setHours(9, 0, 0, 0);
      return [{ title: cap(deadline[1].trim()), due: w.date, deadline: true }];
    }
  }
  // "i owe my mom 20 bucks", "i owe mike $15"
  const owe = c.match(/\bi owe\s+((?:my |the )?[a-z]+?)\s+\$?(\d+(?:\.\d{2})?)(?:\s*(?:bucks|dollars))?\b/i);
  if (owe) return [{ title: `Pay back ${owe[1].trim()} $${owe[2]}`, due: null }];
  // "gonna need a ride to the soccer game saturday" → a to-do to sort out the ride
  const ride = c.match(/\bneed (?:a )?ride (to|home from|from) (?:the |my )?([a-z ]+?)(?=\s+(?:on|at|this|next|tomorrow|today|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|[.,!]|$)/i);
  if (ride) {
    // Sorted before it starts: an hour ahead of a set time, else the day before.
    const w = when(c, now);
    const due = w ? new Date(w.date.getTime() - (w.hasTime ? 3_600_000 : 86_400_000 - 19 * 3_600_000)) : null;
    return [{ title: `Get a ride ${ride[1]} the ${ride[2].trim()}`, due }];
  }
  // "tomorrow i want to finish the outline before practice": a plan with a day → a to-do for that day.
  const intend = c.match(/\b(?:i\s+)?(?:want to|wanna|plan to|am going to|i'?m going to|im going to|i'?m gonna|im gonna|gonna|imma|ima|will|i'll|ill)\s+(.+)$/i);
  const intendWhen = intend ? when(c, now) : null;
  // Only a future day counts ("tomorrow", "friday"); "today"/"2 pm" in a status line doesn't make it a to-do.
  const futureDay = intendWhen && /\b(tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next|this weekend|on the \d)/i.test(intendWhen.text);
  if (intend && futureDay && !/\b(sleep|bed|chill|relax|rest|tell you|let you know|lyk|go home|head home)\b|^be\b/i.test(intend[1])) {
    const title = cleanTitle(stripWhen(intend[1], intendWhen)).replace(/\s+(for|on|by|at)\s*$/i, "").trim();
    if (title.split(/\s+/).length >= 2) {
      const due = intendWhen.date;
      if (!intendWhen.hasTime) due.setHours(9, 0, 0, 0);
      return [{ title: cap(title), due }];
    }
  }
  const need = c.match(TODO_CUE);
  if (need && !/\b(quiz|test|exam|midterm|final)\b/i.test(need[1])) {
    // Two jobs in one breath: "turn in the permission slip and pick up my brother at 4".
    const parts = need[1].split(/\s+and\s+(?=(?:pick|get|call|email|text|buy|finish|turn|submit|clean|return|pay|send|make|take|bring|drop|write|practice|study|go to|grab|print|sign|book|schedule|order|fix|wash|do|review|redo|read|reread|memorize|outline|watch|go over)\b)/i);
    if (parts.length > 1) {
      const dayOnly = /\b(tomorrow|tonight|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week)\b/i.exec(c)?.[1];
      return parts.flatMap((part) => parseTodos(`need to ${dayOnly && !new RegExp(`\\b${dayOnly}\\b`, "i").test(part) ? `${part} ${dayOnly}` : part}`, now));
    }
    const w = when(need[1], now) ?? (/\b(tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week)\b/i.test(c) ? when(c, now) : null);
    if (w && !when(need[1], now) && !w.hasTime) w.date.setHours(9, 0, 0, 0);
    const title = cleanTitle((w && w.text.split("|").some((t) => need[1].includes(t)) ? stripWhen(need[1], w) : need[1]).replace(/\s+/g, " ")).replace(/\s+(for|on|by|at|before)\s*$/i, "").trim();
    if (title.split(/\s+/).length >= 2 && !/^(go|be|say|think|admit|lock in|sleep|chill|relax)\b/i.test(title)) {
      return [{ title: cap(title), due: w?.date ?? null }];
    }
  }
  return [];
}

// ---- things to set up (no date yet) ------------------------------------------------------------

export function parseMeetings(clause: string, whole: string): Extracted["meetings"] {
  const c = normalize(clause).toLowerCase();
  const m = c.match(/\b(?:set ?up|schedule|book|arrange)\s+(?:a|the|another)?\s*(meeting|call|interview|chat)\b(?:\s+with\s+((?:the\s+|my\s+)?[a-z ]+?))?(?=[.,!]|$|\s+(?:soon|next|this|about|to)\b)/);
  if (!m) return [];
  const heard = normalize(whole).toLowerCase().match(/\bheard (?:back )?from (?:the |my )?([a-z ]+?)(?: that| saying| and|[.,])/)?.[1]?.trim();
  const who = m[2]?.trim() || heard || null;
  return [{ title: `Set up ${m[1]}${who ? ` with ${who}` : ""}`, who: who?.replace(/^(the|my)\s+/, "") ?? null }];
}

// ---- workouts and meals ------------------------------------------------------------------------

const FUTURE = /\b(gotta|going to|gonna|need to|have to|will|plan to|want to|should|tomorrow|later|tonight)\b/i;

export function parseWorkout(clause: string): string | null {
  const c = normalize(clause).toLowerCase();
  if (FUTURE.test(c)) return null;
  const M = "legs|chest|back|arms|shoulders|push|pull|upper|lower|abs|cardio|core|tris|triceps|bis|biceps|glutes|calves";
  const split = c.match(new RegExp(`\\b(?:hit|did|trained|worked|smashed|killed)\\s+(${M})(?:\\s*(?:and|&|\\/|\\+)\\s*(${M}))?(?:\\s+(day|body))?\\b`));
  if (split) return cap([split[1], split[2]].filter(Boolean).join(" and ") + (split[3] ? ` ${split[3]}` : ""));
  const cardio = c.match(/\b(ran|jogged|biked|cycled|swam|walked|rowed)\s+(\d+(?:\.\d+)?)\s*(miles?|mi|k|km|laps?)\b/);
  if (cardio) return cap(`${cardio[1]} ${cardio[2]} ${cardio[3] === "mi" ? "miles" : cardio[3]}`);
  if (/\b(went to the gym|worked out|lifted|hit the gym|went lifting)\b/.test(c)) return "Gym";
  const sport = c.match(/\b(?:had|did|went to)\s+(?:\w+\s+)?(mma|boxing|sparring|jiu ?jitsu|bjj|wrestling)\b/);
  if (sport) return cap(sport[1]);
  return null;
}

export function parseMeal(clause: string): Extracted["meals"][number] | null {
  const c = normalize(clause);
  if (/\b(skipped|didn'?t eat|no (breakfast|lunch|dinner))\b/i.test(c) || FUTURE.test(c)) return null;
  const m = c.match(/\b(?:had|ate|got|grabbed)\s+(.+?)\s+for\s+(breakfast|lunch|dinner|a snack|snack)\b/i);
  if (!m) return null;
  const name = m[1].trim().replace(/^(some|a|an)\s+/i, "");
  if (/\b(test|quiz|exam|practice|class|meeting|time|fun|nap)\b/i.test(name)) return null;
  return { name: cap(name), category: m[2].toLowerCase().replace(/^a /, ""), text: clause };
}

// ---- the whole message -------------------------------------------------------------------------

export function extractUpdate(text: string, now = new Date()): Extracted {
  const out: Extracted = { sleep: parseSleep(text), assessments: [], events: [], todos: [], meetings: [], workouts: [], meals: [], reflection: [] };
  for (const c of clauses(text)) {
    let used = !!parseSleep(c);
    const a = parseAssessments(c, now);
    for (const x of a) if (!out.assessments.some((y) => y.title === x.title)) out.assessments.push(x);
    if (a.length) used = true;
    else {
      const m = parseMeetings(c, text);
      const e = m.length ? [] : parseEvents(c, now);
      const t = m.length ? [] : parseTodos(c, now);
      const w = parseWorkout(c);
      const meal = parseMeal(c);
      out.meetings.push(...m);
      out.events.push(...e);
      out.todos.push(...t);
      if (w) out.workouts.push(w);
      if (meal) out.meals.push(meal);
      if (m.length || e.length || t.length || w || meal) used = true;
    }
    if (!used && (suggestOnly(c) || /^(?:and\s+|also\s+)?(?:in|to|for|on)\s+(?:the|its|it'?s|that|this)\s+(?:description|notes|details|desc)\b/i.test(c))) used = true; // "add one thing you think i'm missing": handled with the to-do's description
    if (!used) out.reflection.push(c);
  }
  // "worked out today, did chest and tris": one workout, the specific one.
  if (out.workouts.length > 1) out.workouts = out.workouts.filter((w) => w !== "Gym");
  return out;
}

export function actionableCount(x: Extracted) {
  return (x.sleep ? 1 : 0) + x.assessments.length + x.events.length + x.todos.length + x.meetings.length + x.workouts.length + x.meals.length;
}

/** Worth handling as an update: several things in one message, not just a question. */
export function isUpdate(text: string, x: Extracted) {
  const actionable = actionableCount(x);
  return text.length >= 120 && !/\?\s*$/.test(text.trim()) ? true : actionable >= 2 || (actionable >= 1 && x.reflection.length >= 1 && text.length >= 80);
}

/** Leftover clauses that sound like something to do or somewhere to be: worth a checked second look. */
export const INTENT = /\b(will|gonna|going to|need|have to|gotta|should|want to|plan(?:ning)? to|remind|due|deadline|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|this weekend|at \d|by \d)\b/i;

// ---- "in the description include …" -------------------------------------------------------------

const GERUND: Record<string, string> = { doing: "Do", finishing: "Finish", making: "Make", reviewing: "Review", practicing: "Practice", practising: "Practice", writing: "Write", preparing: "Prepare", reading: "Read", studying: "Study", getting: "Get", creating: "Create", emailing: "Email", calling: "Call", printing: "Print", checking: "Check", updating: "Update", building: "Build", testing: "Test", planning: "Plan", rehearsing: "Rehearse", researching: "Research", drafting: "Draft", sending: "Send", bringing: "Bring" };

/** "1 more thing you think is good", "add one thing you think i'm missing": he asks for suggestions. */
export const SUGGEST = /\b(\d+|one|two|three|a couple(?: of)?|a few|some)\s+(?:more\s+|other\s+|extra\s+)?(?:things?|ideas?|steps?|items?)\b(?:\s+(?:that\s+)?(?:you think|you'?d (?:add|suggest|recommend)|you suggest|i'?m missing|i might be missing|i (?:might have |may have )?forgot(?:ten)?))|\b(\d+|one|two|three|a couple(?: of)?|a few|some)\s+(?:more|other|extra)\s+(?:things?|ideas?|steps?|items?)\b/i;
/** The whole clause is the request: "add one thing you think i'm missing too". */
const suggestOnly = (c: string) => new RegExp(`^(?:(?:also|and|plus|please|pls|can you|could you|then)\\s+)*(?:add|include|give me|suggest|throw in|put in)?\\s*(?:${SUGGEST.source})`, "i").test(c.trim());
const NOT_ITEM = new Set(["it", "that", "this", "them", "stuff", "things", "everything", "more", "too", "also"]);

function countOf(n: string) {
  n = n.toLowerCase();
  return /^\d+$/.test(n) ? Math.min(5, Number(n)) : n === "one" ? 1 : n === "two" || n.startsWith("a couple") ? 2 : 3;
}

/**
 * What goes in a to-do's description: his own items ("in the description include …", "it needs a
 * poster, data tables and a write-up"), plus how many the assistant should add ("1 more thing that
 * you think is good"). Only when he asks.
 */
export function parseNotesRequest(text: string): { items: string[]; extra: number } | null {
  const desc = text.match(/\b(?:in|to|for|on)\s+(?:the|its|it'?s|that|this)\s+(?:description|notes|details|desc)\s*(?:,|:)?\s*(?:include|including|add|put|list|with|have|should (?:have|include|say)|write)?\s*:?\s*(.+?)\s*[.!]*$/i);
  const needs = desc ? null : text.match(/\b(?:it|that|this|which|they)\s+(?:needs|need|requires|require|has to have|have to have|should have|must have|includes|include|will need|is gonna need)\s+(.+?)(?:[.!?](?:\s|$)|$)/i);
  const sugg = text.match(SUGGEST);
  const extra = sugg ? countOf(sugg[1] ?? sugg[2]) : 0;
  let body = (desc ?? needs)?.[1] ?? "";
  // The suggestion request inside the list ("…, and 1 more thing you think is good") isn't an item.
  const inBody = body.match(new RegExp(`\\s*(?:,|\\band\\b)?\\s*(?:also\\s+)?(?:add\\s+)?(?:${SUGGEST.source})[^,]*$`, "i"));
  if (inBody) body = body.slice(0, inBody.index);
  const items = body
    .split(/\s*,\s*(?:and\s+)?|\s+and\s+/i)
    .map((x) => x.trim().replace(/[.!]+$/, "").replace(/^(?:a|an|the|some)\s+/i, ""))
    .filter((x) => x.split(/\s+/).length >= 2 || /\.\w+$/.test(x) || (/^[a-z][a-z-]{2,}$/i.test(x) && !NOT_ITEM.has(x.toLowerCase())))
    .map((x) => {
      const w = x.split(/\s+/)[0].toLowerCase();
      return GERUND[w] ? `${GERUND[w]}${x.slice(w.length)}` : cap(x);
    });
  if (!desc && !needs && !extra) return null;
  return items.length || extra ? { items, extra } : null;
}
