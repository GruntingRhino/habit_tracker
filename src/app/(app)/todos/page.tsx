"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Check, Plus, Trash2 } from "lucide-react";
import { format, isPast, isToday, isTomorrow } from "date-fns";
import { AREAS, AREA_META, PRIORITIES, PRIORITY_RANK, type Area } from "@/lib/areas";
import { useOnDataChanged } from "@/hooks/useAssistantChat";

interface Todo {
  id: string;
  title: string;
  area: Area;
  priority: string;
  status: "open" | "done";
  dueAt: string | null;
  completedAt: string | null;
  reminders?: { id: string; fireAt: string }[];
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "var(--bad)",
  high: "var(--warn)",
  medium: "var(--ink-400)",
  low: "var(--ink-600)",
};

function dueLabel(dueAt: string | null) {
  if (!dueAt) return null;
  const d = new Date(dueAt);
  const time = d.getHours() || d.getMinutes() ? format(d, " h:mma").toLowerCase() : "";
  if (isToday(d)) return { text: `today${time}`, late: isPast(d) };
  if (isTomorrow(d)) return { text: `tomorrow${time}`, late: false };
  return { text: format(d, "EEE MMM d") + time, late: isPast(d) };
}

function sortTodos(a: Todo, b: Todo) {
  const pr = (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2);
  if (pr) return pr;
  return (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity);
}

export default function TodosPage() {
  const [tab, setTab] = useState<"open" | "done">("open");
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<Set<string>>(new Set());
  const [newTitle, setNewTitle] = useState("");
  const [newArea, setNewArea] = useState<Area>("general");

  const load = useCallback(async () => {
    const res = await fetch(`/api/todos?status=${tab}`);
    if (res.ok) setTodos(await res.json());
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/todos?status=${tab}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((list: Todo[]) => {
        if (!alive) return;
        setTodos(list);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => {
      alive = false;
    };
  }, [tab]);
  useOnDataChanged(load);

  const grouped = useMemo(() => {
    const map = new Map<Area, Todo[]>();
    for (const t of [...todos].sort(sortTodos)) {
      const list = map.get(t.area) ?? [];
      list.push(t);
      map.set(t.area, list);
    }
    return AREAS.filter((a) => map.has(a)).map((a) => [a, map.get(a)!] as const);
  }, [todos]);

  async function patch(id: string, data: Partial<Todo>) {
    await fetch(`/api/todos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async function toggle(todo: Todo) {
    const next = todo.status === "open" ? "done" : "open";
    setCompleting((s) => new Set(s).add(todo.id));
    await patch(todo.id, { status: next });
    setTimeout(() => {
      setTodos((list) => list.filter((t) => t.id !== todo.id));
      setCompleting((s) => {
        const n = new Set(s);
        n.delete(todo.id);
        return n;
      });
    }, 450);
  }

  async function update(todo: Todo, data: Partial<Todo>) {
    setTodos((list) => list.map((t) => (t.id === todo.id ? { ...t, ...data } : t)));
    await patch(todo.id, data);
  }

  async function remove(todo: Todo) {
    setTodos((list) => list.filter((t) => t.id !== todo.id));
    await fetch(`/api/todos/${todo.id}`, { method: "DELETE" });
  }

  async function add() {
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle("");
    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, area: newArea }),
    });
    if (res.ok && tab === "open") {
      const created = (await res.json()) as Todo;
      setTodos((list) => [...list, created]);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--ink-100)" }}>
            To-dos
          </h1>
          <p className="text-sm" style={{ color: "var(--ink-400)" }}>
            Sorted by priority, then due date. Add from chat or Telegram too.
          </p>
        </div>
        <div className="flex rounded-xl p-1" style={{ background: "var(--bg-elev-1)", border: "1px solid var(--stroke-1)" }}>
          {(["open", "done"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                if (t === tab) return;
                setLoading(true);
                setTab(t);
              }}
              className="rounded-lg px-3 py-1.5 text-sm capitalize"
              style={tab === t ? { background: "var(--accent-muted)", color: "var(--ink-100)" } : { color: "var(--ink-400)" }}
            >
              {t === "open" ? "Active" : "Completed"}
            </button>
          ))}
        </div>
      </div>

      {tab === "open" && (
        <div className="mb-6 flex gap-2 rounded-2xl p-2" style={{ background: "var(--bg-elev-1)", border: "1px solid var(--stroke-2)" }}>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Add a to-do…"
            className="flex-1 bg-transparent px-2 text-sm outline-none"
            style={{ color: "var(--ink-100)" }}
          />
          <select
            value={newArea}
            onChange={(e) => setNewArea(e.target.value as Area)}
            className="rounded-lg bg-transparent px-2 text-xs outline-none"
            style={{ color: "var(--ink-300)", border: "1px solid var(--stroke-2)" }}
          >
            {AREAS.map((a) => (
              <option key={a} value={a} className="bg-[#0f1525]">
                {AREA_META[a].label}
              </option>
            ))}
          </select>
          <button onClick={add} className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--accent)" }} aria-label="Add">
            <Plus className="h-4 w-4 text-white" />
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: "var(--ink-500)" }}>Loading…</p>
      ) : grouped.length === 0 ? (
        <p className="py-12 text-center text-sm" style={{ color: "var(--ink-500)" }}>
          {tab === "open" ? "Nothing open. 🎉" : "Nothing completed yet."}
        </p>
      ) : (
        <div className="space-y-6">
          {grouped.map(([area, list]) => (
            <section key={area}>
              <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: AREA_META[area].color }}>
                <span className="h-2 w-2 rounded-full" style={{ background: AREA_META[area].color }} />
                {AREA_META[area].label}
                <span style={{ color: "var(--ink-600)" }}>{list.length}</span>
              </h2>
              <ul className="space-y-1.5">
                {list.map((todo) => {
                  const due = dueLabel(todo.dueAt);
                  const done = todo.status === "done" || completing.has(todo.id);
                  return (
                    <li
                      key={todo.id}
                      className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-300 ${completing.has(todo.id) ? "translate-x-2 opacity-0" : ""}`}
                      style={{ background: "var(--bg-elev-1)", border: "1px solid var(--stroke-1)" }}
                    >
                      <button
                        onClick={() => toggle(todo)}
                        aria-label={done ? "Mark open" : "Mark done"}
                        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full transition-all"
                        style={{
                          border: `1.5px solid ${done ? "var(--good)" : "var(--stroke-3)"}`,
                          background: done ? "var(--good)" : "transparent",
                        }}
                      >
                        <Check className={`h-3 w-3 transition-opacity ${done ? "text-black opacity-100" : "opacity-0 group-hover:opacity-60"}`} style={{ color: done ? "#000" : "var(--ink-300)" }} />
                      </button>
                      <span className={`flex-1 text-sm ${done ? "line-through" : ""}`} style={{ color: done ? "var(--ink-500)" : "var(--ink-100)" }}>
                        {todo.title}
                      </span>
                      {todo.reminders && todo.reminders.length > 0 && <Bell className="h-3.5 w-3.5" style={{ color: "var(--blue-200)" }} />}
                      {due && (
                        <span className="text-xs" style={{ color: due.late && tab === "open" ? "var(--bad)" : "var(--ink-400)" }}>
                          {due.text}
                        </span>
                      )}
                      {tab === "open" && (
                        <>
                          <select
                            value={todo.priority}
                            onChange={(e) => update(todo, { priority: e.target.value })}
                            className="bg-transparent text-xs outline-none"
                            style={{ color: PRIORITY_COLOR[todo.priority] }}
                          >
                            {PRIORITIES.map((p) => (
                              <option key={p} value={p} className="bg-[#0f1525]">
                                {p}
                              </option>
                            ))}
                          </select>
                          <select
                            value={todo.area}
                            onChange={(e) => update(todo, { area: e.target.value as Area })}
                            className="hidden bg-transparent text-xs outline-none group-hover:block"
                            style={{ color: "var(--ink-400)" }}
                          >
                            {AREAS.map((a) => (
                              <option key={a} value={a} className="bg-[#0f1525]">
                                {AREA_META[a].label}
                              </option>
                            ))}
                          </select>
                        </>
                      )}
                      {tab === "done" && todo.completedAt && (
                        <span className="text-xs" style={{ color: "var(--ink-500)" }}>
                          {format(new Date(todo.completedAt), "MMM d")}
                        </span>
                      )}
                      <button onClick={() => remove(todo)} aria-label="Delete" className="opacity-0 transition-opacity group-hover:opacity-100">
                        <Trash2 className="h-3.5 w-3.5" style={{ color: "var(--ink-500)" }} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
