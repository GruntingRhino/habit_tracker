"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { format, formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";
import { ArrowUp, Check, ChevronDown, Loader2, X } from "lucide-react";
import { AREA_META, SCORED_AREAS, type ScoredArea } from "@/lib/areas";
import { readRationale } from "@/lib/score-rationale";

export interface ScoreRow {
  date: string;
  physical: number;
  mental: number;
  financial: number;
  spiritual: number;
  overall: number;
  rationale: unknown;
  judgedBy: string | null;
  finalized?: boolean;
}

interface Live {
  pending: boolean;
  gradedAt: string | null;
  brainUp: boolean;
}

function dayLabel(date: string) {
  const d = new Date(date);
  if (isToday(d)) return "Today so far";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE, MMM d");
}

/** Today's row if there is one, else the latest graded day. */
function pick(rows: ScoreRow[]) {
  return rows.find((r) => isToday(new Date(r.date))) ?? rows.find((r) => r.judgedBy) ?? rows[0] ?? null;
}

/**
 * The four life-area scores /10. Re-graded by the background AI ~10 s after anything changes;
 * tap an area for why (facts from his day, never invented) and the one thing that would raise it.
 */
export default function ScoreBoard() {
  const [score, setScore] = useState<ScoreRow | null | undefined>(undefined);
  const [live, setLive] = useState<Live | null>(null);
  const [open, setOpen] = useState<ScoredArea | null>(null);
  const [localPending, setLocalPending] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/scores?live=1", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { scores: ScoreRow[]; live: Live };
      setScore(pick(data.scores));
      setLive(data.live);
      // The brain has picked the change up (or finished with it): stop the local spinner.
      setLocalPending((p) => (p && (data.live.pending || (data.live.gradedAt && new Date(data.live.gradedAt).getTime() > p)) ? null : p));
    } catch {
      setScore((s) => (s === undefined ? null : s));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const onChange = () => setLocalPending(Date.now());
    window.addEventListener("liveimproved:changed", onChange);
    return () => {
      clearTimeout(first);
      window.removeEventListener("liveimproved:changed", onChange);
    };
  }, [load]);

  // Something changed here, or the brain says a re-grade is queued: check back every few seconds.
  const updating = !!live?.pending || (localPending !== null && Date.now() - localPending < 90_000 && live?.brainUp !== false);
  useEffect(() => {
    if (!updating && !open) return;
    const id = setInterval(load, updating ? 3000 : 15000);
    return () => clearInterval(id);
  }, [updating, open, load]);

  // Keep "updated 2m ago" honest.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (score === undefined) return null;
  const rationale = readRationale(score?.rationale);
  const judged = !!score?.judgedBy;

  function toggle(a: ScoredArea) {
    setOpen((cur) => (cur === a ? null : a));
    void load();
  }

  const status = updating ? (
    <span className="inline-flex items-center gap-1">
      <Loader2 className="h-3 w-3 animate-spin" /> Updating…
    </span>
  ) : live?.gradedAt && score && isToday(new Date(score.date)) ? (
    `updated ${formatDistanceToNowStrict(new Date(live.gradedAt))} ago`
  ) : null;

  return (
    <div className="w-full max-w-md px-4 text-center">
      <p className="min-label mb-2 flex items-center justify-center gap-2">
        <span>{score ? dayLabel(score.date) : "Your scores"}</span>
        {status && <span className="font-normal normal-case tracking-normal" style={{ color: "var(--ink-500)" }}>· {status}</span>}
      </p>
      <div className="grid grid-cols-4 gap-2">
        {SCORED_AREAS.map((a) => {
          const r = rationale[a];
          const value = score && !r.noData ? Math.round(score[a]) : null;
          const active = open === a;
          return (
            <button
              key={a}
              type="button"
              onClick={() => toggle(a)}
              aria-expanded={active}
              aria-label={`${AREA_META[a].label} ${value ?? "no score"}: details`}
              className="group flex cursor-pointer flex-col items-center rounded-xl border px-1 pb-1 pt-1.5 transition-colors hover:bg-white/[.05]"
              style={{ borderColor: active ? AREA_META[a].color : "var(--stroke-2)", background: active ? "rgba(255,255,255,.05)" : undefined }}
            >
              <span className="text-2xl font-light tabular-nums leading-tight" style={{ color: value == null ? "var(--ink-500)" : "var(--ink-100)" }}>
                {value ?? "–"}
              </span>
              <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--ink-400)" }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: AREA_META[a].color }} />
                {AREA_META[a].label}
              </span>
              <ChevronDown className={`mt-0.5 h-3 w-3 transition-transform ${active ? "rotate-180" : ""}`} style={{ color: "var(--ink-500)" }} />
            </button>
          );
        })}
      </div>

      {!open && (
        <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed" style={{ color: "var(--ink-500)" }}>
          {!score ? "Scores update as you log things, and are final at 11:30pm." : judged ? "Tap an area for why and how to raise it." : "Live estimate. Tap an area for details."}
        </p>
      )}

      {open && score && (
        <div className="mt-2 rounded-xl border p-3 text-left text-[13px] leading-snug" style={{ borderColor: "var(--stroke-2)", background: "rgba(255,255,255,.03)" }}>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-medium" style={{ color: "var(--ink-100)" }}>
              {AREA_META[open].label} {rationale[open].noData ? "" : `· ${Math.round(score[open])}/10`}
            </span>
            <button type="button" onClick={() => setOpen(null)} aria-label="Close details" className="rounded p-0.5 hover:bg-white/[.06]" style={{ color: "var(--ink-500)" }}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {rationale[open].noData ? (
            <p style={{ color: "var(--ink-400)" }}>No data for this area yet today, so no score.</p>
          ) : rationale[open].why.length ? (
            <ul className="space-y-0.5">
              {rationale[open].why.map((w) => {
                const mark = w[0];
                const text = w.replace(/^[✓✗•]\s*/, "");
                return (
                  <li key={w} className="flex gap-1.5" style={{ color: "var(--ink-300)" }}>
                    {mark === "✗" ? (
                      <X className="mt-0.5 h-3 w-3 flex-shrink-0 text-rose-400" />
                    ) : mark === "✓" ? (
                      <Check className="mt-0.5 h-3 w-3 flex-shrink-0 text-emerald-400" />
                    ) : (
                      <span className="mt-[5px] h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: "var(--ink-500)", margin: "5px 3px 0" }} />
                    )}
                    <span>{text}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p style={{ color: "var(--ink-400)" }}>Scored before reasons were recorded.</p>
          )}
          {rationale[open].improve && (
            <p className="mt-2 flex gap-1.5 border-t pt-2" style={{ borderColor: "var(--stroke-1)", color: "var(--ink-200)" }}>
              <ArrowUp className="mt-0.5 h-3 w-3 flex-shrink-0" style={{ color: AREA_META[open].color }} />
              <span>{rationale[open].improve}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
