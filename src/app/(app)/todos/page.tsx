"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, isPast, isToday, isTomorrow } from "date-fns";
import { X } from "lucide-react";
import { AREAS, AREA_META, PRIORITIES, PRIORITY_RANK, type Area } from "@/lib/areas";
import { AreaDot, Checkbox, Empty, PageHeader, Section, Tabs } from "@/components/ui";
import { useOnDataChanged } from "@/hooks/useAssistantChat";

interface Todo {
  id: string;
  title: string;
  area: Area;
  priority: string;
  status: "open" | "done";
  dueAt: string | null;
  completedAt: string | null;
}

interface Reminder {
  id: string;
  text: string;
  fireAt: string;
  recurrence: string;
}

function when(date: string | null) {
  if (!date) return null;
  const d = new Date(date);
  const time = d.getHours() !== 9 || d.getMinutes() ? ` ${format(d, "h:mm a")}` : "";
  if (isToday(d)) return { text: `Today${time}`, late: isPast(d) };
  if (isTomorrow(d)) return { text: `Tomorrow${time}`, late: false };
  return { text: `${format(d, "EEE, MMM d")}${time}`, late: isPast(d) };
}

function sortTodos(a: Todo, b: Todo) {
  const pr = (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2);
  if (pr) return pr;
  return (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity);
}

const PRIORITY_MARK: Record<string, string> = { urgent: "!!", high: "!", medium: "", low: "" };

async function fetchJson<T>(url: string, fallback: T): Promise<T> {
  const res = await fetch(url);
  return res.ok ? res.json() : fallback;
}

export default function TodosPage() {
  const [tab, setTab] = useState<"open" | "done">("open");
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");

  const load = useCallback(async () => {
    const [t, r] = await Promise.all([fetchJson<Todo[]>(`/api/todos?status=${tab}`, []), fetchJson<Reminder[]>("/api/reminders", [])]);
    setTodos(t);
    setReminders(r);
  }, [tab]);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchJson<Todo[]>(`/api/todos?status=${tab}`, []), fetchJson<Reminder[]>("/api/reminders", [])]).then(([t, r]) => {
      if (!alive) return;
      setTodos(t);
      setReminders(r);
    });
    return () => {
      alive = false;
    };
  }, [tab]);
  useOnDataChanged(load);

  const grouped = useMemo(() => {
    const map = new Map<Area, Todo[]>();
    for (const t of [...(todos ?? [])].sort(sortTodos)) map.set(t.area, [...(map.get(t.area) ?? []), t]);
    return AREAS.filter((a) => map.has(a)).map((a) => [a, map.get(a)!] as const);
  }, [todos]);

  async function patch(id: string, data: Partial<Todo>) {
    await fetch(`/api/todos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  }

  async function toggle(todo: Todo) {
    setLeaving((s) => new Set(s).add(todo.id));
    await patch(todo.id, { status: todo.status === "open" ? "done" : "open" });
    setTimeout(() => {
      setTodos((list) => list?.filter((t) => t.id !== todo.id) ?? null);
      setLeaving((s) => {
        const n = new Set(s);
        n.delete(todo.id);
        return n;
      });
    }, 350);
  }

  async function setPriority(todo: Todo, priority: string) {
    setTodos((list) => list?.map((t) => (t.id === todo.id ? { ...t, priority } : t)) ?? null);
    await patch(todo.id, { priority });
  }

  async function remove(todo: Todo) {
    setTodos((list) => list?.filter((t) => t.id !== todo.id) ?? null);
    await fetch(`/api/todos/${todo.id}`, { method: "DELETE" });
  }

  async function cancelReminder(id: string) {
    setReminders((list) => list.filter((r) => r.id !== id));
    await fetch(`/api/reminders/${id}`, { method: "DELETE" });
  }

  async function add() {
    const value = title.trim();
    if (!value) return;
    setTitle("");
    const res = await fetch("/api/todos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: value }) });
    if (res.ok) {
      const created = (await res.json()) as Todo;
      setTodos((list) => [...(list ?? []), created]);
    }
  }

  return (
    <div className="min-page">
      <PageHeader title="To-dos" action={<Tabs value={tab} options={[["open", "Open"], ["done", "Done"]]} onChange={setTab} />} />

      {tab === "open" && (
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add a to-do"
          className="min-input mb-10"
        />
      )}

      {tab === "open" && reminders.length > 0 && (
        <Section label="Reminders">
          <ul>
            {reminders.map((r) => {
              const w = when(r.fireAt);
              return (
                <li key={r.id} className="group min-row">
                  <span className="flex-1 text-[15px]" style={{ color: "var(--ink-200)" }}>
                    {r.text}
                  </span>
                  <span className="text-xs" style={{ color: "var(--ink-500)" }}>
                    {w?.text}
                    {r.recurrence !== "none" ? ` · ${r.recurrence}` : ""}
                  </span>
                  <button onClick={() => cancelReminder(r.id)} aria-label="Cancel reminder" className="opacity-40 transition-opacity group-hover:opacity-100">
                    <X className="h-3.5 w-3.5" style={{ color: "var(--ink-400)" }} />
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {todos === null ? (
        <p className="min-sub">Loading…</p>
      ) : grouped.length === 0 ? (
        <Empty>{tab === "open" ? "All clear." : "Nothing completed yet."}</Empty>
      ) : (
        grouped.map(([area, list]) => (
          <Section key={area} label={AREA_META[area].label}>
            <ul>
              {list.map((todo) => {
                const due = when(todo.dueAt);
                const done = todo.status === "done" || leaving.has(todo.id);
                return (
                  <li key={todo.id} className={`group min-row transition-opacity duration-300 ${leaving.has(todo.id) ? "opacity-0" : ""}`}>
                    <Checkbox checked={done} onClick={() => toggle(todo)} label={done ? "Mark open" : "Mark done"} />
                    <span className={`min-w-0 flex-1 text-[15px] ${done ? "line-through" : ""}`} style={{ color: done ? "var(--ink-600)" : "var(--ink-100)" }}>
                      {PRIORITY_MARK[todo.priority] && (
                        <span className="mr-1.5 font-semibold" style={{ color: todo.priority === "urgent" ? "var(--bad)" : "var(--warn)" }}>
                          {PRIORITY_MARK[todo.priority]}
                        </span>
                      )}
                      {todo.title}
                    </span>
                    {tab === "open" && due && (
                      <span className="text-xs" style={{ color: due.late ? "var(--bad)" : "var(--ink-500)" }}>
                        {due.text}
                      </span>
                    )}
                    {tab === "done" && todo.completedAt && (
                      <span className="text-xs" style={{ color: "var(--ink-600)" }}>
                        {format(new Date(todo.completedAt), "MMM d")}
                      </span>
                    )}
                    {tab === "open" && (
                      <select
                        value={todo.priority}
                        onChange={(e) => setPriority(todo, e.target.value)}
                        aria-label="Priority"
                        className="hidden bg-transparent text-xs outline-none group-hover:block"
                        style={{ color: "var(--ink-500)" }}
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p} value={p} className="bg-[#0f1525]">
                            {p}
                          </option>
                        ))}
                      </select>
                    )}
                    <button onClick={() => remove(todo)} aria-label="Delete" className="hidden group-hover:block">
                      <X className="h-3.5 w-3.5" style={{ color: "var(--ink-500)" }} />
                    </button>
                    <AreaDot area={todo.area} />
                  </li>
                );
              })}
            </ul>
          </Section>
        ))
      )}
    </div>
  );
}
