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

async function reachable(url: string, token?: string) {
  try {
    const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(8000) });
    return res.ok;
  } catch {
    return false;
  }
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

const LABEL: Record<string, string> = { database: "Database", model: "AI model", gate: "Model gate", funnel: "Public model link", brain: "Background brain", backup: "Backups", disk: "Disk space", worker: "Telegram worker" };

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
