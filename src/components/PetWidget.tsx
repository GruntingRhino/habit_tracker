"use client";

import { useState, useEffect } from "react";

interface Pet {
  id: string;
  name: string;
  species: string;
  xp: number;
  level: number;
  mood: string;
  lastFed: string;
  xpToNextLevel: number;
}

const SPECIES_EMOJI: Record<string, string> = {
  cat: "🐱",
  dog: "🐶",
  dragon: "🐉",
  phoenix: "🔥",
  robot: "🤖",
};

const MOOD_EMOJI: Record<string, string> = {
  happy: "😊",
  excited: "🤩",
  sleepy: "😴",
  hungry: "🍖",
  idle: "😐",
};

export default function PetWidget() {
  const [pet, setPet] = useState<Pet | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/pet", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.id) setPet(d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleFeed = async () => {
    if (!pet) return;
    try {
      const res = await fetch("/api/pet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "feed" }),
      });
      if (res.ok) {
        const updated = await res.json();
        setPet((prev) => prev ? { ...prev, lastFed: updated.lastFed, mood: "happy" } : null);
      }
    } catch {}
  };

  if (loading) {
    return (
      <div className="rounded-xl p-3" style={{ background: "var(--bg-elev-1)", border: "1px solid var(--stroke-1)" }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg animate-pulse" style={{ background: "var(--stroke-1)" }} />
          <div className="flex-1">
            <div className="h-3 w-16 rounded animate-pulse" style={{ background: "var(--stroke-1)" }} />
            <div className="h-2 w-10 rounded mt-1 animate-pulse" style={{ background: "var(--stroke-1)" }} />
          </div>
        </div>
      </div>
    );
  }

  if (!pet) return null;

  return (
    <div
      className="rounded-xl p-3 transition-all duration-200"
      style={{
        background: "var(--bg-elev-1)",
        border: "1px solid var(--stroke-1)",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
          style={{ background: "rgba(79, 127, 255, .12)" }}
        >
          {SPECIES_EMOJI[pet.species] || "🐱"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold" style={{ color: "var(--ink-100)" }}>
              {pet.name}
            </span>
            <span className="text-xs" style={{ color: "var(--ink-400)" }}>
              Lvl {pet.level}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-xs" style={{ color: "var(--ink-500)" }}>
              {MOOD_EMOJI[pet.mood] || "😐"}
            </span>
            <span className="text-[10px] capitalize" style={{ color: "var(--ink-500)" }}>
              {pet.mood}
            </span>
          </div>
        </div>
        <button
          onClick={handleFeed}
          className="px-2 py-1 rounded-lg text-xs font-medium transition-colors"
          style={{
            background: "rgba(46, 216, 137, .1)",
            color: "var(--good)",
          }}
        >
          Feed
        </button>
      </div>
      {/* XP bar */}
      <div className="mt-2">
        <div className="flex items-center justify-between text-[10px]" style={{ color: "var(--ink-500)" }}>
          <span>XP {pet.xp % 100}/{100}</span>
          <span>Next level</span>
        </div>
        <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,.05)" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${((pet.xp % 100) / 100) * 100}%`,
              background: "linear-gradient(90deg, var(--blue-400), var(--cyan-400))",
            }}
          />
        </div>
      </div>
    </div>
  );
}
