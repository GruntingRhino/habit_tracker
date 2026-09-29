/**
 * Extract: turn things he said (chat, journal) into short claims about him.
 *
 * The model only proposes; code decides. A claim is kept only if it cites a real numbered line
 * and most of its meaningful words actually appear in that line, so it can't invent facts
 * ("He stuffs pineapples with hot sauce" from "I had pineapple" is rejected).
 */
import { chat, parseJson } from "@/lib/ai/llm";
import { CATEGORIES, isCategory, type CategoryId } from "./categories";

// "How long things take you" is measured from his data only; nothing he says is filed there.
const LEARNABLE = CATEGORIES.filter((c) => c.id !== "task-durations");
import { shortHash, type BrainStore, type Evidence, type Observation } from "./storage";

// Byte-stable for the prompt cache.
export const EXTRACT_SYSTEM = `You learn about Abhay from things he said. Read the numbered lines and pull out lasting facts about HIM: preferences, habits, goals, interests, struggles, how he works, learns or focuses, what distracts him, what he values.
Rules:
- Only what a line clearly says. Never guess, never add details. If a line has nothing lasting about him (a one-off request, a to-do, a question), skip it.
- Each claim: one short sentence in third person starting with "He", max 15 words, reusing his words.
- n is the number of the line the claim comes from.
Categories:
${LEARNABLE.map((c) => `${c.id}: ${c.hint}`).join("\n")}
Reply with minified JSON only: {"claims":[{"n":1,"category":"distractions","claim":"He gets distracted by his phone while studying"}]} or {"claims":[]}`;

export const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: { n: { type: "integer" }, category: { type: "string", enum: LEARNABLE.map((c) => c.id) }, claim: { type: "string" } },
        required: ["n", "category", "claim"],
      },
    },
  },
  required: ["claims"],
};

// Words that carry no content of their own ("He really likes …").
const GENERIC = new Set(
  (
    "he him his abhay himself i me my mine the a an and or but to of in on at for with from by about into as is are was were be been being " +
    "it its this that these those there their they them some any very really often usually always sometimes never not no dont doesnt " +
    "gets get got like likes liked love loves enjoys enjoy wants want prefers prefer tends tend finds find feels feel thinks think needs need " +
    "tries try keeps keep makes make has have had does do did can could would should will just also more less most lot lots much many " +
    "when while during after before then than so because if who what which how day days time times thing things something way well good better best " +
    "around about every each almost mostly usually generally hate hates hated dislike dislikes disliked"
  ).split(" ")
);

// Common paraphrases, so "He gets distracted by social media" can cite "I keep scrolling instagram".
const SYNONYMS: Record<string, string> = {
  instagram: "social", tiktok: "social", snapchat: "social", twitter: "social", reddit: "social", scrolling: "social", scroll: "social", media: "social",
  youtube: "video", videos: "video", watching: "video",
  cell: "phone", iphone: "phone", texting: "phone",
  homework: "study", studying: "study", studies: "study", school: "study", class: "study", classes: "study", exam: "study", exams: "study", test: "study", tests: "study", learn: "study", learning: "study",
  gym: "train", workout: "train", workouts: "train", training: "train", lifting: "train", lift: "train", exercise: "train", exercising: "train",
  mornings: "morning", nights: "night", evenings: "evening", late: "night",
  pray: "prayer", praying: "prayer", prayers: "prayer", god: "faith", church: "faith", mosque: "faith", temple: "faith",
  gaming: "game", games: "game", videogames: "game", xbox: "game", playstation: "game", fortnite: "game",
  procrastinate: "delay", procrastinating: "delay", procrastination: "delay", putting: "delay", postpone: "delay",
  tired: "energy", exhausted: "energy", sleepy: "energy", energized: "energy",
  stressed: "stress", anxious: "stress", anxiety: "stress", overwhelmed: "stress", pressure: "stress",
  focus: "focus", focused: "focus", concentrate: "focus", concentration: "focus", distracted: "distract", distraction: "distract", distractions: "distract",
  money: "money", saving: "money", savings: "money", spend: "money", spending: "money", cash: "money",
  parents: "family", mom: "family", dad: "family", mother: "family", father: "family", brother: "family", sister: "family", grandma: "family", grandpa: "family",
};

// Abstractions a claim may add on top of his words ("He gets *distracted* by …"), at most one per claim.
const ABSTRACT = new Set(["distract", "struggl", "prefer", "motivat", "delay", "stress", "focus", "habit", "goal", "energy", "value", "importa", "consist", "discipl", "product", "routine", "interes", "passion"]);

const NEGATORS = new Set(["not", "no", "never", "dont", "doesnt", "didnt", "cant", "cannot", "isnt", "wont", "hate", "hates", "hated", "dislike", "dislikes", "without"]);

// Categories that are easy to misfile need a matching cue in the claim or the line.
const CATEGORY_CUE: Partial<Record<CategoryId, RegExp>> = {
  distractions: /distract|scroll|phone|tiktok|insta|snap|youtube|video|game|gaming|xbox|social|buzz|notif|wast|lose (focus|track)|lost (focus|track)|text/i,
  stress: /stress|anxi|overwhelm|pressure|worr|calm|cope|relax|panic|nervous/i,
  faith: /god|pray|church|faith|bible|quran|allah|jesus|mosque|temple|spiritual|worship/i,
  money: /money|\$|sav|spend|spent|earn|income|business|\d+k\b|dollar|pay|job|invest|broke|budget/i,
  sleep: /sleep|bed|nap|tired|wake|awake|insomnia|rest/i,
  food: /eat|ate|food|meal|diet|protein|drink|cook|breakfast|lunch|dinner|snack|hungry/i,
  training: /train|gym|lift|spar|fight|run|workout|exercise|mma|box|bag|cardio|sport|jiu|wrestl|kick/i,
};

const THIRD_PARTY = /\b(my|his|her|their)\s+(brother|sister|mom|dad|mother|father|friends?|teacher|coach|girlfriend|boyfriend|cousin|uncle|aunt|grandma|grandpa|parents|family)\b|\b(he|she|they)\b/i;
const FIRST_PERSON = /\b(i|im|i'm|me|myself|ive|i've|ill|i'll|id|i'd)\b/i;

/** The part of the line a claim leans on; a claim about someone else ("my brother is always on his phone") isn't about him. */
function aboutSomeoneElse(claimKeys: string[], evidence: string) {
  const clauses = quotedPart(evidence).split(/[,.;!?]|\bbut\b|\band\b/i);
  let best = "";
  let hits = 0;
  for (const c of clauses) {
    const keys = new Set(contentWords(c));
    const n = claimKeys.filter((k) => keys.has(k)).length;
    if (n > hits) {
      hits = n;
      best = c;
    }
  }
  return hits > 0 && THIRD_PARTY.test(best) && !FIRST_PERSON.test(best);
}

export function contentWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/'s?$/, "").replace(/'/g, ""))
    .filter((w) => w.length > 2 && !GENERIC.has(w))
    .map((w) => SYNONYMS[w] ?? SYNONYMS[stem(w)] ?? stem(w));
}

function stem(w: string) {
  return w.replace(/(ing|ed|es|s|ly)$/, "").slice(0, 7);
}

/** Share of the claim's meaningful words found in the evidence (0..1), and how many there were. */
export function grounding(claim: string, evidence: string) {
  const c = [...new Set(contentWords(claim))];
  const e = new Set(contentWords(evidence));
  if (!c.length) return { score: 0, words: 0 };
  return { score: c.filter((w) => e.has(w)).length / c.length, words: c.length };
}

/** The quoted part of an evidence line (his words), or the whole line if there are no quotes. */
export function quotedPart(line: string) {
  return line.match(/"([\s\S]*)"/)?.[1] ?? line;
}

// About one day, not about him ("He had a good focus day", "He is tired today").
const ONE_OFF = /\b(today|tonight|yesterday|this (morning|afternoon|evening|week|weekend)|right now|at the moment|a (good|bad|great|rough|long|productive|lazy|busy) [a-z]+ day|(had|has) a (good|bad|great|rough|long|productive|lazy|busy) day)\b/i;

// Requests and questions to the assistant say nothing lasting about him.
const REQUEST = /^(remind|add|put|schedule|set|create|make|delete|remove|mark|log|move|cancel|show|list|plan|undo|what|whats|what's|when|where|how|who|why|can you|could you|would you|please|hey|hi|hello|thanks|thank you|ok|okay)\b/i;

function tokens(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/'/g, ""));
}

/** Is `key` (a content word) negated in this text ("not", "hate"… just before it)? Null if absent. */
function negatedIn(text: string, key: string) {
  const ws = tokens(text);
  let seen = false;
  for (let i = 0; i < ws.length; i++) {
    const k = contentWords(ws[i])[0];
    if (k !== key) continue;
    seen = true;
    // Walk back up to 3 words; a negation only covers the next content word ("don't really wake").
    for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
      if (NEGATORS.has(ws[j])) return true;
      if (contentWords(ws[j]).length) break;
    }
  }
  return seen ? false : null;
}

/**
 * Strict check that a claim only restates the line it cites: every meaningful word comes from the
 * line (one abstraction like "distracted" allowed), and nothing liked is something he said he hates.
 */
export function supportedBy(claim: string, line: string, category?: string) {
  // Only his own words count: labels like "He said (evening):" must not ground anything.
  const evidence = quotedPart(line);
  const c = [...new Set(contentWords(claim))];
  const e = new Set(contentWords(evidence));
  const matched = c.filter((w) => e.has(w));
  const unmatched = c.filter((w) => !e.has(w));
  if (!matched.length) return false;
  if (unmatched.length > 1 || (unmatched.length === 1 && !ABSTRACT.has(unmatched[0]))) return false;
  for (const w of matched) {
    const inEvidence = negatedIn(evidence, w);
    const inClaim = negatedIn(claim, w);
    if (inEvidence != null && inClaim != null && inEvidence !== inClaim) return false;
  }
  const cue = category ? CATEGORY_CUE[category as CategoryId] : undefined;
  if (cue && !cue.test(`${claim} ${evidence}`)) return false;
  if (category === "distractions" && !CATEGORY_CUE.distractions!.test(evidence)) return false;
  if (aboutSomeoneElse(matched, evidence)) return false;
  return true;
}

export interface ProposedClaim {
  n: number;
  category: string;
  claim: string;
}

export interface CheckedClaim {
  category: CategoryId;
  claim: string;
  evidence: Evidence;
}

/** Keep only well-formed claims that are grounded in the line they cite. */
export function validateClaims(proposed: ProposedClaim[], lines: Evidence[]): CheckedClaim[] {
  const out: CheckedClaim[] = [];
  for (const p of proposed.slice(0, 12)) {
    const e = lines[p.n - 1];
    if (!e || !isCategory(p.category)) continue;
    let claim = String(p.claim ?? "").replace(/\s+/g, " ").trim().replace(/^I\b/, "He");
    if (claim.length < 12 || claim.length > 140 || !/^(He|His|Abhay)\b/.test(claim)) continue;
    if (ONE_OFF.test(claim)) continue;
    if (!claim.endsWith(".")) claim += ".";
    if (!supportedBy(claim, e.text, p.category)) continue;
    out.push({ category: p.category, claim, evidence: e });
  }
  return out;
}

const NEGATION = /\b(not|no|never|doesn'?t|don'?t|isn'?t|can'?t|won'?t|hates?|dislikes?)\b/i;

export function similarity(a: string, b: string) {
  const A = new Set(contentWords(a));
  const B = new Set(contentWords(b));
  if (!A.size || !B.size) return 0;
  const inter = [...A].filter((w) => B.has(w)).length;
  return inter / (A.size + B.size - inter);
}

export const BASE_CONFIDENCE = { imported: 0.8, quiz: 0.7, said: 0.5, inferred: 0.4 } as const;

/**
 * Merge one claim into a category's observations: a near-duplicate is reinforced, a claim that
 * reverses an older one archives it, a claim he rejected stays out unless the evidence is newer
 * than his correction.
 */
export function mergeClaim(list: Observation[], c: { category: CategoryId; claim: string; source: Observation["source"]; evidence: Evidence; key?: string }): "added" | "reinforced" | "blocked" | "replaced" {
  const t = c.evidence.t;
  const snippet = { t, text: c.evidence.text.slice(0, 200) };
  for (const o of list) {
    if (o.status !== "rejected") continue;
    if (similarity(o.claim, c.claim) >= 0.5 && t <= o.lastSeen) return "blocked";
  }
  let replaced = false;
  for (const o of list) {
    if (o.status !== "active") continue;
    const sim = similarity(o.claim, c.claim);
    if (sim >= 0.6 && NEGATION.test(o.claim) === NEGATION.test(c.claim)) {
      if (!o.evidence.includes(c.evidence.id)) {
        o.evidence = [...o.evidence, c.evidence.id].slice(-8);
        o.snippets = [...o.snippets, snippet].slice(-3);
        o.count++;
        o.confidence = Math.min(0.95, o.confidence + 0.1);
      }
      if (t > o.lastSeen) o.lastSeen = t;
      return "reinforced";
    }
    if (sim >= 0.5 && NEGATION.test(o.claim) !== NEGATION.test(c.claim) && t > o.lastSeen) {
      o.status = "archived";
      replaced = true;
    }
  }
  list.push({
    id: `o-${shortHash(`${c.category}:${c.claim}:${t}`)}`,
    category: c.category,
    claim: c.claim,
    source: c.source,
    evidence: [c.evidence.id],
    snippets: [snippet],
    firstSeen: t,
    lastSeen: t,
    count: 1,
    confidence: BASE_CONFIDENCE[c.source],
    status: "active",
    ...(c.key ? { key: c.key } : {}),
  });
  return replaced ? "replaced" : "added";
}

/** Only his own words are worth the model's time; everything else is handled by computed stats. */
export function worthExtracting(e: Evidence) {
  if (e.src !== "said") return false;
  const quoted = quotedPart(e.text).trim();
  if (e.kind !== "journal" && (REQUEST.test(quoted) || quoted.endsWith("?"))) return false;
  return quoted.split(/\s+/).length >= 4;
}

/** Take the next chunk (≤ ~1.5 KB, ≤ 5 lines: a small model misses things in longer ones) off the queue. */
export function nextChunk(queue: Evidence[], maxChars = 1500, maxLines = 5) {
  const chunk: Evidence[] = [];
  let size = 0;
  for (const e of queue) {
    if (chunk.length >= maxLines || (chunk.length && size + e.text.length > maxChars)) break;
    chunk.push(e);
    size += e.text.length;
  }
  return chunk;
}

/** Run the model on one chunk and merge what survives. Throws if the model call fails (retry later). */
export async function extractChunk(store: BrainStore, chunk: Evidence[], signal?: AbortSignal) {
  // Just his words: extra context (time of day, dates) only tempts a small model to embellish.
  const numbered = chunk.map((e, i) => `${i + 1}. ${quotedPart(e.text).replace(/\s+/g, " ").trim()}`).join("\n");
  const result = await chat({
    messages: [
      { role: "system", content: EXTRACT_SYSTEM },
      { role: "user", content: numbered },
    ],
    schema: EXTRACT_SCHEMA,
    temperature: 0.1,
    maxTokens: 220,
    timeoutMs: 120_000,
    signal,
  });
  const parsed = parseJson<{ claims?: ProposedClaim[] }>(result.content);
  const checked = validateClaims(parsed?.claims ?? [], chunk);
  const touched = new Map<CategoryId, Observation[]>();
  const outcomes: string[] = [];
  const said = new Set<string>();
  for (const c of checked) {
    // The same claim filed under two categories: keep the first.
    const key = contentWords(c.claim).sort().join(" ");
    if (said.has(key)) continue;
    said.add(key);
    const list = touched.get(c.category) ?? store.readObservations(c.category);
    touched.set(c.category, list);
    outcomes.push(`${mergeClaim(list, { ...c, source: "said" })}: [${c.category}] ${c.claim}`);
  }
  for (const [cat, list] of touched) store.writeObservations(cat, list);
  return { proposed: parsed?.claims?.length ?? 0, kept: checked.length, outcomes, touched: [...touched.keys()] };
}
