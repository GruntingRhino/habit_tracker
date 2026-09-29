import prisma from "@/lib/prisma";
import { profileBrief } from "@/lib/brain/consolidate";
import { chat, parseJson, type ChatMessage } from "@/lib/ai/llm";
import { reportError } from "@/lib/monitoring";

/**
 * Conversation memory for a 1.7B model on 2 CPU cores.
 *
 * Every chat call sees at most ~500 tokens of conversation:
 *   [memory]  ≤ MEMORY_CHARS  (~150 tokens) — structured summary of everything older
 *   [recent]  ≤ RECENT_CHARS  (~350 tokens) — the last few turns verbatim
 *
 * When the unsummarized tail grows past RECENT_CHARS, the oldest turns are folded into
 * memory (down to KEEP_CHARS, so compaction happens every few turns, not every turn).
 * Compaction runs after the reply is sent, and memory is a pinned prefix, so Ollama's
 * prompt cache stays warm between compactions.
 */

const MEMORY_CHARS = 600;
const RECENT_CHARS = 1400;
const KEEP_CHARS = 600;
const MSG_CHARS = 420;
/** Telegram has no "new chat" button, so a quiet gap starts a new conversation. */
const TELEGRAM_GAP_MS = 3 * 60 * 60_000;

type Source = "web" | "telegram";

export interface PlanQA {
  q: string;
  a: string;
  /** Profile field this answers ("Level", "Time per week"…). */
  label?: string;
}

export interface PlanDraft {
  title: string;
  summary: string;
  area: string;
  weekly: string[];
  steps: { title: string; when?: string }[];
  first: string;
}

export interface PlanState {
  goal: string;
  qa: PlanQA[];
  /** cancelled: dropped mid-interview. undone: the finished plan's project was undone. */
  stage: "asking" | "done" | "cancelled" | "undone";
  /** The question currently waiting for an answer, its tap options, and its topic index. */
  pending?: string;
  options?: string[];
  topic?: number;
  plan?: PlanDraft;
  /** The project the finished plan was saved as. */
  projectId?: string;
}

export async function resolveConversation(userId: string, source: Source, conversationId?: string | null) {
  if (conversationId) {
    const found = await prisma.conversation.findFirst({ where: { id: conversationId, userId } });
    if (found) return found;
  }
  if (source === "telegram") {
    const recent = await prisma.conversation.findFirst({
      where: { userId, source: "telegram", updatedAt: { gte: new Date(Date.now() - TELEGRAM_GAP_MS) } },
      orderBy: { updatedAt: "desc" },
    });
    if (recent) return recent;
  }
  return prisma.conversation.create({ data: { userId, source } });
}

export function titleFrom(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  const title = clean.length > 48 ? `${clean.slice(0, 46).replace(/\s+\S*$/, "")}…` : clean;
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function clip(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// The profile changes at most a few times a day; a short cache keeps chat from re-querying it.
let briefCache: { userId: string; at: number; text: string | null } | null = null;
async function cachedProfileBrief(userId: string) {
  if (briefCache?.userId === userId && Date.now() - briefCache.at < 5 * 60_000) return briefCache.text;
  const text = await profileBrief(userId).catch(() => null);
  briefCache = { userId, at: Date.now(), text };
  return text;
}

/** Memory + recent turns as chat messages, ready to sit between a system prompt and the new message. */
export async function conversationContext(conversationId: string, excludeId?: string): Promise<ChatMessage[]> {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv) return [];
  const tail = await prisma.chatMessage.findMany({
    where: {
      conversationId,
      ...(conv.memoryUpTo ? { createdAt: { gt: conv.memoryUpTo } } : {}),
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { role: true, content: true, actions: true, meta: true },
  });

  // Newest first until the budget runs out; compaction normally keeps us under it anyway.
  // Undone replies are left out of the transcript (a small model imitates its own past turns)
  // and reported in the notes block instead.
  const recent: ChatMessage[] = [];
  const undoneNotes: string[] = [];
  let used = 0;
  for (const m of tail) {
    const undone = ((m.meta ?? {}) as { undone?: string[] }).undone;
    if (undone?.length) {
      undoneNotes.unshift(`Abhay pressed Undo on one of your replies: ${undone.join("; ")}. It no longer exists; never present it as active.`);
      continue;
    }
    const content = forContext(m);
    if (used + content.length > RECENT_CHARS && recent.length >= 2) break;
    used += content.length;
    recent.unshift({ role: m.role === "user" ? "user" : "assistant", content });
  }
  // Models expect user/assistant alternation starting with the user.
  while (recent[0]?.role === "assistant" && !conv.memory) recent.shift();

  const about = await cachedProfileBrief(conv.userId);
  const memory = [about ? `What you know about Abhay (from his profile):\n${about}` : null, conv.memory, planNote(conv.plan as PlanState | null), ...undoneNotes.map((n) => `- ${n}`)].filter(Boolean).join("\n");
  if (!memory) return recent;
  return [
    { role: "user", content: `[notes about this chat so far]\n${memory}` },
    { role: "assistant", content: "Got it." },
    ...recent,
  ];
}

interface StoredMessage {
  role: string;
  content: string;
  actions?: unknown;
  meta?: unknown;
}

/**
 * A message as the model should see it. Tool results and undos become bracketed notes that are
 * never clipped, so the model can't talk about something he already undid.
 */
export function forContext(m: StoredMessage) {
  const actions = (Array.isArray(m.actions) ? m.actions : []) as { type: string; title: string }[];
  const undone = ((m.meta ?? {}) as { undone?: string[] }).undone ?? [];
  // An undone reply's body is dropped: a 1.7B model copies whatever it can see, including a deleted plan.
  if (undone.length) return `(An earlier reply, undone by Abhay: ${undone.join("; ")}.)`;
  // Action rows become plain notes so the model doesn't learn to write fake ones.
  const body = m.content
    .split("\n")
    .map((l) => l.replace(/^\S+ (To-do|Project|Task|Routine|Habit|Reminder|Meal|Workout|Journal|Note|✅ Done): (.*)$/, (_x, type, rest) => `(${type === "✅ Done" ? "marked done" : `saved ${type.toLowerCase()}`}: ${rest})`))
    .join("\n");
  const text = clip(body, MSG_CHARS);
  const notes = actions.filter((a) => a.type === "plan").map((a) => `[Started planning: ${a.title}]`);
  return [text, ...notes].filter(Boolean).join("\n");
}

/** Add a line to memory (e.g. an undo of something already summarized), dropping old facts to fit. */
export function noteInMemory(memory: string | null, line: string) {
  const lines = [...(memory?.split("\n") ?? []), `- ${line}`];
  while (lines.join("\n").length > MEMORY_CHARS && lines.length > 1) {
    const i = lines.findIndex((l) => l.startsWith("- "));
    if (i === -1 || i === lines.length - 1) break;
    lines.splice(i, 1);
  }
  return clip(lines.join("\n"), MEMORY_CHARS);
}

/** Short pinned note so a finished plan stays in context after its message scrolls out. */
function planNote(plan: PlanState | null) {
  if (!plan?.plan || plan.stage !== "done") return "";
  const p = plan.plan;
  return clip(`Plan made: ${p.title}. ${p.weekly.join("; ")}. Steps: ${p.steps.map((s) => s.title).join("; ")}`, 360);
}

// ── Compactor ────────────────────────────────────────────────────────────────

const COMPACT_SCHEMA = {
  type: "object",
  properties: {
    topic: { type: "string" },
    facts: { type: "array", items: { type: "string" } },
    open: { type: "string" },
  },
  required: ["topic", "facts", "open"],
};

// Keep byte-for-byte stable for the prompt cache.
const COMPACT_SYSTEM = `You keep a tiny memory of an ongoing chat between Abhay and his assistant. Merge the old memory with the new messages. Reply with minified JSON only: {"topic":"...","facts":["..."],"open":"..."}
- topic: what the chat is about now, under 12 words.
- facts: things worth remembering: his goals, answers, preferences, numbers, names, decisions, advice already given. Under 12 words each, at most 8, most important first. Keep old facts unless outdated.
- open: an unanswered question or agreed next step, or "".
Skip greetings, filler and small talk.
Example old memory: Topic: weekend plans
Example messages: Abhay: I think I'll do the 10k on saturday, I've been running 3x a week | Assistant: Nice! Want a taper plan?
{"topic":"Preparing for a 10k on Saturday","facts":["Running a 10k this Saturday","Runs 3 times a week"],"open":"Offered a taper plan"}`;

const compacting = new Set<string>();

/** Fold old turns into memory if the unsummarized tail is over budget. Safe to call after every turn. */
export async function compactIfNeeded(conversationId: string): Promise<void> {
  if (compacting.has(conversationId)) return;
  compacting.add(conversationId);
  try {
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) return;
    const tail = await prisma.chatMessage.findMany({
      where: { conversationId, ...(conv.memoryUpTo ? { createdAt: { gt: conv.memoryUpTo } } : {}) },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true, actions: true, meta: true, createdAt: true },
    });
    const size = (list: typeof tail) => list.reduce((n, m) => n + Math.min(m.content.length, MSG_CHARS), 0);
    if (size(tail) <= RECENT_CHARS) return;

    // Fold from the oldest end until what's left fits KEEP_CHARS; always keep the last exchange.
    let cut = 0;
    while (cut < tail.length - 2 && size(tail.slice(cut)) > KEEP_CHARS) cut++;
    const folded = tail.slice(0, cut);
    if (!folded.length) return;

    const transcript = folded
      .map((m) => `${m.role === "user" ? "Abhay" : "Assistant"}: ${clip(forContext(m).replace(/\s+/g, " "), 360)}`)
      .join(" | ");
    const memory = (await summarize(conv.memory, transcript)) ?? fallbackMemory(conv.memory, folded);
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { memory, memoryUpTo: folded[folded.length - 1].createdAt },
    });
  } catch (error) {
    reportError({ context: "conversation.compact", error });
  } finally {
    compacting.delete(conversationId);
  }
}

async function summarize(oldMemory: string | null, transcript: string): Promise<string | null> {
  try {
    const result = await chat({
      messages: [
        { role: "system", content: COMPACT_SYSTEM },
        { role: "user", content: `Old memory: ${oldMemory?.replace(/\n/g, " ") || "(none)"}\nMessages: ${transcript}` },
      ],
      schema: COMPACT_SCHEMA,
      temperature: 0.1,
      maxTokens: 220,
      timeoutMs: 120_000,
    });
    const parsed = parseJson<{ topic?: string; facts?: string[]; open?: string }>(result.content);
    if (!parsed?.topic && !parsed?.facts?.length) return null;
    return renderMemory(parsed.topic ?? "", parsed.facts ?? [], parsed.open ?? "");
  } catch {
    return null;
  }
}

/** Deterministic, hard-capped memory text. Facts are dropped from the end to fit. */
export function renderMemory(topic: string, facts: string[], open: string) {
  const clean = (s: string, n: number) => clip(s.replace(/\s+/g, " ").trim(), n);
  const unique = [...new Set(facts.map((f) => clean(f, 90)).filter(Boolean))].slice(0, 8);
  const build = (list: string[]) =>
    [
      topic.trim() && `Topic: ${clean(topic, 90)}`,
      ...list.map((f) => `- ${f}`),
      open.trim() && `Open: ${clean(open, 120)}`,
    ]
      .filter(Boolean)
      .join("\n");
  let text = build(unique);
  while (text.length > MEMORY_CHARS && unique.length) {
    unique.pop();
    text = build(unique);
  }
  return clip(text, MEMORY_CHARS);
}

/** If the model is down, keep a crude memory rather than losing the thread. */
function fallbackMemory(oldMemory: string | null, folded: { role: string; content: string }[]) {
  const said = folded.filter((m) => m.role === "user").map((m) => `- Abhay said: ${clip(m.content.replace(/\s+/g, " "), 70)}`);
  const lines = [...(oldMemory?.split("\n") ?? []), ...said];
  while (lines.join("\n").length > MEMORY_CHARS && lines.length > 1) lines.splice(lines[0].startsWith("Topic:") ? 1 : 0, 1);
  return clip(lines.join("\n"), MEMORY_CHARS);
}

export const __test = { COMPACT_SYSTEM, fallbackMemory };
