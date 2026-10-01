/**
 * The brain's loop. `tick()` runs every few seconds and does at most one unit of work, in priority
 * order. It yields to him: anything that needs the model waits until he's been quiet for a minute
 * (10 s for the live score), and an in-flight model call is cancelled the moment he starts chatting.
 *
 *   P0  live score re-grade   10 s after his last change, once per burst of changes
 *   --  ingest                every minute, DB → evidence files (no model)
 *   --  corrections / quiz    as they arrive (no model)
 *   P1  prompt-cache warmer   after background model work, and every 10 min
 *   P3  extract               one chunk of things he said → claims
 *   P4  scheduled jobs        stuck projects, goal pulse, tidy-up, nutrient gaps, streaks
 *   P5  night shift           after 00:30: stats, consolidate each category (with summary),
 *                             stale-data pass, size caps, snapshot
 */
import { currentContext, OWNER_NAME, runAs } from "@/lib/request-context";
import { stateKey } from "@/lib/request-context";
import prisma from "@/lib/prisma";
import { chat, LlmAborted } from "@/lib/ai/llm";
import { getStartOfDay } from "@/lib/utils";
import { CATEGORY_IDS, type CategoryId } from "./categories";
import { applyCorrections, consolidateCategory, seedImported, seedQuiz, type ImportedFact } from "./consolidate";
import { extractChunk, nextChunk, worthExtracting } from "./extract";
import { ingest, type IngestState } from "./ingest";
import { isQuietHour, saveNudges, scoreLinks, SCHEDULED, type NewNudge } from "./jobs";
import { enforceCaps, staleDataPass } from "./prune";
import type { QuizAnswers } from "./quiz";
import { buildFacts, gradeDay, readLiveState, writeLiveState } from "./scores";
import type { Activity } from "./signals";
import { computeStats } from "./stats";
import { dayKey, type BrainStore, type Evidence } from "./storage";

export const QUIZ_STATE_KEY = "quiz";
export const IMPORT_STATE_KEY = "imported";

export interface LoopState extends IngestState {
  changeSeen?: number;
  gradedChange?: number;
  fingerprint?: string;
  fingerprintDay?: string;
  lastFingerprintCheck?: number;
  lastWarm?: number;
  modelWorkSinceWarm?: boolean;
  lastIngest?: number;
  lastCorrections?: number;
  queue?: Evidence[];
  jobs?: Record<string, string>;
  night?: { day: string; step: number };
  quizAt?: string;
  importAt?: string;
  hashes?: Record<string, string>;
  summaries?: Record<string, string | null>;
  summaryHashes?: Record<string, string>;
  stats?: Partial<Record<CategoryId, string[]>>;
  dirty?: string[];
  cooldown?: Record<string, number>;
}

export interface BrainDeps {
  store: BrainStore;
  userId: string;
  activity: () => Activity;
  changedAt: () => number;
  now?: () => Date;
  send?: (html: string) => Promise<unknown>;
  /** Prompts to keep in Ollama's cache (byte-identical system prompts). */
  warmPrompts?: string[];
  useModel?: boolean;
  log?: (msg: string) => void;
  /** Milliseconds of quiet before background model work / before the live re-grade. */
  idleMs?: number;
  debounceMs?: number;
}

const MAX_QUEUE = 3000;
const INFLIGHT_STALE_MS = 10 * 60_000;

export class Brain {
  state: LoopState;
  private controller: AbortController | null = null;

  constructor(readonly deps: BrainDeps) {
    this.state = deps.store.readJson<LoopState>("state.json", {});
    // Re-sync every category that has a file, once per start: the app's copy heals after any mishap.
    const onDisk = CATEGORY_IDS.filter((c) => deps.store.readProfile(c) != null);
    this.state.dirty = [...new Set([...(this.state.dirty ?? []), ...onDisk])];
  }

  private now() {
    return this.deps.now?.() ?? new Date();
  }
  private log(msg: string) {
    this.deps.log?.(msg);
  }
  save() {
    this.deps.store.writeJson("state.json", this.state);
  }

  /** Is he using the model right now (or was he in the last `ms`)? */
  busy(ms: number) {
    const a = this.deps.activity();
    const t = this.now().getTime();
    if (a.inflight > 0 && t - a.last < INFLIGHT_STALE_MS) return true;
    return t - a.last < ms;
  }

  /** Called every second by the service while a model task runs: cancel it if he shows up. */
  checkInterrupt() {
    const a = this.deps.activity();
    if (this.controller && a.inflight > 0 && this.now().getTime() - a.last < INFLIGHT_STALE_MS) {
      this.controller.abort();
      this.log("yielding to chat");
    }
  }

  private cooling(name: string) {
    return (this.state.cooldown?.[name] ?? 0) > this.now().getTime();
  }

  private async withModel<T>(name: string, fn: (signal: AbortSignal) => Promise<T>): Promise<T | "aborted" | "failed"> {
    this.controller = new AbortController();
    try {
      const out = await fn(this.controller.signal);
      this.state.modelWorkSinceWarm = true;
      return out;
    } catch (error) {
      if (error instanceof LlmAborted) return "aborted";
      this.log(`${name} failed: ${error instanceof Error ? `${error.name}: ${error.message || "(no message)"} ${error.stack?.split("\n")[1]?.trim() ?? ""}` : String(error)}`);
      this.state.cooldown = { ...this.state.cooldown, [name]: this.now().getTime() + 5 * 60_000 };
      return "failed";
    } finally {
      this.controller = null;
    }
  }

  /** One unit of work. Returns what it did, or null if it waited. */
  async tick(): Promise<string | null> {
    // A brain always works for one person: when the caller didn't say so (tests), it's its own user.
    const did = currentContext() ? await this.step() : await runAs({ userId: this.deps.userId, name: OWNER_NAME, pronouns: "he", priority: "background" }, () => this.step());
    if (did) this.save();
    return did;
  }

  private async step(): Promise<string | null> {
    const now = this.now();
    const t = now.getTime();
    const s = this.state;
    const { store, userId } = this.deps;
    const useModel = this.deps.useModel !== false;
    const debounce = this.deps.debounceMs ?? 10_000;
    const idle = this.deps.idleMs ?? 60_000;

    // --- a change arrived: show "Updating…" right away, grade once he's been quiet for 10 s.
    const changedAt = this.deps.changedAt();
    if (changedAt > (s.changeSeen ?? 0)) {
      s.changeSeen = changedAt;
      const live = await readLiveState(this.deps.userId);
      if (!live.pending) await writeLiveState({ ...live, pending: true, since: new Date(changedAt).toISOString() }, this.deps.userId);
      return "change-seen";
    }

    // --- P0 live re-grade.
    const today = getStartOfDay(now);
    const checkDue = t - (s.lastFingerprintCheck ?? 0) > 2 * 60_000;
    const changed = (s.changeSeen ?? 0) > (s.gradedChange ?? 0);
    if ((changed && t - (s.changeSeen ?? 0) >= debounce) || checkDue) {
      if (!this.busy(debounce) && !this.cooling("regrade")) {
        s.lastFingerprintCheck = t;
        const facts = await buildFacts(userId, today);
        const same = facts.fingerprint === s.fingerprint && s.fingerprintDay === dayKey(now);
        const existing = await prisma.categoryScore.findUnique({ where: { userId_date: { userId, date: today } }, select: { finalized: true } });
        if (same || !facts.facts.length || existing?.finalized) {
          if (changed) {
            s.gradedChange = s.changeSeen;
            await writeLiveState({ pending: false, gradedAt: (await readLiveState(this.deps.userId)).gradedAt, fingerprint: s.fingerprint, day: dayKey(now) }, this.deps.userId);
            return "regrade-unchanged";
          }
          return checkDue ? "fingerprint-same" : null;
        }
        let r = await this.withModel("regrade", (signal) => gradeDay(userId, today, { facts, useModel, signal }));
        if (r === "aborted") return "regrade-yielded";
        // Never leave the scores stale: without the model, the fact-based grade still goes in.
        if (r === "failed") r = await gradeDay(userId, today, { facts, useModel: false }).catch(() => "failed" as const);
        s.fingerprint = facts.fingerprint;
        s.fingerprintDay = dayKey(now);
        s.gradedChange = s.changeSeen;
        await writeLiveState({ pending: false, gradedAt: new Date().toISOString(), fingerprint: facts.fingerprint, day: dayKey(now) }, this.deps.userId);
        this.log(`regraded ${dayKey(now)}${r !== "failed" && r.usedModel ? "" : " (rules)"}`);
        return "regrade";
      }
      if (changed) return null; // wait for quiet
    }

    // --- ingest (no model).
    if (t - (s.lastIngest ?? 0) >= 60_000) {
      s.lastIngest = t;
      const { added, paused } = await ingest(store, userId, s, now);
      if (paused) {
        this.log("store at hard cap: ingest paused, pruning");
        enforceCaps(store, { now, learnedThrough: this.learnedThrough() });
      }
      if (added.length) s.queue = [...(s.queue ?? []), ...added.filter(worthExtracting)].slice(-MAX_QUEUE);
      return "ingest";
    }

    // --- corrections and quiz answers (no model); rebuild the touched categories right away.
    if (t - (s.lastCorrections ?? 0) >= 60_000) {
      s.lastCorrections = t;
      const touched = await applyCorrections(store, userId, now);
      const quiz = await prisma.brainState.findUnique({ where: { key: await stateKey(QUIZ_STATE_KEY, this.deps.userId) } });
      if (quiz && quiz.updatedAt.toISOString() !== s.quizAt) {
        const value = quiz.value as { answers?: QuizAnswers };
        touched.push(...seedQuiz(store, value.answers ?? {}, quiz.updatedAt));
        s.quizAt = quiz.updatedAt.toISOString();
        this.log("quiz answers loaded");
      }
      const imported = await prisma.brainState.findUnique({ where: { key: await stateKey(IMPORT_STATE_KEY, this.deps.userId) } });
      if (imported && imported.updatedAt.toISOString() !== s.importAt) {
        const value = imported.value as { facts?: ImportedFact[] };
        touched.push(...seedImported(store, value.facts ?? [], imported.updatedAt));
        s.importAt = imported.updatedAt.toISOString();
        this.log(`imported ${value.facts?.length ?? 0} facts`);
      }
      s.dirty = [...new Set([...(s.dirty ?? []), ...touched])];
      if (touched.length) return "corrections";
    }
    if (s.dirty?.length) {
      const cat = s.dirty.shift() as CategoryId;
      await consolidateCategory(store, userId, cat, s.stats?.[cat] ?? [], s, { now, useModel: false });
      return `sync ${cat}`;
    }

    // Everything below uses the model (or is heavy): only when he's been away for a minute.
    if (this.busy(idle)) return null;

    // --- P3 extract.
    if (s.queue?.length && useModel && !this.cooling("extract")) {
      const chunk = nextChunk(s.queue);
      const r = await this.withModel("extract", (signal) => extractChunk(store, chunk, signal));
      if (r === "aborted") return "extract-yielded";
      s.queue = s.queue.slice(chunk.length);
      if (r !== "failed") {
        s.dirty = [...new Set([...(s.dirty ?? []), ...r.touched])];
        for (const o of r.outcomes) this.log(`learned ${o}`);
      }
      return "extract";
    }

    // --- P4 scheduled jobs.
    const h = now.getHours();
    for (const job of SCHEDULED) {
      if (h < job.from || h >= job.to || s.jobs?.[job.name] === dayKey(now) || this.cooling(job.name)) continue;
      s.jobs = { ...s.jobs, [job.name]: dayKey(now) };
      try {
        const nudges = await saveNudges(userId, await job.run(userId, now), now);
        await this.sendNudges(nudges, now);
        if (nudges.length) this.log(`${job.name}: ${nudges.length} nudge(s)`);
      } catch (error) {
        this.log(`${job.name} failed: ${error instanceof Error ? error.message : error}`);
      }
      return `job ${job.name}`;
    }

    // --- P5 night shift (from 00:30; catches up later if it was missed).
    const nightDue = s.night?.day !== dayKey(now) && (h > 0 || now.getMinutes() >= 30);
    if (nightDue) return this.nightStep(now, useModel);

    // --- P1 warm the prompt cache.
    if (useModel && (s.modelWorkSinceWarm || t - (s.lastWarm ?? 0) > 10 * 60_000) && this.deps.warmPrompts?.length) {
      const r = await this.withModel("warm", async (signal) => {
        for (const prompt of this.deps.warmPrompts!) {
          await chat({ messages: [{ role: "system", content: prompt }, { role: "user", content: "hi" }], maxTokens: 1, timeoutMs: 120_000, signal });
        }
      });
      if (r === "aborted") return "warm-yielded";
      s.lastWarm = t;
      s.modelWorkSinceWarm = false;
      return "warm";
    }
    return null;
  }

  /** The night shift, one step per tick so it can yield at any point. */
  private async nightStep(now: Date, useModel: boolean): Promise<string> {
    const s = this.state;
    const { store, userId } = this.deps;
    const day = dayKey(now);
    if (s.night?.day !== day) {
      if (!s.night || s.night.day !== `pending:${day}`) s.night = { day: `pending:${day}`, step: 0 };
    }
    const n = s.night!;
    if (n.step === 0) {
      s.stats = await computeStats(userId, now);
      const links = await scoreLinks(userId, now);
      if (links.length) s.stats["what-works"] = [...(s.stats["what-works"] ?? []), ...links];
      n.step = 1;
      return "night stats";
    }
    const catIndex = n.step - 1;
    if (catIndex < CATEGORY_IDS.length) {
      const cat = CATEGORY_IDS[catIndex];
      const r = await this.withModel("consolidate", (signal) => consolidateCategory(store, userId, cat, s.stats?.[cat] ?? [], s, { now, useModel, signal }));
      if (r === "aborted") return "consolidate-yielded";
      n.step++;
      return `night consolidate ${cat}`;
    }
    const stale = staleDataPass(store, now);
    const caps = enforceCaps(store, { now, learnedThrough: this.learnedThrough() });
    store.snapshot(day);
    s.night = { day, step: 0 };
    this.log(`night done: stale ${JSON.stringify(stale)}, size ${(caps.after / 1024 / 1024).toFixed(1)} MB${caps.actions.length ? `, pruned: ${caps.actions.slice(0, 5).join("; ")}` : ""}`);
    return "night done";
  }

  /** Evidence days fully learned from: everything before the oldest item still queued. */
  learnedThrough(): string | null {
    const oldest = this.state.queue?.[0];
    if (!oldest) return dayKey(this.now());
    const d = new Date(oldest.t);
    d.setDate(d.getDate() - 1);
    return dayKey(d);
  }

  private async sendNudges(nudges: (NewNudge & { id: string })[], now: Date) {
    if (!this.deps.send || isQuietHour(now)) return;
    for (const n of nudges.filter((x) => x.telegram)) {
      await this.deps.send(`💡 <b>${esc(n.title)}</b>${n.body ? `\n${esc(n.body)}` : ""}`).catch(() => undefined);
      await prisma.brainNudge.update({ where: { id: n.id }, data: { sentAt: new Date() } }).catch(() => undefined);
    }
  }
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
