/**
 * The checked second look: clauses of an update that sound like plans ("gonna need a ride to the
 * game saturday") but none of the patterns claimed. The model proposes a to-do or event for each;
 * code only accepts a proposal whose title is built from his own words in that clause, and whose date
 * (for an event) is actually in the clause. Anything else is dropped, and the clause stays journal.
 */
import * as chrono from "chrono-node";
import { chat, parseJson } from "@/lib/ai/llm";
import { INTENT, when } from "@/lib/ai/update";

export interface Proposal {
  clause: string;
  kind: "todo" | "event";
  title: string;
  date: Date | null;
  hasTime: boolean;
}

const SYSTEM = `You read short notes a student wrote about his day. For each numbered note decide if it is:
- "todo": something he still has to do
- "event": something happening at a set day or time (a game, a meeting, plans with someone)
- "none": a feeling, something already done, or anything else
title: 2-6 words, only words from that note, starting with a verb for a todo. Reply JSON only.`;

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { n: { type: "integer" }, kind: { enum: ["todo", "event", "none"] }, title: { type: "string" } },
        required: ["n", "kind", "title"],
      },
    },
  },
  required: ["items"],
};

const STOP = new Set(["a", "an", "the", "to", "for", "of", "on", "at", "with", "my", "and", "in", "up", "get", "go", "do", "make", "have"]);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9$ ]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w));

/** Every meaningful word of the title must come from the clause (a light stem match). */
export function grounded(title: string, clause: string) {
  const have = words(clause);
  const want = words(title);
  if (!want.length || want.length > 8) return false;
  return want.every((w) => have.some((h) => h === w || h.startsWith(w.slice(0, 4)) || w.startsWith(h.slice(0, 4))));
}

export function candidates(reflection: string[]) {
  // Feelings, and vague "gonna go home and do some work on the todo list", aren't new items.
  const VAGUE = /\b(feel|felt|tired|stressed|happy|sad|mad|annoyed|proud|grateful|to-?do list|my list|the list|go home|head home|go to (bed|sleep)|going to (bed|sleep)|heading to bed|bed now|some work|lyk|let you know)\b/i;
  return reflection.filter((c) => INTENT.test(c) && c.length <= 200 && !VAGUE.test(c)).slice(0, 5);
}

export async function secondLook(reflection: string[], now = new Date(), timeoutMs = 45_000): Promise<Proposal[]> {
  const list = candidates(reflection);
  if (!list.length) return [];
  let raw: { items?: { n: number; kind: string; title: string }[] } | null = null;
  try {
    const res = await chat({
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: list.map((c, i) => `${i + 1}. ${c}`).join("\n") },
      ],
      schema: SCHEMA,
      temperature: 0,
      maxTokens: 40 * list.length + 20,
      timeoutMs,
    });
    raw = parseJson(res.content);
  } catch {
    return [];
  }
  const out: Proposal[] = [];
  for (const it of raw?.items ?? []) {
    const clause = list[it.n - 1];
    if (!clause || (it.kind !== "todo" && it.kind !== "event")) continue;
    const title = it.title.trim().replace(/[.!]+$/, "");
    if (!grounded(title, clause)) continue;
    const w = when(clause, now);
    if (it.kind === "event") {
      if (!w || !chrono.parse(clause, now).length) continue; // an event needs a real day in his words
      out.push({ clause, kind: "event", title: title.charAt(0).toUpperCase() + title.slice(1), date: w.date, hasTime: w.hasTime });
    } else {
      out.push({ clause, kind: "todo", title: title.charAt(0).toUpperCase() + title.slice(1), date: w?.date ?? null, hasTime: !!w?.hasTime });
    }
  }
  return out;
}
