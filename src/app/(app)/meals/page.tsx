"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Utensils, Plus, X, Loader2, AlertCircle, ChevronDown, Trash2,
  Flame, BookOpen, Coffee, Sun, Moon, Cookie, ArrowLeft,
} from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Meal {
  id: string;
  name: string;
  category: string;
  recipe: string | null;
  calories: number | null;
  servings: number | null;
  notes: string | null;
  order: number;
}

const CATEGORIES = [
  { key: "breakfast", label: "Breakfast", icon: Coffee,  color: "text-amber-400",  bg: "bg-amber-500/10",  border: "border-amber-500/20" },
  { key: "lunch",     label: "Lunch",     icon: Sun,     color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/20" },
  { key: "dinner",    label: "Dinner",    icon: Moon,    color: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/20" },
  { key: "snack",     label: "Snacks",    icon: Cookie,  color: "text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/20" },
] as const;

function buildRecipe(ingredients: string, instructions: string): string {
  const sections: string[] = [];

  if (ingredients.trim()) {
    sections.push(`Ingredients:\n${ingredients.trim()}`);
  }

  if (instructions.trim()) {
    sections.push(`Instructions:\n${instructions.trim()}`);
  }

  return sections.join("\n\n");
}

// ─── Add Meal Modal ───────────────────────────────────────────────────────────

function AddMealModal({
  defaultCategory,
  onClose,
  onSaved,
}: {
  defaultCategory?: string;
  onClose: () => void;
  onSaved: (meal: Meal) => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(defaultCategory ?? "breakfast");
  const [ingredients, setIngredients] = useState("");
  const [instructions, setInstructions] = useState("");
  const [calories, setCalories] = useState("");
  const [servings, setServings] = useState("1");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          category,
          recipe: buildRecipe(ingredients, instructions) || undefined,
          calories: calories ? parseInt(calories) : undefined,
          servings: servings ? parseInt(servings) : 1,
          notes:    notes    || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      onSaved(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-[30px] border border-[rgba(120,145,220,0.18)] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0)),#0f1525] p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.85)] max-h-[92vh] overflow-y-auto">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
              Meal Entry
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
              Create a meal
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              Capture the meal clearly: what it is, when you eat it, what goes in it, and how to make it.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            Close
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-2">
            <AlertCircle className="h-4 w-4 text-red-300" />
            <p className="text-sm text-red-200">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-5">
            <section className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Meal Info
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Start with the name and when you usually eat it.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                    Meal name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Greek yogurt bowl"
                    className="w-full rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                    autoFocus
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {CATEGORIES.map((option) => {
                    const Icon = option.icon;
                    const active = category === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setCategory(option.key)}
                        className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                          active
                            ? `${option.border} ${option.bg} text-white`
                            : "border-white/8 bg-white/[0.02] text-[var(--text-secondary)] hover:border-white/14 hover:text-white"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${option.bg}`}>
                            <Icon className={`h-4 w-4 ${option.color}`} />
                          </div>
                          <div>
                            <div className="text-sm font-semibold">{option.label}</div>
                            <div className="text-xs text-inherit/80">
                              {option.key === "snack" ? "Smaller quick option" : `${option.label} entry`}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Ingredients and Instructions
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Split the meal into what goes in it and how to make it.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                    Ingredients
                  </label>
                  <textarea
                    value={ingredients}
                    onChange={(e) => setIngredients(e.target.value)}
                    rows={6}
                    placeholder={"- 200g Greek yogurt\n- 1 cup mixed berries\n- 30g granola\n- 1 tbsp honey"}
                    className="w-full resize-none rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                    Instructions
                  </label>
                  <textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    rows={6}
                    placeholder={"1. Add yogurt to bowl\n2. Top with berries and granola\n3. Drizzle honey"}
                    className="w-full resize-none rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                  />
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-5">
            <section className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Nutrition
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Add quick numbers if you know them.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                    Calories
                  </label>
                  <input
                    type="number"
                    value={calories}
                    onChange={(e) => setCalories(e.target.value)}
                    placeholder="450"
                    className="w-full rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                    Servings
                  </label>
                  <input
                    type="number"
                    value={servings}
                    onChange={(e) => setServings(e.target.value)}
                    placeholder="1"
                    min="1"
                    className="w-full rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Useful Notes
                </p>
              </div>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Prep tips, swaps, reminders, storage notes"
                className="w-full rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
              />
            </section>

            <section className="rounded-[24px] border border-white/8 bg-[#101826] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Preview
              </p>
              <div className="mt-4 rounded-[22px] border border-white/8 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">
                      {name.trim() || "Your meal name"}
                    </div>
                    <div className="mt-1 text-xs text-[var(--text-secondary)]">
                      {CATEGORIES.find((item) => item.key === category)?.label ?? "Meal"} ·{" "}
                      {calories.trim() ? `${calories} kcal` : "Calories optional"}
                    </div>
                  </div>
                  <div className="rounded-full bg-white/6 px-3 py-1 text-xs text-[var(--text-secondary)]">
                    {servings || "1"} serving{servings === "1" ? "" : "s"}
                  </div>
                </div>
                <div className="mt-4 space-y-3 text-sm text-[var(--text-secondary)]">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      Ingredients
                    </div>
                    <div className="mt-1 line-clamp-4 whitespace-pre-wrap">
                      {ingredients.trim() || "Ingredient list will show here."}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      Instructions
                    </div>
                    <div className="mt-1 line-clamp-4 whitespace-pre-wrap">
                      {instructions.trim() || "Instructions will show here."}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#4f72ff_0%,#22d3ee_100%)] px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_40px_-18px_rgba(79,114,255,0.95)] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create meal"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Meal Card ─────────────────────────────────────────────────────────────────

function MealCard({ meal, onDeleted }: { meal: Meal; onDeleted: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete "${meal.name}"?`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/meals/${meal.id}`, { method: "DELETE", credentials: "include" });
      onDeleted();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl overflow-hidden hover:border-[#334155] transition-colors">
      {/* Header row — always visible */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => setExpanded((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-600 flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
          <span className="flex-1 truncate text-slate-100 text-sm font-medium">
            {meal.name}
          </span>
          {meal.calories && (
            <span className="flex items-center gap-1 text-xs text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full flex-shrink-0">
              <Flame className="w-3 h-3" />
              {meal.calories} kcal
              {meal.servings && meal.servings > 1 && (
                <span className="text-orange-500/60">/{meal.servings} srv</span>
              )}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="ml-1 p-1 rounded text-slate-700 hover:text-red-400 transition-colors flex-shrink-0"
        >
          {deleting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-[#1e293b] space-y-3">
          {meal.recipe && (
            <div className="pt-3">
              <div className="flex items-center gap-1.5 mb-2">
                <BookOpen className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs text-slate-500 uppercase tracking-wide font-medium">Recipe</span>
              </div>
              <pre className="text-slate-300 text-xs whitespace-pre-wrap font-mono bg-[#1e293b] rounded-lg px-3 py-3 leading-relaxed">
                {meal.recipe}
              </pre>
            </div>
          )}
          {meal.notes && (
            <p className="text-xs text-slate-500 italic border-t border-[#1e293b] pt-3">{meal.notes}</p>
          )}
          {!meal.recipe && !meal.notes && (
            <p className="text-xs text-slate-600 pt-3 italic">No recipe added yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Category Section ─────────────────────────────────────────────────────────

function CategorySection({
  category,
  meals,
  onAdd,
  onDeleted,
}: {
  category: typeof CATEGORIES[number];
  meals: Meal[];
  onAdd: () => void;
  onDeleted: (id: string) => void;
}) {
  const Icon = category.icon;
  const totalCals = meals.reduce((sum, m) => sum + (m.calories ?? 0), 0);

  return (
    <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-2xl overflow-hidden">
      {/* Section header */}
      <div className={`flex items-center justify-between px-5 py-4 border-b ${category.border} ${category.bg}`}>
        <div className="flex items-center gap-2.5">
          <Icon className={`w-4 h-4 ${category.color}`} />
          <h2 className={`text-sm font-semibold ${category.color}`}>{category.label}</h2>
          <span className="text-xs text-slate-600">
            {meals.length} meal{meals.length !== 1 ? "s" : ""}
            {totalCals > 0 && <span className="ml-1.5 text-slate-600">· ~{totalCals} kcal</span>}
          </span>
        </div>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e293b] hover:bg-[#334155] text-slate-300 rounded-lg text-xs font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>

      {/* Meal list */}
      <div className="p-4">
        {meals.length === 0 ? (
          <button
            onClick={onAdd}
            className="w-full py-6 border border-dashed border-[#334155] rounded-xl text-slate-600 text-sm hover:border-[#475569] hover:text-slate-400 transition-colors flex flex-col items-center gap-1"
          >
            <Plus className="w-5 h-5" />
            Add your first {category.label.toLowerCase()} meal
          </button>
        ) : (
          <div className="space-y-2">
            {meals.map((meal) => (
              <MealCard
                key={meal.id}
                meal={meal}
                onDeleted={() => onDeleted(meal.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MealsPage() {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalCategory, setModalCategory] = useState<string | null>(null);

  const fetchMeals = useCallback(async () => {
    try {
      const res = await fetch("/api/meals", { credentials: "include" });
      if (res.ok) setMeals(await res.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchMeals(); }, [fetchMeals]);

  const totalDailyCals = meals.reduce((sum, m) => sum + (m.calories ?? 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="px-4 py-5 md:px-6 md:py-6 max-w-4xl mx-auto pb-20 lg:pb-6">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm mb-5 transition-colors" style={{ color: "#3d5a7a" }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#7a9eff")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#3d5a7a")}>
        <ArrowLeft className="w-4 h-4" /> Dashboard
      </Link>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2.5">
            <Utensils className="w-6 h-6 text-slate-400" />
            Meals
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {meals.length} meal{meals.length !== 1 ? "s" : ""}
            {totalDailyCals > 0 && <span> · ~{totalDailyCals} kcal total</span>}
          </p>
        </div>
        <button
          onClick={() => setModalCategory("breakfast")}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Meal
        </button>
      </div>

      {/* 4 category sections */}
      <div className="space-y-5">
        {CATEGORIES.map((cat) => (
          <CategorySection
            key={cat.key}
            category={cat}
            meals={meals.filter((m) => m.category === cat.key)}
            onAdd={() => setModalCategory(cat.key)}
            onDeleted={(id) => setMeals((prev) => prev.filter((m) => m.id !== id))}
          />
        ))}
      </div>

      {modalCategory && (
        <AddMealModal
          defaultCategory={modalCategory}
          onClose={() => setModalCategory(null)}
          onSaved={(meal) => {
            setMeals((prev) => [...prev, meal]);
            setModalCategory(null);
          }}
        />
      )}
    </div>
  );
}
