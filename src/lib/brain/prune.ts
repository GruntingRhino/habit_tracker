/**
 * Keeping the brain's files fresh and under the cap. Runs every night (and whenever ingest sees
 * the soft cap crossed).
 *
 * Stale data (daily, whatever the size): beliefs not reinforced in 60 days lose confidence;
 * weak ones unseen for 120 days are deleted; archived ones go after 90 days.
 *
 * Size (only above the soft cap), cheapest loss first: compress old evidence → delete evidence
 * older than 180 days that's already been learned from → old snapshots → archived beliefs →
 * oldest learned-from evidence → weakest inferred beliefs.
 */
import { differenceInCalendarDays } from "date-fns";
import { CATEGORY_IDS } from "./categories";
import { dayKey, type BrainStore, type Observation } from "./storage";

const DAY = 86_400_000;

/** Confidence after decay: full for 60 days since last seen, then -10% per 30 days. */
export function effectiveConfidence(o: Pick<Observation, "confidence" | "lastSeen">, now: Date) {
  const idle = (now.getTime() - new Date(o.lastSeen).getTime()) / DAY;
  if (idle <= 60) return o.confidence;
  return o.confidence * Math.pow(0.9, (idle - 60) / 30);
}

export function staleDataPass(store: BrainStore, now = new Date()) {
  const result = { decayedBelow: 0, deleted: 0, archivedDropped: 0 };
  for (const cat of CATEGORY_IDS) {
    const list = store.readObservations(cat);
    const keep: Observation[] = [];
    for (const o of list) {
      const idle = (now.getTime() - new Date(o.lastSeen).getTime()) / DAY;
      const conf = effectiveConfidence(o, now);
      if (o.status === "active" && idle > 120 && conf < 0.3) {
        result.deleted++;
        continue;
      }
      // Rejected ones stay as tombstones for 90 days so old evidence can't bring them back.
      if (o.status !== "active" && idle > 90) {
        result.archivedDropped++;
        continue;
      }
      if (o.status === "active" && idle > 60) result.decayedBelow++;
      keep.push(o);
    }
    if (keep.length !== list.length) store.writeObservations(cat, keep);
  }
  return result;
}

export interface CapResult {
  before: number;
  after: number;
  actions: string[];
  overHard: boolean;
}

/**
 * Bring the store under its soft cap. `learnedThrough` is the last evidence day extraction has
 * fully processed; evidence after it is never deleted (it hasn't been learned from yet) unless
 * the hard cap forces it.
 */
export function enforceCaps(store: BrainStore, opts: { now?: Date; learnedThrough: string | null }): CapResult {
  const now = opts.now ?? new Date();
  const today = dayKey(now);
  const actions: string[] = [];
  const size = () => store.manifest().total;
  const before = size();
  const age = (day: string) => differenceInCalendarDays(now, new Date(`${day}T12:00:00`));
  const learned = (day: string) => opts.learnedThrough != null && day <= opts.learnedThrough;

  // Housekeeping at any size: compress evidence older than 30 days (lossless).
  for (const day of store.evidenceDays()) {
    if (age(day) > 30) {
      const had = store.readEvidence(day).length;
      store.gzipDay(day);
      if (had) actions.push(`gzip ${day}`);
    }
  }

  const over = () => size() > store.caps.soft;
  if (over()) {
    for (const day of store.evidenceDays()) {
      if (!over()) break;
      if (age(day) > 180 && learned(day)) {
        store.deleteDay(day);
        actions.push(`delete evidence ${day} (>180d)`);
      }
    }
  }
  if (over()) {
    for (const day of store.snapshotDays()) {
      if (!over()) break;
      if (age(day) > 30) {
        store.deleteSnapshot(day);
        actions.push(`delete snapshot ${day}`);
      }
    }
  }
  if (over()) {
    for (const cat of CATEGORY_IDS) {
      const list = store.readObservations(cat);
      const keep = list.filter((o) => o.status === "active" || o.status === "rejected");
      if (keep.length !== list.length) {
        store.writeObservations(cat, keep);
        actions.push(`drop archived ${cat}`);
      }
    }
  }
  if (over()) {
    for (const day of store.evidenceDays()) {
      if (!over()) break;
      if (learned(day) && day !== today) {
        store.deleteDay(day);
        actions.push(`delete evidence ${day} (oldest learned)`);
      }
    }
  }
  if (over()) {
    // Last resort: weakest inferred beliefs (never quiz answers or things he said outright).
    const all = CATEGORY_IDS.flatMap((cat) => store.readObservations(cat).map((o) => ({ cat, o })));
    const weakest = all
      .filter(({ o }) => o.source === "inferred")
      .sort((a, b) => effectiveConfidence(a.o, now) - effectiveConfidence(b.o, now));
    const drop = new Set<string>();
    for (const { o } of weakest) {
      if (!over()) break;
      drop.add(o.id);
      const cat = o.category;
      store.writeObservations(cat, store.readObservations(cat).filter((x) => !drop.has(x.id)));
    }
    if (drop.size) actions.push(`drop ${drop.size} weakest beliefs`);
  }
  // Still over the hard cap (only possible if unlearned evidence alone is that big): drop the oldest.
  while (size() > store.caps.hard) {
    const day = store.evidenceDays().find((d) => d !== today);
    if (!day) break;
    store.deleteDay(day);
    actions.push(`delete evidence ${day} (hard cap)`);
  }

  const after = size();
  const m = store.manifest();
  store.saveManifest({ ...m, lastPrune: now.toISOString(), pruned: [...actions.slice(-50)] });
  return { before, after, actions, overHard: after > store.caps.hard };
}
