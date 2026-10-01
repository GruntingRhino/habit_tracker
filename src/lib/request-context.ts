/**
 * Who a piece of work is for, carried through async calls without threading it everywhere:
 * the model client uses it to put the right name/pronouns in prompts, to tell the gate whose
 * request it is and how urgent (the queue), and to report "you're #2 in line" back to the chat.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export type Priority = "interactive" | "normal" | "background";
export type Pronouns = "he" | "she" | "they";

export interface RequestContext {
  userId: string;
  name: string;
  pronouns: Pronouns;
  priority?: Priority;
  /** Called while the request waits in the model queue (position 1 = next). */
  onQueue?: (position: number) => void;
}

const store = new AsyncLocalStorage<RequestContext>();

export function runAs<T>(ctx: RequestContext, fn: () => Promise<T>): Promise<T> {
  return store.run(ctx, fn);
}
export const currentContext = () => store.getStore() ?? null;
/** For a request handler: everything after this call (in the same request) runs as this person. */
export function enterContext(ctx: RequestContext) {
  store.enterWith({ ...store.getStore(), ...ctx });
}
/** The context for a user row (worker / brain jobs). */
export function contextFor(u: { id: string; name: string | null; pronouns: string }, extra: Partial<RequestContext> = {}): RequestContext {
  return { userId: u.id, name: u.name ?? "there", pronouns: (["he", "she", "they"].includes(u.pronouns) ? u.pronouns : "they") as Pronouns, ...extra };
}

/** The prompts were written about the owner ("Abhay … he/his"): rewrite them for someone else. */
const WORDS: Record<Pronouns, Record<string, string>> = {
  he: {},
  she: { he: "she", He: "She", HE: "SHE", his: "her", His: "Her", HIS: "HER", him: "her", Him: "Her", HIM: "HER", himself: "herself" },
  they: { he: "they", He: "They", HE: "THEY", his: "their", His: "Their", HIS: "THEIR", him: "them", Him: "Them", HIM: "THEM", himself: "themself" },
};
export const OWNER_NAME = "Abhay";

export function personalize(text: string, ctx: Pick<RequestContext, "name" | "pronouns"> | null) {
  // The prompts were written for the owner: leave them byte-for-byte as they are (keeps his prompt cache too).
  if (!ctx || (ctx.name.startsWith(OWNER_NAME) && ctx.pronouns === "he")) return text;
  const map = WORDS[ctx.pronouns];
  let out = text.replace(/\bAbhay\b/g, ctx.name);
  if (ctx.pronouns !== "he") out = out.replace(/\b(he|He|HE|his|His|HIS|him|Him|HIM|himself)\b/g, (w) => map[w] ?? w);
  // "they wants" → "they want" for the common verbs in the prompts.
  if (ctx.pronouns === "they") out = out.replace(/\b(they|They) (is|was|has|wants|needs|does|says|likes|asks|keeps|tends|feels|works|goes|gets|thinks|uses|seems|prefers|struggles|plans)\b/g, (_m, p: string, v: string) => `${p} ${({ is: "are", was: "were", has: "have", does: "do", goes: "go" } as Record<string, string>)[v] ?? v.replace(/s$/, "")}`);
  return out;
}

/**
 * Web requests: who's logged in, from the session cookie (registered by src/lib/owner.ts, so the
 * worker and brain never load web code). Async-local context set inside an awaited helper doesn't
 * flow back to the caller, so anything that needs "the current person" asks here.
 */
let resolver: (() => Promise<RequestContext | null>) | null = null;
export function setContextResolver(fn: () => Promise<RequestContext | null>) {
  resolver = fn;
}
export async function resolveContext(): Promise<RequestContext | null> {
  return currentContext() ?? (resolver ? await resolver().catch(() => null) : null);
}

/** BrainState keys that belong to one person ("body" → "body:<userId>"). */
export async function stateKey(key: string, userId?: string) {
  const uid = userId ?? (await resolveContext())?.userId;
  if (!uid) throw new Error(`"${key}" is per person, but no user is in context`);
  return `${key}:${uid}`;
}
