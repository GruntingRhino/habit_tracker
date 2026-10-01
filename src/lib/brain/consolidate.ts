/**
 * Consolidate: observations + computed stats → the distilled file on him (profile/<category>.md)
 * and the ProfileDoc row the app reads. Beliefs are ranked by confidence; the only model output is
 * an optional one-line summary, and it's dropped unless its words come from the beliefs it summarises.
 */
import prisma from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { chat } from "@/lib/ai/llm";
import { CATEGORIES, categoryLabel, isCategory, type Belief, type CategoryId, type Level, type ProfileContent } from "./categories";
import { grounding, mergeClaim } from "./extract";
import { effectiveConfidence } from "./prune";
import { QUIZ, quizClaim, type QuizAnswers } from "./quiz";
import { ev } from "./ingest";
import { currentAge, fmtHeight, fmtLb, readBody } from "@/lib/body";
import { shortHash, type BrainStore, type Observation } from "./storage";

export const MAX_PROFILE_BYTES = 6 * 1024;
const MAX_BELIEFS = 20;

export function level(conf: number): Level {
  return conf >= 0.7 ? "high" : conf >= 0.45 ? "medium" : "low";
}

export function buildContent(observations: Observation[], stats: string[], now = new Date(), summary: string | null = null): ProfileContent {
  const beliefs: Belief[] = observations
    .filter((o) => o.status === "active")
    .map((o) => ({ o, conf: effectiveConfidence(o, now) }))
    .filter(({ conf }) => conf >= 0.25)
    .sort((a, b) => b.conf - a.conf || b.o.count - a.o.count || b.o.lastSeen.localeCompare(a.o.lastSeen))
    .slice(0, MAX_BELIEFS)
    .map(({ o, conf }) => ({
      id: o.id,
      text: o.claim,
      level: level(conf),
      source: o.source,
      count: o.count,
      lastSeen: o.lastSeen,
      evidence: o.snippets.slice(-3),
    }));
  const content: ProfileContent = { summary, beliefs, stats };
  // Hard size limit: drop the weakest beliefs until the rendered file fits.
  while (renderMarkdown("x", content).length > MAX_PROFILE_BYTES && content.beliefs.length) content.beliefs.pop();
  return content;
}

export function renderMarkdown(category: string, c: ProfileContent) {
  const lines = [`# ${categoryLabel(category)}`, ""];
  if (c.summary) lines.push(c.summary, "");
  if (c.stats.length) lines.push("## From your data", ...c.stats.map((s) => `- ${s}`), "");
  if (c.beliefs.length) {
    lines.push("## What I've learned");
    for (const b of c.beliefs) lines.push(`- ${b.text} _(${b.level}, ${b.source}${b.count > 1 ? `, seen ${b.count}×` : ""})_`);
    lines.push("");
  }
  return lines.join("\n");
}

// Byte-stable for the prompt cache.
const SUMMARY_SYSTEM = `Summarise what is known about Abhay in ONE short sentence (max 25 words), second person ("You …"), using ONLY the facts given. No advice, nothing new. Reply with the sentence only.`;

/** One-line summary, or null if the model strays from the facts. */
export async function summarise(content: ProfileContent, signal?: AbortSignal): Promise<string | null> {
  const facts = [...content.stats, ...content.beliefs.filter((b) => b.level !== "low").map((b) => b.text)].slice(0, 10);
  if (facts.length < 2) return null;
  const result = await chat({
    messages: [
      { role: "system", content: SUMMARY_SYSTEM },
      { role: "user", content: facts.map((f) => `- ${f}`).join("\n") },
    ],
    temperature: 0.2,
    maxTokens: 60,
    timeoutMs: 90_000,
    signal,
  });
  const s = result.content.replace(/\s+/g, " ").trim().replace(/^["']|["']$/g, "");
  if (s.length < 15 || s.length > 220) return null;
  const g = grounding(s.replace(/\byou(r)?\b/gi, ""), facts.join(" "));
  return g.score >= 0.75 ? s : null;
}

export function contentHash(observations: Observation[], stats: string[]) {
  return shortHash(JSON.stringify([observations.filter((o) => o.status === "active").map((o) => [o.id, o.count, o.lastSeen, o.status]), stats]), 12);
}

export async function syncDoc(userId: string, category: CategoryId, content: ProfileContent) {
  await prisma.profileDoc.upsert({
    where: { userId_category: { userId, category } },
    update: { content: content as unknown as Prisma.InputJsonValue },
    create: { userId, category, content: content as unknown as Prisma.InputJsonValue },
  });
}

/** His "that's wrong" taps: reject the observation in the files so it isn't re-learned from old evidence. */
export async function applyCorrections(store: BrainStore, userId: string, now = new Date()) {
  const pending = await prisma.profileCorrection.findMany({ where: { userId, appliedAt: null }, orderBy: { createdAt: "asc" } });
  const touched = new Set<CategoryId>();
  for (const c of pending) {
    const cat = c.category as CategoryId;
    const list = store.readObservations(cat);
    const hit = list.find((o) => o.id === c.beliefId) ?? list.find((o) => o.claim === c.text);
    if (hit) {
      hit.status = "rejected";
      hit.lastSeen = now.toISOString();
      store.writeObservations(cat, list);
      touched.add(cat);
    }
    await prisma.profileCorrection.update({ where: { id: c.id }, data: { appliedAt: now } });
  }
  return [...touched];
}

/** Turn quiz answers into evidence + beliefs. A retaken question archives its old answer. */
export function seedQuiz(store: BrainStore, answers: QuizAnswers, at = new Date()) {
  const touched = new Set<CategoryId>();
  const evidence = [];
  for (const q of QUIZ) {
    const a = answers[q.id];
    if (a == null) continue;
    const claim = quizClaim(q, a);
    if (!claim) continue;
    const e = ev(`quiz:${q.id}:${shortHash(JSON.stringify(a))}`, at, "quiz", `Quiz — ${q.question} He answered: ${Array.isArray(a) ? a.join(", ") : a}`, "quiz");
    evidence.push(e);
    const list = store.readObservations(q.category);
    for (const o of list) if (o.key === q.id && o.status === "active" && o.claim !== claim) o.status = "archived";
    if (!list.some((o) => o.key === q.id && o.status === "active" && o.claim === claim)) {
      mergeClaim(list, { category: q.category, claim, source: "quiz", evidence: e, key: q.id });
    }
    store.writeObservations(q.category, list);
    touched.add(q.category);
  }
  store.appendEvidence(evidence);
  store.writeJson("quiz/answers.json", { answers, at: at.toISOString() });
  return [...touched];
}

export interface ImportedFact {
  id: string;
  category: string;
  text: string;
}

/**
 * Facts handed over in bulk (e.g. from his other AI agent). Like quiz answers they become beliefs
 * directly, without the model; a re-import replaces changed facts and drops ones no longer sent.
 */
export function seedImported(store: BrainStore, facts: ImportedFact[], at = new Date()) {
  const touched = new Set<CategoryId>();
  const sent = new Set(facts.filter((f) => isCategory(f.category)).map((f) => `import:${f.id}`));
  for (const cat of CATEGORIES.map((c) => c.id)) {
    const list = store.readObservations(cat);
    let changed = false;
    for (const o of list) {
      if (o.source === "imported" && o.status === "active" && o.key && !sent.has(o.key)) {
        o.status = "archived";
        changed = true;
      }
    }
    if (changed) {
      store.writeObservations(cat, list);
      touched.add(cat);
    }
  }
  const evidence = [];
  for (const f of facts) {
    if (!isCategory(f.category)) continue;
    const text = f.text.replace(/\s+/g, " ").trim().slice(0, 200);
    if (!text) continue;
    const key = `import:${f.id}`;
    const e = ev(`${key}:${shortHash(text)}`, at, "import", `Imported: ${text}`, "import");
    evidence.push(e);
    const list = store.readObservations(f.category);
    for (const o of list) if (o.key === key && o.status === "active" && o.claim !== text) o.status = "archived";
    if (!list.some((o) => o.key === key && o.status === "active")) {
      list.push({
        id: `o-${shortHash(`${key}:${text}`)}`,
        category: f.category,
        claim: text,
        source: "imported",
        evidence: [e.id],
        snippets: [{ t: e.t, text: e.text }],
        firstSeen: e.t,
        lastSeen: e.t,
        count: 1,
        confidence: 0.8,
        status: "active",
        key,
      });
    }
    store.writeObservations(f.category, list);
    touched.add(f.category);
  }
  store.appendEvidence(evidence);
  return [...touched];
}

/** Rebuild one category's file and DB row. Only calls the model when its inputs changed since the last summary. */
export async function consolidateCategory(
  store: BrainStore,
  userId: string,
  category: CategoryId,
  stats: string[],
  state: { hashes?: Record<string, string>; summaries?: Record<string, string | null>; summaryHashes?: Record<string, string> },
  opts: { now?: Date; useModel?: boolean; signal?: AbortSignal } = {}
) {
  const now = opts.now ?? new Date();
  const observations = store.readObservations(category);
  const hash = contentHash(observations, stats);
  state.hashes ??= {};
  state.summaries ??= {};
  state.summaryHashes ??= {};
  // Daytime syncs skip the model; the night shift writes a summary for anything that changed since.
  const needsSummary = !!opts.useModel && state.summaryHashes[category] !== hash;
  const changed = state.hashes[category] !== hash || needsSummary;
  const content = buildContent(observations, stats, now, state.summaries[category] ?? null);
  if (needsSummary) {
    content.summary = await summarise(content, opts.signal).catch((e) => {
      if (opts.signal?.aborted) throw e;
      return null;
    });
    state.summaries[category] = content.summary;
    state.summaryHashes[category] = hash;
  }
  // Always rewrite and sync (cheap; this only runs for dirty categories and at night), so the
  // app's copy heals if it was ever lost or edited.
  store.writeProfile(category, renderMarkdown(category, content));
  await syncDoc(userId, category, content);
  state.hashes[category] = hash;
  return { changed, content };
}

/** "Now 134 lb, 6'0", 15, lean bulk; daily targets 2,850 kcal, 107 g protein…" */
async function bodySummary(userId: string) {
  const [body, owner] = await Promise.all([readBody(userId), prisma.user.findUnique({ where: { id: userId }, select: { nutritionTargets: true } })]);
  if (!body.weightLb) return null;
  const t = owner?.nutritionTargets as { calories?: number; protein?: number; carbs?: number; fat?: number } | null;
  const age = currentAge(body);
  return `Now ${fmtLb(body.weightLb)}${body.heightIn ? `, ${fmtHeight(body.heightIn)}` : ""}${age ? `, age ${age}` : ""}${body.goal ? `, ${body.goal === "bulk" ? "lean bulk" : body.goal}` : ""}${t?.calories ? `; daily targets ${t.calories} kcal, ${t.protein} g protein, ${t.carbs} g carbs, ${t.fat} g fat` : ""}. Use imperial units (lb, ft/in, oz, fl oz, miles) but Celsius for temperature.`;
}

/** "About Abhay" for the chat: the strongest beliefs, under ~600 characters. */
export async function profileBrief(userId: string, maxChars = 600): Promise<string | null> {
  const [docs, bodyLine] = await Promise.all([prisma.profileDoc.findMany({ where: { userId }, select: { category: true, content: true } }), bodySummary(userId)]);
  if (!docs.length && !bodyLine) return null;
  const order = new Map(CATEGORIES.map((c, i) => [c.id as string, i]));
  const beliefs = docs
    .flatMap((d) => ((d.content as unknown as ProfileContent).beliefs ?? []).map((b) => ({ ...b, cat: d.category })))
    .filter((b) => b.level === "high" || (b.level === "medium" && b.source !== "inferred"))
    .sort((a, b) => (a.level === b.level ? (order.get(a.cat) ?? 99) - (order.get(b.cat) ?? 99) : a.level === "high" ? -1 : 1));
  const lines: string[] = bodyLine ? [`- ${bodyLine}`] : [];
  let used = bodyLine?.length ?? 0;
  for (const b of beliefs) {
    const line = `- ${b.text}`;
    if (used + line.length > maxChars || lines.length >= 12) break;
    lines.push(line);
    used += line.length;
  }
  return lines.length ? lines.join("\n") : null;
}
