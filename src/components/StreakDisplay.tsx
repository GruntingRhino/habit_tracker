"use client";

import { Flame } from "lucide-react";

interface StreakDisplayProps {
  currentStreak: number;
  longestStreak: number;
  weeklyProgress: boolean[];
}

export default function StreakDisplay({ currentStreak, longestStreak, weeklyProgress }: StreakDisplayProps) {
  return (
    <div className="rounded-2xl border border-[#284c8c]/30 bg-[#0c1830] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">Streak</h3>
        <div className="flex items-center gap-1.5">
          <Flame className="h-4 w-4 text-orange-400" />
          <span className="text-lg font-bold text-orange-400">{currentStreak}</span>
          <span className="text-xs text-[#6b8cb8]">days</span>
        </div>
      </div>
      <div className="flex gap-1">
        {weeklyProgress.map((completed, i) => (
          <div
            key={i}
            className={`h-8 flex-1 rounded-md transition-colors ${
              completed ? "bg-green-500/50" : "bg-[#1e3050]"
            }`}
            title={completed ? "Completed" : "Missed"}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-[#6b8cb8]">Best streak: {longestStreak} days</p>
    </div>
  );
}
