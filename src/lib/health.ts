/**
 * Is everything running? Three layers so something always notices:
 *   - the worker checks every 10 min: database, model, gate (local + public), brain heartbeat,
 *     last backup, disk space; alerts on Telegram when a problem lasts 2 checks, and again when fixed
 *   - the brain checks the worker's heartbeat (if the worker dies, the brain says so)
 *   - a daily Vercel cron checks both heartbeats from outside (if the whole server is down)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import prisma from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { isModelUp } from "@/lib/ai/llm";

export const HEALTH_KEY = "health";
export const JOBS_KEY = "jobs";

export interface JobRun {
  at: string;
  ok: boolean;
  error?: string;
}

/** The worker records every scheduled job run, so the health check can tell a job silently stopped. */
export async function recordJob(name: string, ok: boolean, error?: unknown) {
  try {
    const row = await prisma.brainState.findUnique({ where: { key: JOBS_KEY } });
    const runs = ((row?.value ?? {}) as unknown as Record<string, JobRun>) ?? {};
    runs[name] = { at: new Date().toISOString(), ok, ...(ok ? {} : { error: (error instanceof Error ? error.message : String(error)).slice(0, 200) }) };
    const value = runs as unknown as Prisma.InputJsonValue;
    await prisma.brainState.upsert({ where: { key: JOBS_KEY }, update: { value }, create: { key: JOBS_KEY, value } });
  } catch {
    // never let bookkeeping break a job
  }
}

export async function lastRun(name: string): Promise<JobRun | null> {
  const row = await prisma.brainState.findUnique({ where: { key: JOBS_KEY } }).catch(() => null);
  return ((row?.value ?? {}) as unknown as Record<string, JobRun>)[name] ?? null;
}

/** Jobs that must have succeeded within this many hours (once they've run at least once). */
const JOB_WINDOWS: [string, number, string][] = [
  ["judge", 26, "Last night's scores weren't finalized"],
  ["plan", 26, "Today's plan wasn't made"],
  ["morning", 26, "The morning brief wasn't sent"],
  ["evening", 26, "The evening check-in wasn't sent"],
  ["news", 26, "The nightly news update didn't run"],
  ["weekly", 8 * 24, "The Sunday review wasn't sent"],
];
export const WORKER_BEAT_KEY = "worker";

export interface Problem {
  since: string;
  seen: number;
  alerted: boolean;
  detail: string;
}

export interface HealthState {
  checkedAt?: string;
  problems: Record<string, Problem>;
}

const MIN = 60_000;

async function beatAge(key: string) {
  const row = await prisma.brainState.findUnique({ where: { key } });
  const at = (row?.value as { at?: string } | null)?.at;
  return at ? Date.now() - new Date(at).getTime() : Infinity;
}

/** Up if any of 3 tries answers (the public link drops the odd connection; one miss isn't an outage). */
async function reachable(url: string, token?: string) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(8000) });
      if (res.ok) return true;
    } catch {
      // try again
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

function newestBackupAgeH(dir = path.join(os.homedir(), "liveimproved-backups")) {
  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".dump")).map((f) => fs.statSync(path.join(dir, f)).mtimeMs);
    return files.length ? (Date.now() - Math.max(...files)) / 3_600_000 : null;
  } catch {
    return null;
  }
}

/** Run every server-side check. Returns problems by name (empty = all good). */
export async function runChecks(): Promise<Record<string, string>> {
  const problems: Record<string, string> = {};
  try {
    await prisma.$queryRaw`select 1`;
  } catch {
    problems.database = "Can't reach the database (Neon).";
    return problems; // the rest need it
  }
  if (!(await isModelUp())) problems.model = "The AI model isn't loaded / Ollama isn't answering.";
  const token = process.env.OLLAMA_AUTH_TOKEN;
  if (token && !(await reachable("http://127.0.0.1:11500/api/ps", token))) problems.gate = "The model gate (ollama-gate) isn't answering — web chat can't reach the model.";
  const pub = process.env.GATE_PUBLIC_URL;
  if (token && pub && !(await reachable(`${pub}/api/ps`, token))) problems.funnel = "The public model link (Tailscale Funnel) is down — web chat can't reach the model.";
  const brain = await beatAge("brain");
  if (brain > 15 * MIN) problems.brain = `The background brain hasn't checked in for ${brain === Infinity ? "ever" : `${Math.round(brain / MIN)} min`} — live scores and learning are paused.`;
  // Every scheduled job actually ran and worked.
  const runs = ((await prisma.brainState.findUnique({ where: { key: JOBS_KEY } }))?.value ?? {}) as unknown as Record<string, JobRun>;
  for (const [name, hours, label] of JOB_WINDOWS) {
    const r = runs[name];
    if (!r) continue;
    const age = (Date.now() - new Date(r.at).getTime()) / 3_600_000;
    if (!r.ok) problems[`job-${name}`] = `${label}: ${r.error ?? "failed"}.`;
    else if (age > hours) problems[`job-${name}`] = `${label} (last run ${Math.round(age)} h ago).`;
  }
  // Per person: "news:<user>", "live-scores:<user>".
  for (const row of await prisma.brainState.findMany({ where: { key: { startsWith: "news:" } } })) {
    const news = row.value as { at?: string; items?: unknown[] } | undefined;
    if (news?.at && (news.items?.length ?? 0) < 20) problems.news = `The news update only found ${news.items?.length ?? 0} stories.`;
  }
  // Google Calendar sync (when connected).
  const google = await prisma.googleAccount.findFirst({ select: { lastSyncAt: true, lastError: true } });
  if (google) {
    const age = google.lastSyncAt ? (Date.now() - google.lastSyncAt.getTime()) / MIN : Infinity;
    if (google.lastError) problems.google = `Google Calendar sync is failing: ${google.lastError.slice(0, 120)}`;
    else if (age > 20) problems.google = `Google Calendar hasn't synced for ${age === Infinity ? "ever" : `${Math.round(age)} min`}.`;
  }
  // Reminders that should have gone out.
  const stuck = await prisma.reminder.count({ where: { status: "pending", fireAt: { lt: new Date(Date.now() - 10 * MIN) } } });
  if (stuck) problems.reminders = `${stuck} reminder${stuck === 1 ? "" : "s"} past due but not sent.`;
  // Live scores waiting too long for a re-grade.
  for (const row of await prisma.brainState.findMany({ where: { key: { startsWith: "live-scores:" } } })) {
    const live = row.value as { pending?: boolean; since?: string } | undefined;
    if (live?.pending && live.since && Date.now() - new Date(live.since).getTime() > 20 * MIN) problems.scores = "Live scores have been waiting to update for 20+ minutes.";
  }
  // The brain's night shift ran (by 7am).
  const beat = (await prisma.brainState.findUnique({ where: { key: "brain" } }))?.value as { lastNight?: string | null } | undefined;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (beat && now.getHours() >= 7 && beat.lastNight !== today) problems.night = "The brain's nightly profile update didn't run.";
  const backup = newestBackupAgeH();
  if (backup != null && backup > 36) problems.backup = `Last database backup was ${Math.round(backup)} h ago.`;
  try {
    const st = fs.statfsSync("/");
    const freeGb = (st.bavail * st.bsize) / 1024 ** 3;
    if (freeGb < 3) problems.disk = `Only ${freeGb.toFixed(1)} GB of disk left on the server.`;
  } catch {
    // statfs unavailable: skip
  }
  return problems;
}

export async function readHealth(): Promise<HealthState> {
  const row = await prisma.brainState.findUnique({ where: { key: HEALTH_KEY } }).catch(() => null);
  return ((row?.value ?? { problems: {} }) as unknown) as HealthState;
}

/**
 * Fold a check into the saved state and decide what to tell him: a problem is announced once it
 * has shown up on 2 checks in a row (no alerts for blips), and a fix is announced if it was alerted.
 */
export function foldChecks(state: HealthState, found: Record<string, string>, now = new Date()) {
  const problems: Record<string, Problem> = {};
  const alerts: string[] = [];
  const fixed: string[] = [];
  for (const [name, detail] of Object.entries(found)) {
    const prev = state.problems[name];
    const p: Problem = { since: prev?.since ?? now.toISOString(), seen: (prev?.seen ?? 0) + 1, alerted: prev?.alerted ?? false, detail };
    if (!p.alerted && p.seen >= 2) {
      alerts.push(detail);
      p.alerted = true;
    }
    problems[name] = p;
  }
  for (const [name, prev] of Object.entries(state.problems)) if (!found[name] && prev.alerted) fixed.push(name);
  return { state: { checkedAt: now.toISOString(), problems }, alerts, fixed };
}

const LABEL: Record<string, string> = {
  news: "News",
  google: "Google Calendar",
  reminders: "Reminders",
  scores: "Live scores",
  night: "Nightly profile update",
  "job-judge": "Nightly scores",
  "job-plan": "Daily plan",
  "job-morning": "Morning brief",
  "job-evening": "Evening check-in",
  "job-news": "Nightly news",
  "job-weekly": "Sunday review", database: "Database", model: "AI model", gate: "Model gate", funnel: "Public model link", brain: "Background brain", backup: "Backups", disk: "Disk space", worker: "Telegram worker" };

export function alertText(alerts: string[], fixed: string[]) {
  const lines: string[] = [];
  if (alerts.length) lines.push("🔴 <b>LiveImproved problem</b>", ...alerts.map((a) => `• ${a}`));
  if (fixed.length) lines.push(`🟢 Fixed: ${fixed.map((f) => LABEL[f] ?? f).join(", ")}`);
  return lines.join("\n");
}

/** Worker: run the checks, save state + heartbeat, return a message to send (or null). */
export async function workerHealthCheck(now = new Date()) {
  const found = await runChecks();
  const prev = await readHealth();
  // The brain owns the "worker" problem; keep it as is.
  if (prev.problems.worker) found.worker = prev.problems.worker.detail;
  const { state, alerts, fixed } = foldChecks(prev, found, now);
  if (!found.database) {
    const put = (key: string, value: object) =>
      prisma.brainState.upsert({ where: { key }, update: { value: value as Prisma.InputJsonValue }, create: { key, value: value as Prisma.InputJsonValue } });
    await put(HEALTH_KEY, state);
    await put(WORKER_BEAT_KEY, { at: now.toISOString() });
  }
  return alerts.length || fixed.length ? alertText(alerts, fixed) : null;
}

/** Brain: is the worker alive? Returns a message when that changes. */
export async function brainWatchWorker(now = new Date()) {
  const age = await beatAge(WORKER_BEAT_KEY);
  const state = await readHealth();
  const down = age > 25 * MIN && age !== Infinity;
  const was = state.problems.worker;
  if (down && !was?.alerted) {
    state.problems.worker = { since: now.toISOString(), seen: 2, alerted: true, detail: `The Telegram worker hasn't checked in for ${Math.round(age / MIN)} min — reminders and briefs are paused.` };
    await prisma.brainState.upsert({ where: { key: HEALTH_KEY }, update: { value: state as unknown as Prisma.InputJsonValue }, create: { key: HEALTH_KEY, value: state as unknown as Prisma.InputJsonValue } });
    return alertText([state.problems.worker.detail], []);
  }
  if (!down && was) {
    delete state.problems.worker;
    await prisma.brainState.update({ where: { key: HEALTH_KEY }, data: { value: state as unknown as Prisma.InputJsonValue } });
    return was.alerted ? alertText([], ["worker"]) : null;
  }
  return null;
}

/** One line for the morning brief. */
export async function statusLine() {
  const state = await readHealth();
  const open = Object.entries(state.problems).filter(([, p]) => p.seen >= 2);
  return open.length ? `🔴 ${open.map(([n]) => LABEL[n] ?? n).join(", ")} ${open.length === 1 ? "has" : "have"} a problem — see the alert.` : "🟢 All systems OK";
}

/** Outside check (Vercel cron): are the server's heartbeats fresh? */
export async function outsideCheck() {
  const [brain, worker] = await Promise.all([beatAge("brain"), beatAge(WORKER_BEAT_KEY)]);
  const stale = (ms: number) => ms > 30 * MIN;
  const problems: string[] = [];
  if (stale(brain) && stale(worker)) problems.push(`The server (hermes-oracle) looks down: no check-ins from the brain or the worker for ${Math.round(Math.min(brain, worker) / MIN)} min. Chat, reminders and scores are paused.`);
  else if (stale(worker)) problems.push("The Telegram worker is down (no reminders or briefs).");
  else if (stale(brain)) problems.push("The background brain is down (no live scores).");
  return { problems, brainMin: Math.round(brain / MIN), workerMin: Math.round(worker / MIN) };
}
