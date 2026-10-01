/**
 * liveimproved-brain: the always-on background AI (see src/lib/brain/loop.ts for what it does).
 * Runs as its own low-priority service next to the worker, with the same env (/etc/liveimproved.env)
 * plus BRAIN_DIR (default /var/lib/liveimproved/brain).
 */
import { Prisma } from "@/generated/prisma";
import prisma from "@/lib/prisma";
import { activeUsers, getOwner } from "@/lib/users";
import { CHAT_SYSTEM } from "@/lib/ai/companion";
import { SYSTEM_PROMPT as ROUTER_SYSTEM } from "@/lib/ai/router";
import { Brain } from "@/lib/brain/loop";
import { BRAIN_DIR, readActivity, readChangedAt } from "@/lib/brain/signals";
import { BrainStore, DEFAULT_CAPS } from "@/lib/brain/storage";
import { sendToUser } from "./telegram";
import path from "node:path";
import { contextFor, runAs, stateKey } from "@/lib/request-context";
import { brainWatchWorker } from "@/lib/health";

const caps = {
  soft: Number(process.env.BRAIN_SOFT_CAP_BYTES) || DEFAULT_CAPS.soft,
  hard: Number(process.env.BRAIN_HARD_CAP_BYTES) || DEFAULT_CAPS.hard,
};
const log = (msg: string) => console.log(`[brain] ${msg}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let stopping = false;

interface Person {
  user: { id: string; name: string | null; pronouns: string };
  store: BrainStore;
  brain: Brain;
}

/** Each person's brain lives in BRAIN_DIR/users/<id>; the signals stay shared in BRAIN_DIR/signals. */
function personFor(user: Person["user"]): Person {
  const store = new BrainStore(path.join(BRAIN_DIR, "users", user.id), caps);
  const brain = new Brain({
    store,
    userId: user.id,
    activity: () => readActivity(),
    changedAt: () => readChangedAt(undefined, user.id),
    send: (html) => sendToUser(user.id, html),
    // Router first in a chat turn, so warm it last (the most recent prefix is the safest in cache).
    warmPrompts: [CHAT_SYSTEM, ROUTER_SYSTEM],
    log: (m) => log(`${user.name ?? user.id}: ${m}`),
  });
  return { user, store, brain };
}

async function main() {
  const people = new Map<string, Person>();
  const refresh = async () => {
    for (const u of await activeUsers()) if (!people.has(u.id)) people.set(u.id, personFor(u));
  };
  await refresh();
  setInterval(() => refresh().catch(() => undefined), 10 * 60_000).unref();
  log(`running for ${people.size} ${people.size === 1 ? "person" : "people"} (dir ${BRAIN_DIR}, caps ${(caps.soft / 1024 ** 3).toFixed(2)}/${(caps.hard / 1024 ** 3).toFixed(2)} GB each)`);

  // Cancel background model calls the moment anyone starts chatting.
  setInterval(() => people.forEach((p) => p.brain.checkInterrupt()), 1000).unref();

  // Heartbeats: one per person for their Profile tab, one overall for the health check.
  const beat = async () => {
    const nights: (string | null)[] = [];
    for (const p of people.values()) {
      const m = p.store.manifest();
      const value = { at: new Date().toISOString(), bytes: m.total, files: m.files, cap: caps.hard, queue: p.brain.state.queue?.length ?? 0, lastNight: p.brain.state.night?.day ?? null };
      nights.push(value.lastNight);
      const key = await stateKey("brain", p.user.id);
      await prisma.brainState.upsert({ where: { key }, update: { value: value as Prisma.InputJsonValue }, create: { key, value: value as Prisma.InputJsonValue } }).catch(() => undefined);
    }
    const overall = { at: new Date().toISOString(), people: people.size, lastNight: nights.sort()[0] ?? null };
    await prisma.brainState.upsert({ where: { key: "brain" }, update: { value: overall }, create: { key: "brain", value: overall } }).catch(() => undefined);
  };
  await beat();
  setInterval(beat, 5 * 60_000).unref();

  // Watch the worker: if it dies, reminders and briefs stop — tell the owner on Telegram.
  setInterval(() => {
    brainWatchWorker()
      .then(async (msg) => (msg ? sendToUser((await getOwner()).id, msg) : undefined))
      .catch((error) => log(`watch worker failed: ${error instanceof Error ? error.message : error}`));
  }, 5 * 60_000).unref();

  // Take turns: one step for each person, as that person (their prompts, background priority).
  while (!stopping) {
    let busy = false;
    for (const p of people.values()) {
      if (stopping) break;
      try {
        const did = await runAs(contextFor(p.user, { priority: "background" }), () => p.brain.tick());
        if (did) busy = true;
        if (did && !/^(ingest|change-seen|fingerprint-same|sync .*)$/.test(did)) log(`${p.user.name ?? p.user.id}: ${did}`);
      } catch (error) {
        log(`${p.user.name ?? p.user.id}: tick failed: ${error instanceof Error ? error.stack ?? error.message : error}`);
        await sleep(30_000);
      }
    }
    await sleep(busy ? 200 : 5000);
  }
  people.forEach((p) => p.brain.save());
}

const stop = () => {
  stopping = true;
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
