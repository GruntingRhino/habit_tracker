/**
 * Tiny files the brain watches so background work never gets in his way:
 *
 *   signals/gate.json     {inflight, last}  written by deploy/ollama-gate.mjs (web chat via Vercel)
 *   signals/worker.json   {inflight, last}  written by the Telegram worker while it handles a message
 *   signals/changed.json  {at}              "his data changed" — from the gate's /brain/touch
 *                                           (Vercel calls it on every write) and from the worker
 */
import fs from "node:fs";
import path from "node:path";

export const BRAIN_DIR = process.env.BRAIN_DIR ?? "/var/lib/liveimproved/brain";
const dir = (root = BRAIN_DIR) => path.join(root, "signals");

function write(file: string, value: unknown, root?: string) {
  try {
    fs.mkdirSync(dir(root), { recursive: true });
    const full = path.join(dir(root), file);
    fs.writeFileSync(`${full}.tmp`, JSON.stringify(value));
    fs.renameSync(`${full}.tmp`, full);
  } catch {
    // The brain may not be installed (tests, dev): never let a signal break the app.
  }
}

function read<T>(file: string, root?: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir(root), file), "utf8")) as T;
  } catch {
    return null;
  }
}

export interface Activity {
  inflight: number;
  last: number;
}

/** Newest activity across all sources: is he using the model right now, and when did he last? */
export function readActivity(root?: string): Activity {
  const all = ["gate.json", "worker.json"].map((f) => read<Activity>(f, root)).filter(Boolean) as Activity[];
  return {
    inflight: all.reduce((s, a) => s + Math.max(0, a.inflight ?? 0), 0),
    last: Math.max(0, ...all.map((a) => a.last ?? 0)),
  };
}

export function readChangedAt(root?: string): number {
  return read<{ at: number }>("changed.json", root)?.at ?? 0;
}

export function touchChanged(root?: string) {
  write("changed.json", { at: Date.now() }, root);
}

let workerInflight = 0;
/** Wrap interactive work in the worker (a Telegram message) so the brain pauses meanwhile. */
export async function interactive<T>(fn: () => Promise<T>, root?: string): Promise<T> {
  workerInflight++;
  write("worker.json", { inflight: workerInflight, last: Date.now() }, root);
  try {
    return await fn();
  } finally {
    workerInflight--;
    write("worker.json", { inflight: workerInflight, last: Date.now() }, root);
    touchChanged(root);
  }
}
