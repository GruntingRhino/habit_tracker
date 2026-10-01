"use client";

import { report, toast } from "@/components/feedback";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useLoad, useOnDataChanged } from "@/hooks/useAssistantChat";
import { MICRO_KEYS, MICRO_META, sumMicros, type MicroKey, type Micros } from "@/lib/nutrition-micros";

type Macro = "calories" | "protein" | "carbs" | "fat";
type Key = Macro | MicroKey;
const MACROS: { key: Macro; label: string; unit: string }[] = [
  { key: "calories", label: "Calories", unit: "" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbs", label: "Carbs", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
];
const SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;

interface Item {
  name: string;
  amount: string;
  grams?: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: "table" | "estimate" | "manual";
  micros?: Micros | null;
  key?: number;
}
interface Question {
  key: number;
  prompt: string;
  options: { label: string; amount: string }[];
}
interface Meal {
  id: string;
  name: string;
  category: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  items: Item[] | null;
  micros: Micros | null;
  nutritionSource: string | null;
  sourceText: string | null;
}
interface Day {
  date: string;
  meals: Meal[];
  totals: Record<Macro, number>;
  micros: Micros;
  missing: number;
  targets: Partial<Record<Key, number | null>> | null;
}
interface Draft {
  id?: string;
  name: string;
  category: string;
  items: Item[];
  source: "ai" | "manual";
  text?: string;
  questions?: Question[];
  amounts?: Record<number, string>;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const slotNow = () => {
  const h = new Date().getHours();
  return h < 11 ? "breakfast" : h < 16 ? "lunch" : h < 22 ? "dinner" : "snack";
};
const sum = (items: Item[], k: Macro) => items.reduce((n, i) => n + (Number(i[k]) || 0), 0);
const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "–" : n >= 100 ? Math.round(n).toLocaleString() : Math.round(n * 10) / 10);
const blankItem = (): Item => ({ name: "", amount: "", calories: 0, protein: 0, carbs: 0, fat: 0, source: "manual" });
const post = (url: string, method: string, body: unknown) => fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** The day's totals against targets: one thin row per nutrient. */
function NutrientColumn({ day, onSaved }: { day: Day | null; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Partial<Record<Key, string>>>({});
  const [more, setMore] = useState(false);
  const target = (k: Key) => day?.targets?.[k] ?? (k in MICRO_META ? MICRO_META[k as MicroKey].target : null);
  const rows: { key: Key; label: string; unit: string; limit?: boolean; value: number | undefined }[] = [
    ...MACROS.map((m) => ({ key: m.key as Key, label: m.label, unit: m.unit, value: day?.totals[m.key] })),
    ...MICRO_KEYS.map((k) => ({ key: k as Key, label: MICRO_META[k].label, unit: MICRO_META[k].unit, limit: MICRO_META[k].limit, value: day?.micros?.[k] })),
  ];

  async function save() {
    const body = Object.fromEntries(rows.map((r) => [r.key, values[r.key] === undefined ? target(r.key) : values[r.key] === "" ? null : Number(values[r.key])]));
    body.calories = body.calories === null ? null : Math.round(Number(body.calories));
    const res = report(await post("/api/nutrition/targets", "PUT", body), "Targets saved");
    if (res.ok) {
      setEditing(false);
      onSaved();
    }
  }

  return (
    <aside className="text-xs">
      <div className="mb-1 flex items-center justify-between">
        <span className="min-label">Today&apos;s nutrients</span>
        <button onClick={() => (editing ? void save() : setEditing(true))} className="text-[11px]" style={{ color: "var(--accent)" }}>
          {editing ? "Save" : "Targets"}
        </button>
      </div>
      <ul>
        {rows.map((r, i) => {
          const t = target(r.key);
          const v = r.value;
          const pct = t && v !== undefined ? Math.min(100, (v / t) * 100) : 0;
          const over = r.limit && t && v !== undefined && v > t;
          return (
            <li key={r.key} className={`py-[3px] ${i >= 7 && !more ? "hidden lg:block" : ""}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span style={{ color: "var(--ink-400)" }}>{r.label}</span>
                {editing ? (
                  <input
                    inputMode="decimal"
                    aria-label={`${r.label} target`}
                    value={values[r.key] ?? (t ?? "").toString()}
                    onChange={(e) => setValues((x) => ({ ...x, [r.key]: e.target.value.replace(/[^\d.]/g, "") }))}
                    className="min-field w-16 py-0 text-right"
                  />
                ) : (
                  <span className="tabular-nums" style={{ color: over ? "var(--warn)" : "var(--ink-200)" }}>
                    {fmt(v)}
                    <span style={{ color: "var(--ink-600)" }}>
                      {t ? `/${fmt(t)}` : ""}
                      {r.unit}
                    </span>
                  </span>
                )}
              </div>
              {!editing && t ? (
                <div className="mt-0.5 h-[3px] overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,.05)" }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: over ? "var(--warn)" : r.limit ? "var(--ink-500)" : "var(--accent)" }} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <button onClick={() => setMore((v) => !v)} className="mt-1 text-[11px] lg:hidden" style={{ color: "var(--ink-500)" }}>
        {more ? "Less" : "All nutrients"}
      </button>
    </aside>
  );
}

function DraftEditor({ draft, onChange, onAnswer, onSave, onCancel, busy }: { draft: Draft; onChange: (d: Draft) => void; onAnswer: (key: number, amount: string) => void; onSave: () => void; onCancel: () => void; busy: boolean }) {
  const setItem = (n: number, patch: Partial<Item>) =>
    onChange({ ...draft, items: draft.items.map((it, i) => (i === n ? { ...it, ...patch, source: MACROS.some((m) => m.key in patch) ? "manual" : it.source } : it)) });
  const num = (v: string) => (v === "" ? 0 : Math.max(0, Number(v) || 0));
  const question = (it: Item) => draft.questions?.find((q) => q.key === it.key);

  return (
    <div className="mb-4 rounded-lg p-3" style={{ border: "1px solid var(--stroke-1)", background: "rgba(255,255,255,.02)" }}>
      <div className="mb-2 flex items-center gap-2">
        <input value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} placeholder="Meal name" aria-label="Meal name" className="min-field flex-1" />
        <select value={draft.category} onChange={(e) => onChange({ ...draft, category: e.target.value })} aria-label="Meal slot" className="min-field w-24 capitalize">
          {SLOTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button onClick={onCancel} aria-label="Cancel" style={{ color: "var(--ink-500)" }}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul>
        {draft.items.map((it, n) => {
          const q = question(it);
          return (
            <li key={n} className="py-1">
              <div className="grid grid-cols-[1fr_4.5rem_repeat(4,3.2rem)_1rem] items-center gap-1.5 text-xs">
                <input value={it.name} onChange={(e) => setItem(n, { name: e.target.value })} placeholder="Food" aria-label={`Food ${n + 1}`} className="min-field" />
                <input value={it.amount} onChange={(e) => setItem(n, { amount: e.target.value })} placeholder="Amount" aria-label={`Amount ${n + 1}`} className="min-field" />
                {MACROS.map((m) => (
                  <input
                    key={m.key}
                    inputMode="decimal"
                    title={m.label}
                    value={String(it[m.key] ?? 0)}
                    onChange={(e) => setItem(n, { [m.key]: num(e.target.value) } as Partial<Item>)}
                    aria-label={`${m.label} ${n + 1}`}
                    className="min-field px-1 text-right tabular-nums"
                    style={q ? { opacity: 0.4 } : undefined}
                  />
                ))}
                <button onClick={() => onChange({ ...draft, items: draft.items.filter((_, i) => i !== n) })} aria-label={`Remove food ${n + 1}`} style={{ color: "var(--ink-500)" }}>
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              {q ? (
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <span style={{ color: "var(--warn)" }}>{q.prompt}</span>
                  {q.options.map((o) => (
                    <button key={o.label} onClick={() => onAnswer(q.key, o.amount)} className="min-chip">
                      {o.label}
                    </button>
                  ))}
                </div>
              ) : it.source === "estimate" ? (
                <p className="mt-0.5 text-[10px]" style={{ color: "var(--ink-500)" }}>
                  AI guess, check it
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <button onClick={() => onChange({ ...draft, items: [...draft.items, blankItem()] })} className="flex items-center gap-1" style={{ color: "var(--ink-400)" }}>
          <Plus className="h-3 w-3" /> Food
        </button>
        <span className="tabular-nums" style={{ color: "var(--ink-300)" }}>
          {Math.round(sum(draft.items, "calories"))} kcal · P {Math.round(sum(draft.items, "protein"))} · C {Math.round(sum(draft.items, "carbs"))} · F {Math.round(sum(draft.items, "fat"))}
        </span>
        <button onClick={onSave} disabled={busy || !draft.items.some((i) => i.name.trim())} className="min-btn">
          {busy ? "…" : "Save"}
        </button>
      </div>
    </div>
  );
}

export default function NutritionPanel() {
  const [date, setDate] = useState(() => iso(new Date()));
  const [day, setDay] = useState<Day | null>(null);
  const [text, setText] = useState("");
  const [slot, setSlot] = useState<string>(slotNow);
  const [estimating, setEstimating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/nutrition?date=${date}`);
    if (res.ok) setDay(await res.json());
  }, [date]);
  useLoad(load);
  useOnDataChanged(load);
  // Meals logged in chat are filled in in the background: refresh while some are missing.
  useEffect(() => {
    if (!day?.missing) return;
    const t = setTimeout(() => void load(), 6000);
    return () => clearTimeout(t);
  }, [day, load]);

  function shift(days: number) {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + days);
    setDate(iso(d));
  }

  async function estimate(description: string, base?: Partial<Draft>, amounts: Record<number, string> = {}) {
    setError(null);
    setEstimating(base?.id ?? "new");
    try {
      const res = await post("/api/nutrition/estimate", "POST", { text: description, amounts });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't estimate that");
      setDraft({ name: base?.name ?? data.name, category: base?.category ?? slot, items: data.items, source: "ai", id: base?.id, text: description, questions: data.questions, amounts });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't estimate that");
    } finally {
      setEstimating(null);
    }
  }

  async function save(d: Draft) {
    const items = d.items.filter((i) => i.name.trim());
    const body = {
      name: d.name.trim() || items.map((i) => i.name).join(", ").slice(0, 120) || "Meal",
      category: d.category,
      items,
      calories: Math.round(sum(items, "calories")),
      protein: Math.round(sum(items, "protein") * 10) / 10,
      carbs: Math.round(sum(items, "carbs") * 10) / 10,
      fat: Math.round(sum(items, "fat") * 10) / 10,
      micros: sumMicros(items.map((i) => i.micros)),
      nutritionSource: d.source,
      ...(d.text ? { sourceText: d.text } : {}),
    };
    const when = date === iso(new Date()) ? new Date() : new Date(`${date}T12:00:00`);
    const res = d.id ? await post(`/api/meals/${d.id}`, "PATCH", body) : await post("/api/meals", "POST", { ...body, status: "eaten", plannedFor: when.toISOString() });
    if (!res.ok) return setError((await res.json().catch(() => null))?.error ?? "Couldn't save");
    toast(d.id ? `Saved ${body.name}` : `Logged ${body.name}`);
    setDraft(null);
    setText("");
    await load();
  }

  async function remove(id: string) {
    report(await fetch(`/api/meals/${id}`, { method: "DELETE" }).catch(() => null), "Meal deleted");
    await load();
  }

  const isToday = date === iso(new Date());
  const label = new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_190px]">
      <div className="min-w-0">
        <div className="mb-3 flex items-center gap-1 text-sm">
          <button onClick={() => shift(-1)} aria-label="Previous day" className="rounded p-1" style={{ color: "var(--ink-400)" }}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="w-28 text-center" style={{ color: "var(--ink-100)" }}>
            {isToday ? "Today" : label}
          </span>
          <button onClick={() => shift(1)} aria-label="Next day" className="rounded p-1" style={{ color: "var(--ink-400)" }}>
            <ChevronRight className="h-4 w-4" />
          </button>
          {!isToday && (
            <button onClick={() => setDate(iso(new Date()))} className="ml-1 text-xs" style={{ color: "var(--accent)" }}>
              Back to today
            </button>
          )}
        </div>

        {!draft && (
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && text.trim().length > 1 && !estimating && void estimate(text)}
                placeholder="What did you eat? e.g. 6 oz chicken, 1 cup rice and broccoli"
                aria-label="Describe what you ate"
                className="min-input flex-1"
              />
              <select value={slot} onChange={(e) => setSlot(e.target.value)} aria-label="Meal" className="bg-transparent text-xs capitalize outline-none" style={{ color: "var(--ink-400)" }}>
                {SLOTS.map((s) => (
                  <option key={s} value={s} className="bg-[#0f1525]">
                    {s}
                  </option>
                ))}
              </select>
              <button onClick={() => void estimate(text)} disabled={text.trim().length < 2 || Boolean(estimating)} className="min-btn flex items-center gap-1">
                {estimating === "new" && <Loader2 className="h-3 w-3 animate-spin" />}Add
              </button>
            </div>
            <button onClick={() => setDraft({ name: text.trim(), category: slot, items: [blankItem()], source: "manual" })} className="mt-1 text-xs" style={{ color: "var(--ink-500)" }}>
              or enter numbers yourself
            </button>
            {error && <p className="mt-1 text-xs" style={{ color: "var(--bad)" }}>{error}</p>}
          </div>
        )}

        {draft && (
          <DraftEditor
            draft={draft}
            busy={Boolean(estimating)}
            onChange={setDraft}
            onAnswer={(key, amount) => void estimate(draft.text ?? draft.name, { id: draft.id, name: draft.name, category: draft.category }, { ...(draft.amounts ?? {}), [key]: amount })}
            onSave={() => void save(draft)}
            onCancel={() => (setDraft(null), setError(null))}
          />
        )}

        {day?.meals.length === 0 ? (
          <p className="py-3 text-sm" style={{ color: "var(--ink-500)" }}>
            Nothing logged {isToday ? "today" : "this day"}.
          </p>
        ) : (
          <ul>
            {day?.meals.map((m) => (
              <li key={m.id} className="group min-row">
                <span className="w-16 flex-shrink-0 text-xs capitalize" style={{ color: "var(--ink-500)" }}>
                  {m.category}
                </span>
                <span className="min-w-0 flex-1 truncate" style={{ color: "var(--ink-100)" }}>
                  {m.name}
                </span>
                <span className="text-xs tabular-nums" style={{ color: "var(--ink-400)" }}>
                  {m.calories === null ? (
                    <button onClick={() => void estimate(m.sourceText ?? m.name, { id: m.id, name: m.name, category: m.category })} style={{ color: "var(--accent)" }}>
                      {estimating === m.id ? "…" : "Estimate"}
                    </button>
                  ) : (
                    `${m.calories} kcal · P ${Math.round(m.protein ?? 0)}`
                  )}
                </span>
                <button
                  onClick={() =>
                    setDraft({ id: m.id, name: m.name, category: m.category, text: m.sourceText ?? undefined, items: m.items?.length ? m.items : [{ ...blankItem(), name: m.name, calories: m.calories ?? 0, protein: m.protein ?? 0, carbs: m.carbs ?? 0, fat: m.fat ?? 0 }], source: "manual" })
                  }
                  aria-label={`Edit ${m.name}`}
                  className="opacity-50 group-hover:opacity-100"
                  style={{ color: "var(--ink-500)" }}
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button onClick={() => void remove(m.id)} aria-label={`Delete ${m.name}`} className="opacity-50 group-hover:opacity-100" style={{ color: "var(--ink-500)" }}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <NutrientColumn day={day} onSaved={load} />
    </div>
  );
}
