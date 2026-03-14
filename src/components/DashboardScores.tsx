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
  physical: Activity,
  financial: DollarSign,
  discipline: RefreshCw,
  focus: Brain,
  mental: Sparkles,
  appearance: Star,
  overall: Star,
};

const SCORE_COLORS: Record<string, string> = {
  physical: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  financial: "text-green-400 bg-green-500/10 border-green-500/20",
  discipline: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  focus: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  mental: "text-pink-400 bg-pink-500/10 border-pink-500/20",
  appearance: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  overall: "text-slate-300 bg-slate-500/10 border-slate-500/20",
};

function getScoreColor(score: number) {
  if (score >= 8) return "text-green-400";
  if (score >= 6) return "text-yellow-400";
  if (score >= 4) return "text-orange-400";
  return "text-red-400";
}

function getBarColor(score: number) {
  if (score >= 8) return "bg-green-500";
  if (score >= 6) return "bg-yellow-500";
  if (score >= 4) return "bg-orange-500";
  return "bg-red-500";
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
      if (res.ok) {
        setInsight(await res.json());
      }
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
      if (res.ok) {
        setAddedHabits((prev) => new Set(prev).add(key));
      }
    } catch {
      // ignore
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {scores.map(({ key, title, score, prevScore }) => {
          const Icon = SCORE_ICONS[key] ?? Star;
          const colorClasses = SCORE_COLORS[key] ?? SCORE_COLORS.overall;
          const scoreColor = getScoreColor(score);
          const barColor = getBarColor(score);
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
              className={`text-left p-4 rounded-xl border transition-all ${colorClasses} ${
                isActive ? "ring-2 ring-blue-500/40" : "hover:opacity-90"
              } ${isPerfect ? "cursor-default" : "cursor-pointer"}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 opacity-80" />
                  <span className="text-xs font-medium opacity-80">{title}</span>
                </div>
                <div className="flex items-center gap-1">
                  {!isPerfect && (
                    <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                  )}
                  {trend === "up" && <TrendingUp className="w-3 h-3 text-green-400" />}
                  {trend === "down" && <TrendingDown className="w-3 h-3 text-red-400" />}
                  {trend === "stable" && <Minus className="w-3 h-3 text-slate-500" />}
                </div>
              </div>
              <div className={`text-2xl font-bold ${scoreColor} mb-2`}>
                {score.toFixed(1)}
                <span className="text-sm font-normal text-slate-500">/10</span>
              </div>
              <div className="w-full h-1.5 bg-black/20 rounded-full overflow-hidden">
                <div
                  className={`h-full ${barColor} rounded-full transition-all duration-700`}
                  style={{ width: `${(score / 10) * 100}%` }}
                />
              </div>
              {!isPerfect && (
                <p className="text-xs opacity-50 mt-2">Click for analysis</p>
              )}
            </button>
          );
        })}
      </div>

      {/* Analysis panel */}
      {activeCategory && (
        <div className="mt-5 bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
              <h3 className="font-semibold text-slate-100 text-sm capitalize">
                {activeCategory} Analysis
              </h3>
              {insight && (
                <span className="text-xs text-slate-500">
                  30-day avg:{" "}
                  <span className={getScoreColor(insight.thirtyDayAvg)}>
                    {insight.thirtyDayAvg.toFixed(1)}
                  </span>
                </span>
              )}
            </div>
            <button
              onClick={() => {
                setActiveCategory(null);
                setInsight(null);
              }}
              className="text-slate-500 hover:text-slate-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing your 30-day data...
            </div>
          )}

          {insight && !loading && (
            <div className="space-y-5">
              {/* Problems */}
              {insight.problems.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">
                    What you&apos;re doing wrong
                  </h4>
                  <div className="space-y-2">
                    {insight.problems.map((p, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                        <p className="text-slate-300 text-sm">{p.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              {insight.actions.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-2">
                    What to do about it
                  </h4>
                  <div className="space-y-2">
                    {insight.actions.map((action, i) => {
                      const actionKey = action.habitName ?? action.text;
                      const alreadyAdded = addedHabits.has(actionKey);

                      return (
                        <div
                          key={i}
                          className="flex items-start gap-3 bg-[#0a0f1e]/60 rounded-lg p-3"
                        >
                          {action.type === "advice" && (
                            <Lightbulb className="w-3.5 h-3.5 text-yellow-400 mt-0.5 flex-shrink-0" />
                          )}
                          {action.type === "add_habit" && (
                            <PlusCircle className="w-3.5 h-3.5 text-green-400 mt-0.5 flex-shrink-0" />
                          )}
                          {action.type === "adjust_habit" && (
                            <ArrowUp className="w-3.5 h-3.5 text-orange-400 mt-0.5 flex-shrink-0" />
                          )}
                          <p className="text-slate-300 text-sm flex-1">
                            {action.text}
                          </p>
                          {action.type === "add_habit" && (
                            <button
                              onClick={() => addHabit(action)}
                              disabled={alreadyAdded}
                              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg flex-shrink-0 transition-colors ${
                                alreadyAdded
                                  ? "bg-green-500/10 text-green-400 cursor-default"
                                  : "bg-blue-600 hover:bg-blue-700 text-white"
                              }`}
                            >
                              {alreadyAdded ? (
                                <>✓ Added</>
                              ) : (
                                <>
                                  <PlusCircle className="w-3 h-3" />
                                  Add Habit
                                </>
                              )}
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
