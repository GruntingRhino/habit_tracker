"use client";

import { useEffect, useState } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { AREA_META, SCORED_AREAS, type ScoredArea } from "@/lib/areas";

export interface ScoreRow {
  date: string;
  physical: number;
  mental: number;
  financial: number;
  spiritual: number;
  overall: number;
  rationale: Record<string, string> | null;
  judgedBy: string | null;
}

function dayLabel(date: string) {
  const d = new Date(date);
  if (isToday(d)) return "Today so far";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE, MMM d");
}

/** The four life-area scores /10, as judged by Spark each night. */
export default function ScoreBoard() {
  const [score, setScore] = useState<ScoreRow | null | undefined>(undefined);
  const [open, setOpen] = useState<ScoredArea | null>(null);

  useEffect(() => {
    fetch("/api/scores")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ScoreRow[]) => setScore(rows.find((r) => r.judgedBy) ?? rows[0] ?? null))
      .catch(() => setScore(null));
  }, []);

  if (score === undefined) return null;

  return (
    <div className="w-full max-w-md select-none text-center">
      <p className="min-label mb-2">{score ? dayLabel(score.date) : "Your scores"}</p>
      <div className="flex justify-center gap-6">
        {SCORED_AREAS.map((a) => {
          const value = score ? Math.round(score[a]) : null;
          return (
            <button key={a} onClick={() => setOpen(open === a ? null : a)} className="flex flex-col items-center" aria-label={`${AREA_META[a].label} ${value ?? "no score"}`}>
              <span className="text-2xl font-light tabular-nums" style={{ color: open === a ? "var(--ink-100)" : "var(--ink-200)" }}>
                {value ?? "–"}
              </span>
              <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--ink-500)" }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: AREA_META[a].color }} />
                {AREA_META[a].label}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed" style={{ color: "var(--ink-500)" }}>
        {!score
          ? "Scored every night at 11:30."
          : open && score.rationale?.[open]
            ? score.rationale[open]
            : score.judgedBy
              ? "Tap a score to see why."
              : "Live estimate; judged tonight at 11:30."}
      </p>
    </div>
  );
}
