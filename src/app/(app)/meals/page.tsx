"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { X } from "lucide-react";
import NutritionPanel from "@/components/NutritionPanel";
import { InlineAdd, PageHeader, Section } from "@/components/ui";
import { useLoad, useOnDataChanged } from "@/hooks/useAssistantChat";

interface Meal {
  id: string;
  name: string;
  category: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  status: "saved" | "planned" | "eaten";
  plannedFor: string | null;
}

const send = (url: string, method: string, body?: unknown) =>
  fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

/** Food: today's log and nutrients, then planned meals and saved recipes as compact extras. */
export default function FoodPage() {
  const [meals, setMeals] = useState<Meal[]>([]);
  const load = useCallback(async () => {
    const res = await fetch("/api/meals");
    if (res.ok) setMeals(await res.json());
  }, []);
  useLoad(load);
  useOnDataChanged(load);

  const planned = meals.filter((m) => m.status === "planned").sort((a, b) => (a.plannedFor ?? "").localeCompare(b.plannedFor ?? ""));
  const recipes = meals.filter((m) => m.status === "saved");

  async function ate(m: Meal) {
    await send(`/api/meals/${m.id}`, "PATCH", { status: "eaten", plannedFor: new Date().toISOString() });
    await load();
    window.dispatchEvent(new CustomEvent("liveimproved:changed"));
  }
  async function logRecipe(m: Meal) {
    const h = new Date().getHours();
    const category = h < 11 ? "breakfast" : h < 16 ? "lunch" : h < 22 ? "dinner" : "snack";
    await send("/api/meals", "POST", {
      name: m.name,
      category,
      status: "eaten",
      ...(m.calories !== null ? { calories: m.calories, protein: m.protein ?? 0, carbs: m.carbs ?? 0, fat: m.fat ?? 0, nutritionSource: "manual" } : {}),
    });
    window.dispatchEvent(new CustomEvent("liveimproved:changed"));
  }
  async function remove(id: string) {
    await send(`/api/meals/${id}`, "DELETE");
    await load();
  }

  return (
    <div className="mx-auto max-w-[56rem]">
      <PageHeader title="Food" />
      <NutritionPanel />

      {(planned.length > 0 || recipes.length > 0) && <div className="mt-6" />}
      {planned.length > 0 && (
        <Section label="Planned">
          <ul>
            {planned.map((m) => (
              <li key={m.id} className="group min-row">
                <span className="w-16 text-xs capitalize" style={{ color: "var(--ink-500)" }}>
                  {m.category}
                </span>
                <span className="flex-1" style={{ color: "var(--ink-200)" }}>
                  {m.name}
                </span>
                {m.plannedFor && <span className="text-xs" style={{ color: "var(--ink-500)" }}>{format(new Date(m.plannedFor), "EEE")}</span>}
                <button onClick={() => ate(m)} className="min-chip">
                  Ate it
                </button>
                <button onClick={() => remove(m.id)} aria-label={`Delete ${m.name}`} className="hidden group-hover:block">
                  <X className="h-3.5 w-3.5" style={{ color: "var(--ink-500)" }} />
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section label="Recipes">
        <div className="flex flex-wrap items-center gap-1.5">
          {recipes.map((m) => (
            <span key={m.id} className="group min-chip flex items-center gap-1">
              <button onClick={() => logRecipe(m)} title="Log it as eaten now">
                {m.name}
              </button>
              <button onClick={() => remove(m.id)} aria-label={`Delete recipe ${m.name}`} className="hidden group-hover:inline">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <div className="w-44">
            <InlineAdd
              placeholder="+ Save a recipe"
              onAdd={async (name) => {
                await send("/api/meals", "POST", { name, category: "dinner" });
                await load();
              }}
              className="py-0.5 text-xs"
            />
          </div>
        </div>
      </Section>
    </div>
  );
}
