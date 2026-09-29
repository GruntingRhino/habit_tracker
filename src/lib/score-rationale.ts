import { SCORED_AREAS, type ScoredArea } from "@/lib/areas";

/** Why an area scored what it did: fact lines written by code, never by the model. */
export interface AreaRationale {
  why: string[];
  improve: string | null;
  noData: boolean;
  /** Hash of the facts it was graded on (unchanged facts → the score is kept as is). */
  h?: string;
}

export type Rationale = Record<ScoredArea, AreaRationale>;

/** Reads both the current format ({v: 2, physical: {why, improve}}) and the old one ({physical: "reason"}). */
export function readRationale(raw: unknown): Rationale {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = {} as Rationale;
  for (const a of SCORED_AREAS) {
    const v = r[a];
    if (v && typeof v === "object") {
      const o = v as Partial<AreaRationale>;
      out[a] = { why: Array.isArray(o.why) ? o.why.map(String) : [], improve: typeof o.improve === "string" ? o.improve : null, noData: !!o.noData, h: o.h };
    } else {
      out[a] = { why: typeof v === "string" && v ? [v] : [], improve: null, noData: false };
    }
  }
  return out;
}
