"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Utensils, Plus, X, Loader2, AlertCircle, ChevronDown, Trash2,
  Flame, BookOpen, Coffee, Sun, Moon, Cookie,
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
  const [recipe, setRecipe] = useState("");
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
          recipe:   recipe   || undefined,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-slate-100">Add Meal</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                Meal Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Greek Yogurt Bowl"
                className="w-full bg-[#1e293b] border border-[#334155] text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-[#1e293b] border border-[#334155] text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key} className="bg-[#0f172a] capitalize">{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                Calories (approx)
              </label>
              <input
                type="number"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
                placeholder="450"
                className="w-full bg-[#1e293b] border border-[#334155] text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                Servings
              </label>
              <input
                type="number"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                placeholder="1"
                min="1"
                className="w-full bg-[#1e293b] border border-[#334155] text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
              Recipe / Ingredients
            </label>
            <textarea
              value={recipe}
              onChange={(e) => setRecipe(e.target.value)}
              rows={5}
              placeholder={"Ingredients:\n- 200g Greek yogurt\n- 1 cup mixed berries\n- 1 tbsp honey\n- 30g granola\n\nSteps:\n1. Add yogurt to bowl\n2. Top with berries and granola\n3. Drizzle honey"}
              className="w-full bg-[#1e293b] border border-[#334155] text-slate-100 placeholder-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
              Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Prep tips, substitutions, etc."
              className="w-full bg-[#1e293b] border border-[#334155] text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-[#1e293b] hover:bg-[#334155] text-slate-300 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add Meal"}
            </button>
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
    <div className="p-6 max-w-4xl mx-auto">
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
