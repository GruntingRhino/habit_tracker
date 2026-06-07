"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Brain, Dumbbell, Target, Sparkles, BookOpen, Wallet, Activity, Moon } from "lucide-react";
import { useSession } from "next-auth/react";

const HABIT_LIBRARY = [
  { id: "sleep", label: "Sleep tracking", icon: Moon },
  { id: "workout", label: "Workout / training", icon: Dumbbell },
  { id: "reading", label: "Reading / study", icon: BookOpen },
  { id: "meditation", label: "Meditation / mindfulness", icon: Brain },
  { id: "finance", label: "Financial tracking", icon: Wallet },
  { id: "focus", label: "Deep work / focus", icon: Target },
  { id: "steps", label: "Steps / movement", icon: Activity },
  { id: "discipline", label: "Daily discipline", icon: Sparkles },
];

export default function OnboardingWizard() {
  const router = useRouter();
  const { data: session } = useSession();
  const [step, setStep] = useState(0);
  const [selectedHabits, setSelectedHabits] = useState<string[]>([]);
  const [strictness, setStrictness] = useState<"lenient" | "balanced" | "strict">("balanced");
  const [saving, setSaving] = useState(false);

  function toggleHabit(id: string) {
    setSelectedHabits((prev) =>
      prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id]
    );
  }

  async function handleFinish() {
    setSaving(true);
    try {
      await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          strictness,
          onboardingCompleted: true,
        }),
      });
      await fetch("/api/habits/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          habits: selectedHabits.map((id) => ({ category: id, label: id, active: true })),
        }),
      });
      router.push("/entry");
    } catch {
      router.push("/dashboard");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#060d1c]/95 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4">
        <div className="mb-8 flex justify-center">
          <div className="flex items-center gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`h-1.5 w-12 rounded-full transition-colors ${
                  i <= step ? "bg-blue-500" : "bg-[#1e3050]"
                }`}
              />
            ))}
          </div>
        </div>

        {step === 0 && (
          <div className="rounded-2xl border border-[#284c8c]/40 bg-[#0c1830] p-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/20 mb-5">
              <Target className="h-7 w-7 text-blue-400" />
            </div>
            <h2 className="text-2xl font-semibold text-white mb-2">What do you want to track?</h2>
            <p className="text-sm text-[#6b8cb8] mb-6">Pick the areas that matter most to you.</p>
            <div className="grid grid-cols-2 gap-3">
              {HABIT_LIBRARY.map(({ id, label, icon: Icon }) => {
                const selected = selectedHabits.includes(id);
                return (
                  <button
                    key={id}
                    onClick={() => toggleHabit(id)}
                    className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all ${
                      selected
                        ? "border-blue-500 bg-blue-500/15 text-white"
                        : "border-[#284c8c]/30 bg-[#0b1525] text-[#6b8cb8] hover:border-[#284c8c]/60"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${selected ? "text-blue-400" : ""}`} />
                    <span className="text-sm font-medium">{label}</span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setStep(1)}
              disabled={selectedHabits.length === 0}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="rounded-2xl border border-[#284c8c]/40 bg-[#0c1830] p-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-500/20 mb-5">
              <Sparkles className="h-7 w-7 text-purple-400" />
            </div>
            <h2 className="text-2xl font-semibold text-white mb-2">How strict should scoring be?</h2>
            <p className="text-sm text-[#6b8cb8] mb-6">Stricter scoring gives less credit for partial effort. You can change this anytime.</p>
            <div className="space-y-3">
              {(["lenient", "balanced", "strict"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStrictness(s)}
                  className={`w-full rounded-xl border p-4 text-left transition-all ${
                    strictness === s
                      ? "border-blue-500 bg-blue-500/15"
                      : "border-[#284c8c]/30 bg-[#0b1525] hover:border-[#284c8c]/60"
                  }`}
                >
                  <div className="text-sm font-semibold text-white capitalize mb-1">{s}</div>
                  <div className="text-xs text-[#6b8cb8]">
                    {s === "lenient" && "More forgiving — partial effort still scores well."}
                    {s === "balanced" && "Fair scoring — reasonable credit for reasonable effort."}
                    {s === "strict" && "Hard mode — only real consistency earns high scores."}
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setStep(0)} className="flex-1 rounded-xl border border-[#284c8c]/40 py-3 text-sm font-medium text-[#6b8cb8]">
                Back
              </button>
              <button onClick={() => setStep(2)} className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white">
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="rounded-2xl border border-[#284c8c]/40 bg-[#0c1830] p-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-green-500/20 mb-5">
              <Activity className="h-8 w-8 text-green-400" />
            </div>
            <h2 className="text-2xl font-semibold text-white mb-2">Ready to start</h2>
            <p className="text-sm text-[#6b8cb8] mb-2">
              {selectedHabits.length} habit{selectedHabits.length !== 1 ? "s" : ""} selected
            </p>
            <p className="text-sm text-[#6b8cb8] mb-6">
              Strictness: <span className="capitalize text-white">{strictness}</span>
            </p>
            <button
              onClick={handleFinish}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 py-3.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Setting up..." : "Log your first day"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
