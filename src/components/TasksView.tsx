"use client";

import { report } from "@/components/feedback";
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FolderPlus, X } from "lucide-react";
import { PRIORITY_RANK } from "@/lib/areas";
import { Empty, InlineAdd, Section, Tabs } from "@/components/ui";
import { useLoad, useOnDataChanged } from "@/hooks/useAssistantChat";
import { ProjectItem, TodoItem, send, whenLabel, type Project, type Todo } from "@/components/TaskItems";

interface Reminder {
  id: string;
  text: string;
  fireAt: string;
  recurrence: string;
}

type Ref = { type: "todo" | "project"; id: string };
type Row = { kind: "todo"; item: Todo; due: string | null; priority: string } | { kind: "project"; item: Project; due: string | null; priority: string };

async function json<T>(url: string, fallback: T): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  return res.ok ? res.json() : fallback;
}

/** Soonest due first, then priority; undated items after dated ones. */
const byDue = (a: Row, b: Row) =>
  (a.due ? new Date(a.due).getTime() : Infinity) - (b.due ? new Date(b.due).getTime() : Infinity) || (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2);

/** To-dos and projects in one list (Open / Done). */
export default function TasksView() {
  const params = useSearchParams();
  const [tab, setTab] = useState<"open" | "done">(params.get("show") === "done" ? "done" : "open");
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [openItem, setOpenItem] = useState<Ref | null>(params.get("project") ? { type: "project", id: params.get("project")! } : null);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [naming, setNaming] = useState(false);

  const load = useCallback(async () => {
    const [t, r, p] = await Promise.all([json<Todo[]>(`/api/todos?status=${tab}`, []), json<Reminder[]>("/api/reminders", []), json<Project[]>("/api/projects", [])]);
    setTodos(t);
    setReminders(r);
    setProjects(p);
  }, [tab]);
  useLoad(load);
  useOnDataChanged(load);

  const rows = useMemo<Row[]>(() => {
    if (!todos) return [];
    const ps = projects.filter((p) => (tab === "open" ? !["completed", "archived"].includes(p.status) : p.status === "completed"));
    return [
      ...todos.map((t) => ({ kind: "todo" as const, item: t, due: t.dueAt, priority: t.priority })),
      ...ps.map((p) => ({ kind: "project" as const, item: p, due: p.deadline, priority: p.priority })),
    ].sort(byDue);
  }, [todos, projects, tab]);

  const isOpen = (r: Ref) => openItem?.type === r.type && openItem.id === r.id;
  const toggleOpen = (r: Ref) => setOpenItem((cur) => (cur && cur.type === r.type && cur.id === r.id ? null : r));
  async function openAfterChange(r: Ref) {
    await load();
    setOpenItem(r);
  }

  async function complete(todo: Todo) {
    setLeaving((s) => new Set(s).add(todo.id));
    report(await send(`/api/todos/${todo.id}`, "PATCH", { status: todo.status === "open" ? "done" : "open" }), todo.status === "open" ? `✓ Done: ${todo.title}` : `Reopened "${todo.title}"`);
    window.dispatchEvent(new CustomEvent("liveimproved:changed"));
    setTimeout(() => {
      setTodos((l) => l?.filter((t) => t.id !== todo.id) ?? null);
      setLeaving((s) => {
        const n = new Set(s);
        n.delete(todo.id);
        return n;
      });
    }, 300);
  }
  async function cancelReminder(id: string) {
    setReminders((l) => l.filter((r) => r.id !== id));
    await send(`/api/reminders/${id}`, "DELETE");
  }
  async function add(title: string) {
    // "project: launch website" still makes a project; anything else is a to-do.
    const m = /^project:\s*(.+)$/i.exec(title);
    if (m) return newProject(m[1]);
    const res = await send("/api/todos", "POST", { title });
    if (res.ok) {
      const created = (await res.json()) as Todo;
      setTodos((l) => [...(l ?? []), created]);
    }
  }
  async function newProject(title: string) {
    const res = await send("/api/projects", "POST", { title });
    if (res.ok) {
      const created = (await res.json()) as Project;
      setNaming(false);
      await openAfterChange({ type: "project", id: created.id });
    }
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Tabs value={tab} options={[["open", "Open"], ["done", "Done"]]} onChange={setTab} />
      </div>

      {tab === "open" && (
        <div className="mb-5 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            {naming ? <InlineAdd placeholder="Project name" onAdd={newProject} /> : <InlineAdd placeholder="Add a to-do" onAdd={add} />}
          </div>
          {naming ? (
            <button onClick={() => setNaming(false)} aria-label="Cancel new project" className="flex-shrink-0 rounded p-1 hover:bg-white/[.06]" style={{ color: "var(--ink-400)" }}>
              <X className="h-4 w-4" />
            </button>
          ) : (
            <button onClick={() => setNaming(true)} className="min-chip flex flex-shrink-0 items-center gap-1">
              <FolderPlus className="h-3.5 w-3.5" /> New project
            </button>
          )}
        </div>
      )}

      {tab === "open" && reminders.length > 0 && (
        <Section label="Reminders">
          <ul>
            {reminders.map((r) => (
              <li key={r.id} className="group min-row">
                <span className="flex-1" style={{ color: "var(--ink-200)" }}>
                  {r.text}
                </span>
                <span className="text-xs" style={{ color: "var(--ink-500)" }}>
                  {whenLabel(r.fireAt)?.text}
                  {r.recurrence !== "none" ? ` · ${r.recurrence}` : ""}
                </span>
                <button onClick={() => cancelReminder(r.id)} aria-label="Cancel reminder" className="opacity-40 group-hover:opacity-100">
                  <X className="h-3.5 w-3.5" style={{ color: "var(--ink-400)" }} />
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {todos === null ? (
          <p className="min-sub">Loading…</p>
        ) : rows.length === 0 ? (
          <Empty>{tab === "open" ? "All clear." : "Nothing completed yet."}</Empty>
        ) : (
          <Section label={tab === "open" ? "To-dos & projects" : "Completed"}>
            <ul>
              {rows.map((r) =>
                r.kind === "todo" ? (
                  <TodoItem
                    key={`t-${r.item.id}`}
                    todo={r.item}
                    open={isOpen({ type: "todo", id: r.item.id })}
                    onToggleOpen={() => toggleOpen({ type: "todo", id: r.item.id })}
                    onChanged={load}
                    onOpenItem={openAfterChange}
                    leaving={leaving.has(r.item.id)}
                    onComplete={() => complete(r.item)}
                  />
                ) : (
                  <ProjectItem
                    key={`p-${r.item.id}`}
                    project={r.item}
                    open={isOpen({ type: "project", id: r.item.id })}
                    onToggleOpen={() => toggleOpen({ type: "project", id: r.item.id })}
                    onChanged={load}
                    onOpenItem={openAfterChange}
                  />
                )
              )}
            </ul>
          </Section>
        )}
    </div>
  );
}
