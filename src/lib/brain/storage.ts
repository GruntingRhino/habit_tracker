/**
 * The brain's files on the server's disk (BRAIN_DIR, default /var/lib/liveimproved/brain):
 *
 *   evidence/YYYY/MM/DD.jsonl[.gz]   raw daily events (what he did and said)
 *   observations/<category>.jsonl    claims learned from evidence, with evidence ids + confidence
 *   profile/<category>.md            the distilled file on him (also synced to ProfileDoc)
 *   snapshots/YYYY-MM-DD/            daily copies of profile/
 *   quiz/answers.json                personality quiz answers
 *   state.json                       progress markers (survives restarts)
 *   manifest.json                    sizes per area, last prune
 *
 * Everything is capped: a soft cap starts pruning, the hard cap is never crossed.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createHash } from "node:crypto";
import type { CategoryId } from "./categories";

export const GB = 1024 ** 3;
export const DEFAULT_CAPS = { soft: 1.35 * GB, hard: 1.5 * GB };

export interface Evidence {
  id: string;
  /** ISO time of the event. */
  t: string;
  kind: string;
  text: string;
  /** "said" = his own words, "data" = something he logged/did, "quiz" = a quiz answer. */
  src: "said" | "data" | "quiz" | "import";
}

export interface Observation {
  id: string;
  category: CategoryId;
  claim: string;
  source: "quiz" | "said" | "inferred" | "imported";
  evidence: string[];
  /** Copies of a few evidence lines, so a belief can still show why after old evidence is pruned. */
  snippets: { t: string; text: string }[];
  firstSeen: string;
  lastSeen: string;
  count: number;
  confidence: number;
  status: "active" | "archived" | "rejected";
  /** Quiz question id / imported fact id, so a retake or re-import replaces the old one. */
  key?: string;
}

export interface Manifest {
  total: number;
  areas: Record<string, number>;
  files: number;
  lastPrune: string | null;
  pruned: string[];
  caps: { soft: number; hard: number };
}

export function shortHash(s: string, n = 8) {
  return createHash("sha1").update(s).digest("hex").slice(0, n);
}

const pad = (n: number) => String(n).padStart(2, "0");
export function dayKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export class BrainStore {
  constructor(
    readonly root: string,
    readonly caps = DEFAULT_CAPS
  ) {
    for (const dir of ["evidence", "observations", "profile", "snapshots", "quiz"]) fs.mkdirSync(path.join(root, dir), { recursive: true });
  }

  p(...parts: string[]) {
    return path.join(this.root, ...parts);
  }

  // ---- state -------------------------------------------------------------------------------

  readJson<T>(rel: string, fallback: T): T {
    try {
      return JSON.parse(fs.readFileSync(this.p(rel), "utf8")) as T;
    } catch {
      return fallback;
    }
  }

  /** Atomic write (tmp + rename) so a crash never leaves half a file. */
  writeFile(rel: string, data: string | Buffer) {
    const file = this.p(rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
  }

  writeJson(rel: string, value: unknown) {
    this.writeFile(rel, JSON.stringify(value, null, 1));
  }

  // ---- evidence ----------------------------------------------------------------------------

  evidencePath(day: string, gz = false) {
    const [y, m, d] = day.split("-");
    return path.join("evidence", y, m, `${d}.jsonl${gz ? ".gz" : ""}`);
  }

  /** Append events to their day's file, skipping ids already there. Returns what was added. */
  appendEvidence(events: Evidence[]): Evidence[] {
    const byDay = new Map<string, Evidence[]>();
    for (const e of events) {
      const day = dayKey(new Date(e.t));
      byDay.set(day, [...(byDay.get(day) ?? []), e]);
    }
    const added: Evidence[] = [];
    for (const [day, list] of byDay) {
      if (fs.existsSync(this.p(this.evidencePath(day, true)))) this.gunzipDay(day);
      const seen = new Set(this.readEvidence(day).map((e) => e.id));
      const fresh = list.filter((e) => !seen.has(e.id) && (seen.add(e.id), true));
      if (!fresh.length) continue;
      const file = this.p(this.evidencePath(day));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, fresh.map((e) => JSON.stringify(e)).join("\n") + "\n");
      added.push(...fresh);
    }
    return added;
  }

  readEvidence(day: string): Evidence[] {
    let raw = "";
    const plain = this.p(this.evidencePath(day));
    const gz = this.p(this.evidencePath(day, true));
    if (fs.existsSync(plain)) raw = fs.readFileSync(plain, "utf8");
    else if (fs.existsSync(gz)) raw = zlib.gunzipSync(fs.readFileSync(gz)).toString("utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .flatMap((l) => {
        try {
          return [JSON.parse(l) as Evidence];
        } catch {
          return [];
        }
      });
  }

  /** All days with evidence, oldest first. */
  evidenceDays(): string[] {
    const out: string[] = [];
    const base = this.p("evidence");
    for (const y of safeList(base))
      for (const m of safeList(path.join(base, y)))
        for (const f of safeList(path.join(base, y, m))) {
          const d = f.match(/^(\d\d)\.jsonl(\.gz)?$/);
          if (d) out.push(`${y}-${m}-${d[1]}`);
        }
    return [...new Set(out)].sort();
  }

  gzipDay(day: string) {
    const plain = this.p(this.evidencePath(day));
    if (!fs.existsSync(plain)) return;
    this.writeFile(this.evidencePath(day, true), zlib.gzipSync(fs.readFileSync(plain)));
    fs.unlinkSync(plain);
  }

  private gunzipDay(day: string) {
    const gz = this.p(this.evidencePath(day, true));
    this.writeFile(this.evidencePath(day), zlib.gunzipSync(fs.readFileSync(gz)));
    fs.unlinkSync(gz);
  }

  deleteDay(day: string) {
    for (const gz of [false, true]) fs.rmSync(this.p(this.evidencePath(day, gz)), { force: true });
  }

  // ---- observations ------------------------------------------------------------------------

  readObservations(category: string): Observation[] {
    const file = this.p("observations", `${category}.jsonl`);
    if (!fs.existsSync(file)) return [];
    return fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .flatMap((l) => {
        try {
          return [JSON.parse(l) as Observation];
        } catch {
          return [];
        }
      });
  }

  writeObservations(category: string, list: Observation[]) {
    this.writeFile(path.join("observations", `${category}.jsonl`), list.map((o) => JSON.stringify(o)).join("\n") + (list.length ? "\n" : ""));
  }

  // ---- profile + snapshots -----------------------------------------------------------------

  writeProfile(category: string, markdown: string) {
    this.writeFile(path.join("profile", `${category}.md`), markdown);
  }

  readProfile(category: string): string | null {
    try {
      return fs.readFileSync(this.p("profile", `${category}.md`), "utf8");
    } catch {
      return null;
    }
  }

  snapshot(day: string) {
    const dest = this.p("snapshots", day);
    fs.mkdirSync(dest, { recursive: true });
    for (const f of safeList(this.p("profile"))) fs.copyFileSync(this.p("profile", f), path.join(dest, f));
  }

  snapshotDays(): string[] {
    return safeList(this.p("snapshots")).filter((d) => /^\d{4}-\d\d-\d\d$/.test(d)).sort();
  }

  deleteSnapshot(day: string) {
    fs.rmSync(this.p("snapshots", day), { recursive: true, force: true });
  }

  // ---- size --------------------------------------------------------------------------------

  manifest(): Manifest {
    const areas: Record<string, number> = {};
    let files = 0;
    const walk = (dir: string, area: string) => {
      for (const ent of safeEntries(dir)) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(full, area);
        else {
          areas[area] = (areas[area] ?? 0) + fs.statSync(full).size;
          files++;
        }
      }
    };
    for (const ent of safeEntries(this.root)) {
      if (ent.isDirectory()) walk(this.p(ent.name), ent.name);
      else if (ent.name !== "manifest.json") {
        areas.meta = (areas.meta ?? 0) + fs.statSync(this.p(ent.name)).size;
        files++;
      }
    }
    const prev = this.readJson<Partial<Manifest>>("manifest.json", {});
    return {
      total: Object.values(areas).reduce((a, b) => a + b, 0),
      areas,
      files,
      lastPrune: prev.lastPrune ?? null,
      pruned: prev.pruned ?? [],
      caps: this.caps,
    };
  }

  saveManifest(m: Manifest) {
    this.writeJson("manifest.json", m);
  }
}

function safeList(dir: string) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function safeEntries(dir: string) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}
