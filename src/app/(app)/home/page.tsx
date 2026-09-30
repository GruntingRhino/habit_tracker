"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { format, isPast } from "date-fns";
import { ArrowRight, Lightbulb } from "lucide-react";
import NewsTerminal, { type NewsData } from "@/components/NewsTerminal";
import ScoreBoard from "@/components/ScoreBoard";
import { Checkbox, Section } from "@/components/ui";
import { useLoad, useOnDataChanged } from "@/hooks/useAssistantChat";

interface Block {
  start: string;
  end: string;
  title: string;
  kind: string;
  done?: boolean;
}
interface Todo {
  id: string;
  title: string;
  dueAt: string | null;
  priority: string;
}
interface Habit {
  id: string;
  name: string;
  targetDays: string[];
  logs: { date: string; completed: boolean }[];
}
type News = NewsData;
interface Nudge {
  id: string;
  title: string;
  body: string | null;
}
interface Food {
  totals: { calories: number; protein: number };
  targets: { calories?: number | null; protein?: number | null } | null;
  meals: unknown[];
}

const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
function fmt12(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}
const ymd = (d: Date) => format(d, "yyyy-MM-dd");
const dayKey = (d: Date) => format(d, "EEE").toLowerCase().slice(0, 3);
async function json<T>(url: string, fallback: T): Promise<T> {
  const res = await fetch(url, { cache: "no-store" }).catch(() => null);
  return res?.ok ? res.json() : fallback;
}

/** Home: the landing page — scores, what's next, what's due, habits, food, news, what it noticed. */
export default function HomePage() {
  const [blocks, setBlocks] = useState<{ blocks: Block[]; allDay: { id: string; title: string }[] } | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [news, setNews] = useState<News | null>(null);
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [food, setFood] = useState<Food | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const [s, t, h, n, u, f] = await Promise.all([
      json<{ schedule: { blocks: Block[]; allDay: { id: string; title: string }[] } } | null>("/api/schedule", null),
      json<Todo[]>("/api/todos?status=open", []),
      json<Habit[]>("/api/habits", []),
      json<News | null>("/api/news", null),
      json<Nudge[]>("/api/nudges", []),
      json<Food | null>("/api/nutrition", null),
    ]);
    setBlocks(s?.schedule ?? null);
    setTodos(t);
    setHabits(h);
    setNews(n);
    setNudges(u);
    setFood(f);
    setNow(new Date());
  }, []);
  useLoad(load);
  useOnDataChanged(load);

  const nowMin = now ? now.getHours() * 60 + now.getMinutes() : 0;
  const next = (blocks?.blocks ?? []).filter((b) => toMin(b.end) > nowMin && b.kind !== "wind-down").slice(0, 4);
  const endOfToday = now ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) : null;
  const due = todos.filter((t) => t.dueAt && endOfToday && new Date(t.dueAt) < endOfToday).slice(0, 6);
  const todays = now ? habits.filter((h) => h.targetDays.includes(dayKey(now))) : [];
  const doneHabit = (h: Habit) => !!now && h.logs.some((l) => l.completed && ymd(new Date(l.date)) === ymd(now));
  const hour = now?.getHours() ?? 12;

  async function refreshNews() {
    const res = await fetch("/api/news", { method: "POST" }).catch(() => null);
    if (res?.ok) setNews(await res.json());
  }
  async function tickTodo(t: Todo) {
    setTodos((l) => l.filter((x) => x.id !== t.id));
    await fetch(`/api/todos/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "done" }) });
    window.dispatchEvent(new CustomEvent("liveimproved:changed"));
  }
  async function toggleHabit(h: Habit) {
    await fetch(`/api/habits/${h.id}/log`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completed: !doneHabit(h) }) });
    window.dispatchEvent(new CustomEvent("liveimproved:changed"));
    await load();
  }

  return (
    <div className="mx-auto max-w-[45rem] lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-8">
      <div className="min-w-0">
      <h1 className="min-h1 mb-0.5">{hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}, Abhay</h1>
      <p className="min-sub mb-4">{now ? format(now, "EEEE, MMMM d") : ""}</p>

      <div className="mb-6 flex justify-center">
        <ScoreBoard />
      </div>

      {/* Phones: the news sits right under the scores. */}
      <div className="lg:hidden">
        <NewsTerminal news={news} onRefresh={refreshNews} />
      </div>

      <Section label="Up next">
        {blocks?.allDay.length ? <p className="mb-1 text-xs" style={{ color: "#f472b6" }}>All day: {blocks.allDay.map((e) => e.title).join(", ")}</p> : null}
        {next.length ? (
          <ul>
            {next.map((b) => (
              <li key={`${b.start}-${b.title}`} className="min-row">
                <span className="w-24 flex-shrink-0 text-xs tabular-nums" style={{ color: toMin(b.start) <= nowMin ? "var(--accent)" : "var(--ink-500)" }}>
                  {toMin(b.start) <= nowMin ? "Now" : fmt12(b.start)}
                </span>
                <span className={b.done ? "line-through" : ""} style={{ color: b.done ? "var(--ink-600)" : "var(--ink-200)" }}>
                  {b.title}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="min-sub">Nothing else today.</p>
        )}
        <Link href="/schedule" className="min-link mt-1 inline-flex items-center gap-1 text-xs">
          Full schedule <ArrowRight className="h-3 w-3" />
        </Link>
      </Section>

      {due.length > 0 && (
        <Section label="Due today">
          <ul>
            {due.map((t) => (
              <li key={t.id} className="min-row">
                <Checkbox checked={false} onClick={() => tickTodo(t)} label={`Done: ${t.title}`} />
                <span className="flex-1" style={{ color: "var(--ink-200)" }}>
                  {t.title}
                </span>
                <span className="text-xs" style={{ color: t.dueAt && isPast(new Date(t.dueAt)) ? "var(--bad)" : "var(--ink-500)" }}>
                  {t.dueAt ? format(new Date(t.dueAt), "h:mm a") : ""}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {todays.length > 0 && (
        <Section label={`Habits · ${todays.filter(doneHabit).length}/${todays.length}`}>
          <div className="flex flex-wrap gap-1.5">
            {todays.map((h) => (
              <button key={h.id} onClick={() => toggleHabit(h)} aria-pressed={doneHabit(h)} className="min-chip" style={doneHabit(h) ? { background: "var(--ink-100)", color: "var(--bg-base)" } : undefined}>
                {doneHabit(h) ? "✓ " : ""}
                {h.name}
              </button>
            ))}
          </div>
        </Section>
      )}

      {food && (
        <Section label="Food today">
          <p className="text-sm" style={{ color: "var(--ink-200)" }}>
            {Math.round(food.totals.calories)}
            {food.targets?.calories ? ` / ${food.targets.calories}` : ""} kcal · {Math.round(food.totals.protein)}
            {food.targets?.protein ? ` / ${food.targets.protein}` : ""} g protein
            <span className="min-sub"> · {food.meals.length} meal{food.meals.length === 1 ? "" : "s"}</span>
          </p>
          <Link href="/meals" className="min-link mt-1 inline-flex items-center gap-1 text-xs">
            Log food <ArrowRight className="h-3 w-3" />
          </Link>
        </Section>
      )}

      {nudges.length > 0 && (
        <Section label="Noticed">
          <ul>
            {nudges.slice(0, 3).map((n) => (
              <li key={n.id} className="min-row items-start">
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" style={{ color: "#fbbf24" }} />
                <div>
                  <p style={{ color: "var(--ink-200)" }}>{n.title}</p>
                  {n.body && <p className="min-sub">{n.body}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      </div>
      {/* Desktop: its own column, pinned while the page scrolls. */}
      <aside className="hidden lg:block">
        <div className="sticky top-4">
          <NewsTerminal news={news} onRefresh={refreshNews} />
        </div>
      </aside>
    </div>
  );
}
