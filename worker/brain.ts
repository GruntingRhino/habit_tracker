/**
 * liveimproved-brain: the always-on background AI (see src/lib/brain/loop.ts for what it does).
 * Runs as its own low-priority service next to the worker, with the same env (/etc/liveimproved.env)
 * plus BRAIN_DIR (default /var/lib/liveimproved/brain).
 */
import { Prisma } from "@/generated/prisma";
import prisma from "@/lib/prisma";
import { getOwner } from "@/lib/owner";
import { CHAT_SYSTEM } from "@/lib/ai/companion";
import { SYSTEM_PROMPT as ROUTER_SYSTEM } from "@/lib/ai/router";
import { Brain } from "@/lib/brain/loop";
import { BRAIN_DIR, readActivity, readChangedAt } from "@/lib/brain/signals";
import { BrainStore, DEFAULT_CAPS } from "@/lib/brain/storage";
import { sendToOwner } from "./telegram";

const caps = {
  soft: Number(process.env.BRAIN_SOFT_CAP_BYTES) || DEFAULT_CAPS.soft,
  hard: Number(process.env.BRAIN_HARD_CAP_BYTES) || DEFAULT_CAPS.hard,
};
const log = (msg: string) => console.log(`[brain] ${msg}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let stopping = false;

async function main() {
  const store = new BrainStore(BRAIN_DIR, caps);
  const owner = await getOwner();
  const brain = new Brain({
    store,
    userId: owner.id,
    activity: () => readActivity(),
    changedAt: () => readChangedAt(),
    send: (html) => sendToOwner(html),
    // Router first in a chat turn, so warm it last (the most recent prefix is the safest in cache).
    warmPrompts: [CHAT_SYSTEM, ROUTER_SYSTEM],
    log,
  });
  log(`running (dir ${BRAIN_DIR}, caps ${(caps.soft / 1024 ** 3).toFixed(2)}/${(caps.hard / 1024 ** 3).toFixed(2)} GB)`);

  // Cancel background model calls the moment he starts chatting.
  setInterval(() => brain.checkInterrupt(), 1000).unref();

  // Heartbeat for the app's Profile tab.
  const beat = async () => {
    const m = store.manifest();
    const value = { at: new Date().toISOString(), bytes: m.total, files: m.files, cap: caps.hard, queue: brain.state.queue?.length ?? 0, lastNight: brain.state.night?.day ?? null };
    await prisma.brainState
      .upsert({ where: { key: "brain" }, update: { value: value as Prisma.InputJsonValue }, create: { key: "brain", value: value as Prisma.InputJsonValue } })
      .catch(() => undefined);
  };
  await beat();
  setInterval(beat, 5 * 60_000).unref();

  while (!stopping) {
    let did: string | null = null;
    try {
      did = await brain.tick();
      if (did && !/^(ingest|change-seen|fingerprint-same|sync .*)$/.test(did)) log(did);
    } catch (error) {
      log(`tick failed: ${error instanceof Error ? error.stack ?? error.message : error}`);
      await sleep(30_000);
    }
    await sleep(did ? 200 : 5000);
  }
  brain.save();
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
