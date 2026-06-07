"use client";

import { useState, useEffect, useCallback } from "react";

interface CategoryScoreEntry {
  date: string;
  physical: number;
  financial: number;
  discipline: number;
  focus: number;
  mental: number;
  overall: number;
}

interface HabitStat {
  id: string;
  name: string;
  color: string;
  category: string;
  completionRate: number;
}

interface ProjectStat {
  completed: number;
  active: number;
  overdue: number;
  overdueCount: number;
  onTrack: number;
}

export interface AnalyticsData {
  categoryScores: CategoryScoreEntry[];
  trends: Record<string, "up" | "down" | "stable">;
  habitStats: HabitStat[];
  projectStats: ProjectStat;
}

interface UseScoresResult {
  data: AnalyticsData | null;
  loading: boolean;
  error: string;
  refetch: () => void;
}

export function useScores(): UseScoresResult {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchScores = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/analytics", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load scores");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scores");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScores();
  }, [fetchScores]);

  return { data, loading, error, refetch: fetchScores };
}
