"use client";

import { useState } from "react";
import {
  Activity,
  Brain,
  RefreshCw,
  DollarSign,
  Star,
  Sparkles,
  AlertTriangle,
  X,
  Loader2,
  PlusCircle,
  ArrowUp,
  Lightbulb,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { type LucideIcon } from "lucide-react";

export interface ScoreData {
  key: string;
  title: string;
  score: number;
  prevScore?: number;
}

interface InsightProblem {
  text: string;
}

interface InsightAction {
  type: "add_habit" | "adjust_habit" | "advice";
  text: string;
  habitName?: string;
  habitCategory?: string;
  habitId?: string;
  priority?: "low" | "medium" | "high";
}

interface InsightResult {
  category: string;
  currentScore: number;
  thirtyDayAvg: number;
  problems: InsightProblem[];
  actions: InsightAction[];
}

const SCORE_ICONS: Record<string, LucideIcon> = {
  physical:   Activity,
  financial:  DollarSign,
  discipline: RefreshCw,
  focus:      Brain,
  mental:     Sparkles,
  appearance: Star,
  overall:    Star,
};

// Each category: [text color, bg color (rgba), border color (rgba), glow color (rgba)]
const SCORE_COLORS: Record<string, [string, string, string, string]> = {
  physical:   ["#60a5fa", "rgba(59,130,246,0.08)",  "rgba(59,130,246,0.22)",  "rgba(59,130,246,0.18)"],
  financial:  ["#34d399", "rgba(52,211,153,0.08)",  "rgba(52,211,153,0.22)",  "rgba(52,211,153,0.18)"],
  discipline: ["#a78bfa", "rgba(167,139,250,0.08)", "rgba(167,139,250,0.22)", "rgba(167,139,250,0.18)"],
  focus:      ["#22d3ee", "rgba(34,211,238,0.08)",  "rgba(34,211,238,0.22)",  "rgba(34,211,238,0.18)"],
  mental:     ["#f472b6", "rgba(244,114,182,0.08)", "rgba(244,114,182,0.22)", "rgba(244,114,182,0.18)"],
  appearance: ["#fbbf24", "rgba(251,191,36,0.08)",  "rgba(251,191,36,0.22)",  "rgba(251,191,36,0.18)"],
  overall:    ["#94a3b8", "rgba(148,163,184,0.08)", "rgba(148,163,184,0.2)",  "rgba(148,163,184,0.15)"],
};

function getScoreColor(score: number) {
  if (score >= 8) return "#10d9a0";
  if (score >= 6) return "#f59e0b";
  if (score >= 4) return "#fb923c";
  return "#ff4d6a";
}

function getBarGradient(score: number) {
  if (score >= 8) return "linear-gradient(90deg, #10d9a0, #22d3ee)";
  if (score >= 6) return "linear-gradient(90deg, #f59e0b, #fbbf24)";
  if (score >= 4) return "linear-gradient(90deg, #fb923c, #f97316)";
  return "linear-gradient(90deg, #ff4d6a, #ef4444)";
}

export default function DashboardScores({ scores }: { scores: ScoreData[] }) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [insight, setInsight] = useState<InsightResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [addedHabits, setAddedHabits] = useState<Set<string>>(new Set());

  async function openInsight(key: string, score: number) {
    if (activeCategory === key) {
      setActiveCategory(null);
      setInsight(null);
      return;
    }
    setActiveCategory(key);
    setInsight(null);
    setLoading(true);
    try {
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ category: key, currentScore: score }),
      });
      if (res.ok) setInsight(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function addHabit(action: InsightAction) {
    const key = action.habitName ?? action.text;
    try {
      const res = await fetch("/api/habits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: action.habitName ?? action.text,
          category: action.habitCategory ?? "general",
          priority: "high",
        }),
      });
      if (res.ok) setAddedHabits((prev) => new Set(prev).add(key));
    } catch {
      // ignore
    }
  }

  return (
    <div>
      {/* Scrollable on mobile, grid on desktop */}
      <div className="overflow-x-auto -mx-1 px-1 pb-1">
      <div className="grid grid-cols-7 gap-2" style={{ minWidth: "420px" }}>
        {scores.map(({ key, title, score, prevScore }) => {
          const Icon = SCORE_ICONS[key] ?? Star;
          const [textColor, bgColor, borderColor, glowColor] = SCORE_COLORS[key] ?? SCORE_COLORS.overall;
          const scoreColor = getScoreColor(score);
          const barGradient = getBarGradient(score);
          const isActive = activeCategory === key;
          const isPerfect = score >= 10;

          let trend: "up" | "down" | "stable" = "stable";
          if (prevScore !== undefined) {
            if (score - prevScore > 0.2) trend = "up";
            else if (score - prevScore < -0.2) trend = "down";
          }

          return (
            <button
              key={key}
              onClick={() => openInsight(key, score)}
              className="text-left p-2.5 rounded-xl transition-all duration-200 relative overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${bgColor} 0%, rgba(6,13,28,0.6) 100%)`,
                border: `1px solid ${isActive ? borderColor.replace("0.22", "0.5") : borderColor}`,
                boxShadow: isActive ? `0 0 16px ${glowColor}` : "none",
                cursor: isPerfect ? "default" : "pointer",
              }}
              onMouseEnter={(e) => {
                if (!isPerfect && !isActive) {
                  (e.currentTarget as HTMLElement).style.boxShadow = `0 0 12px ${glowColor}`;
                  (e.currentTarget as HTMLElement).style.borderColor = borderColor.replace("0.22", "0.4");
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.boxShadow = "none";
                  (e.currentTarget as HTMLElement).style.borderColor = borderColor;
                }
              }}
            >
              {/* Top highlight */}
              <div
                className="absolute inset-x-0 top-0 h-px"
                style={{ background: `linear-gradient(90deg, transparent, ${textColor}40, transparent)` }}
              />

              {/* Icon + trend row */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ background: bgColor.replace("0.08", "0.2") }}>
                  <Icon className="w-2.5 h-2.5" style={{ color: textColor }} />
                </div>
                <div>
                  {trend === "up"     && <TrendingUp   className="w-2.5 h-2.5" style={{ color: "#10d9a0" }} />}
                  {trend === "down"   && <TrendingDown  className="w-2.5 h-2.5" style={{ color: "#ff4d6a" }} />}
                  {trend === "stable" && <Minus         className="w-2.5 h-2.5" style={{ color: "#1e3050" }} />}
                </div>
              </div>

              {/* Score */}
              <div className="mb-1">
                <span className="text-lg font-bold leading-none" style={{ color: scoreColor, fontFamily: "'Syne', sans-serif" }}>
                  {score.toFixed(1)}
                </span>
              </div>

              {/* Title */}
              <p className="text-xs mb-1.5 leading-none" style={{ color: textColor, opacity: 0.7 }}>{title}</p>

              {/* Bar */}
              <div className="w-full h-0.5 rounded-full overflow-hidden" style={{ background: "rgba(6,13,28,0.6)" }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${(score / 10) * 100}%`, background: barGradient }}
                />
              </div>
            </button>
          );
        })}
      </div>
      </div>

      {/* Analysis panel */}
      {activeCategory && (
        <div
          className="mt-5 rounded-xl p-5"
          style={{
            background: "linear-gradient(135deg, #0c1830 0%, #091222 100%)",
            border: "1px solid rgba(79,114,255,0.2)",
            boxShadow: "0 0 24px rgba(79,114,255,0.08)",
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" style={{ color: "#fb923c" }} />
              <h3 className="font-semibold text-sm capitalize" style={{ color: "#c8deff", fontFamily: "'Syne', sans-serif" }}>
                {activeCategory} Analysis
              </h3>
              {insight && (
                <div className="flex items-center gap-2 text-xs" style={{ color: "#334d6e" }}>
                  <span>
                    Current:{" "}
                    <span style={{ color: getScoreColor(insight.currentScore) }}>{insight.currentScore.toFixed(1)}</span>
                  </span>
                  <span style={{ color: "#1e3050" }}>·</span>
                  <span>
                    30-day avg:{" "}
                    <span style={{ color: getScoreColor(insight.thirtyDayAvg) }}>{insight.thirtyDayAvg.toFixed(1)}</span>
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={() => { setActiveCategory(null); setInsight(null); }}
              className="transition-colors"
              style={{ color: "#2d4a6a" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#6b8cb8")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#2d4a6a")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-sm py-4" style={{ color: "#4a6a90" }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing your 30-day data...
            </div>
          )}

          {insight && !loading && (
            <div className="space-y-5">
              {insight.problems.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#ff4d6a" }}>
                    What you&apos;re doing wrong
                  </h4>
                  <div className="space-y-2">
                    {insight.problems.map((p, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "#ff4d6a" }} />
                        <p className="text-sm" style={{ color: "#8aadcc" }}>{p.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {insight.actions.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#4f72ff" }}>
                    What to do about it
                  </h4>
                  <div className="space-y-2">
                    {insight.actions.map((action, i) => {
                      const actionKey = action.habitName ?? action.text;
                      const alreadyAdded = addedHabits.has(actionKey);
                      return (
                        <div
                          key={i}
                          className="flex items-start gap-3 rounded-lg p-3"
                          style={{ background: "rgba(6,13,28,0.6)" }}
                        >
                          {action.type === "advice"      && <Lightbulb  className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "#f59e0b" }} />}
                          {action.type === "add_habit"   && <PlusCircle  className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "#10d9a0" }} />}
                          {action.type === "adjust_habit"&& <ArrowUp     className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "#fb923c" }} />}
                          <p className="text-sm flex-1" style={{ color: "#8aadcc" }}>{action.text}</p>
                          {action.type === "add_habit" && (
                            <button
                              onClick={() => addHabit(action)}
                              disabled={alreadyAdded}
                              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg flex-shrink-0 transition-all duration-150"
                              style={
                                alreadyAdded
                                  ? { background: "rgba(16,217,160,0.1)", color: "#10d9a0" }
                                  : { background: "linear-gradient(135deg, #4f72ff, #3d5ee6)", color: "white", boxShadow: "0 0 12px rgba(79,114,255,0.3)" }
                              }
                            >
                              {alreadyAdded ? <>✓ Added</> : <><PlusCircle className="w-3 h-3" /> Add Habit</>}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
