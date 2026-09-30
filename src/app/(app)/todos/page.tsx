"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { format, isPast, isToday, isTomorrow } from "date-fns";
import { ChevronRight, Loader2, Sparkles, X } from "lucide-react";
import { AREAS, AREA_META, PRIORITIES, PRIORITY_RANK, type Area } from "@/lib/areas";
import { AreaDot, Checkbox, Empty, InlineAdd, PageHeader, Section, Tabs } from "@/components/ui";
import { useLoad, useOnDataChanged } from "@/hooks/useAssistantChat";
import SchedulePanel from "@/components/SchedulePanel";

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
interface Project {
  id: string;
  title: string;
  area: string;
  priority: string;
  status: string;
  deadline: string | null;
  taskCount: number;
  completedTaskCount: number;
}
interface Task {
  id: string;
  title: string;
  status: string;
  parentTaskId: string | null;
}

function when(date: string | null) {
  if (!date) return null;
  const d = new Date(date);
  const time = d.getHours() !== 9 || d.getMinutes() ? ` ${format(d, "h:mm a")}` : "";
  if (isToday(d)) return { text: `Today${time}`, late: isPast(d) };
  if (isTomorrow(d)) return { text: `Tomorrow${time}`, late: false };
  return { text: `${format(d, "EEE, MMM d")}${time}`, late: isPast(d) };
}

const byPriority = (a: { priority: string; due?: string | null }, b: { priority: string; due?: string | null }) =>
  (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2) ||
  (a.due ? new Date(a.due).getTime() : Infinity) - (b.due ? new Date(b.due).getTime() : Infinity);

const PRIORITY_MARK: Record<string, string> = { urgent: "!!", high: "!" };

async function json<T>(url: string, fallback: T): Promise<T> {
  const res = await fetch(url);
  return res.ok ? res.json() : fallback;
}
const send = (url: string, method: string, body?: unknown) =>
  fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

function ProjectRow({ project, open, onToggle, onChanged }: { project: Project; open: boolean; onToggle: () => void; onChanged: () => void }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => setTasks(await json<Task[]>(`/api/projects/${project.id}/tasks`, [])), [project.id]);
  useLoad(load, open);

  const top = (tasks ?? []).filter((t) => !t.parentTaskId);
  const due = project.deadline ? { text: format(new Date(project.deadline), "MMM d"), late: isPast(new Date(project.deadline)) } : null;
  const done = project.status === "completed";

  async function toggleTask(t: Task) {
    setTasks((l) => l?.map((x) => (x.id === t.id ? { ...x, status: x.status === "completed" ? "todo" : "completed" } : x)) ?? null);
    await send(`/api/projects/${project.id}/tasks/${t.id}`, "PATCH", { status: t.status === "completed" ? "todo" : "completed" });
    onChanged();
  }
  async function removeTask(t: Task) {
    setTasks((l) => l?.filter((x) => x.id !== t.id) ?? null);
    await send(`/api/projects/${project.id}/tasks/${t.id}`, "DELETE");
    onChanged();
  }
  async function addTask(title: string) {
    const res = await send(`/api/projects/${project.id}/tasks`, "POST", { title });
    if (res.ok) {
      await load();
      onChanged();
    }
  }
  async function breakDown() {
    setBusy(true);
    setError(null);
    const res = await send(`/api/projects/${project.id}/generate`, "POST", {});
    if (!res.ok) setError((await res.json().catch(() => null))?.error ?? "Couldn't break it down");
    await load();
    onChanged();
    setBusy(false);
  }
  async function setStatus(status: "completed" | "active") {
    await send(`/api/projects/${project.id}`, "PATCH", { status });
    onChanged();
  }
  async function remove() {
    if (!window.confirm(`Delete "${project.title}" and its tasks?`)) return;
    await send(`/api/projects/${project.id}`, "DELETE");
    onChanged();
  }

  return (
    <li className="border-b" style={{ borderColor: "var(--stroke-1)" }}>
      <div className="group flex items-center gap-2.5 py-2 text-sm">
        <Checkbox checked={done} onClick={() => setStatus(done ? "active" : "completed")} label={done ? "Reopen project" : "Complete project"} />
        <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-1.5 text-left" aria-expanded={open}>
          <ChevronRight className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${open ? "rotate-90" : ""}`} style={{ color: "var(--ink-500)" }} />
          <span className={`truncate ${done ? "line-through" : ""}`} style={{ color: done ? "var(--ink-600)" : "var(--ink-100)" }}>
            {PRIORITY_MARK[project.priority] && (
              <span className="mr-1 font-semibold" style={{ color: project.priority === "urgent" ? "var(--bad)" : "var(--warn)" }}>
                {PRIORITY_MARK[project.priority]}
              </span>
            )}
            {project.title}
          </span>
        </button>
        <span className="text-xs tabular-nums" style={{ color: "var(--ink-500)" }}>
          {project.completedTaskCount}/{project.taskCount}
        </span>
        {due && !done && (
          <span className="text-xs" style={{ color: due.late ? "var(--bad)" : "var(--ink-500)" }}>
            {due.text}
          </span>
        )}
        <button onClick={remove} aria-label={`Delete ${project.title}`} className="hidden group-hover:block">
          <X className="h-3.5 w-3.5" style={{ color: "var(--ink-500)" }} />
        </button>
        <AreaDot area={project.area} />
      </div>
      {open && (
        <div className="mb-2 ml-7">
          {tasks === null ? (
            <p className="min-sub py-1">Loading…</p>
          ) : (
            <ul>
              {top.map((t) => (
                <li key={t.id} className="group flex items-center gap-2.5 py-1 text-sm">
                  <Checkbox checked={t.status === "completed"} onClick={() => toggleTask(t)} label={t.status === "completed" ? "Reopen task" : "Complete task"} />
                  <span className={`flex-1 ${t.status === "completed" ? "line-through" : ""}`} style={{ color: t.status === "completed" ? "var(--ink-600)" : "var(--ink-200)" }}>
                    {t.title}
                  </span>
                  <button onClick={() => removeTask(t)} aria-label={`Delete ${t.title}`} className="hidden group-hover:block">
                    <X className="h-3 w-3" style={{ color: "var(--ink-500)" }} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-3">
            <InlineAdd placeholder="Add a step" onAdd={addTask} className="py-1 text-[13px]" />
            {top.length === 0 && (
              <button onClick={breakDown} disabled={busy} className="min-chip flex flex-shrink-0 items-center gap-1 disabled:opacity-50">
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Break into steps
              </button>
            )}
          </div>
          {error && <p className="mt-1 text-xs" style={{ color: "var(--bad)" }}>{error}</p>}
        </div>
      )}
    </li>
  );
}

function TasksPage() {
  const params = useSearchParams();
  const initial = params.get("tab");
  const [tab, setTab] = useState<"today" | "open" | "done">(initial === "open" || initial === "done" ? initial : params.get("project") ? "open" : "today");
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [openProject, setOpenProject] = useState<string | null>(params.get("project"));
  const [leaving, setLeaving] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (tab === "today") return;
    const [t, r, p] = await Promise.all([json<Todo[]>(`/api/todos?status=${tab}`, []), json<Reminder[]>("/api/reminders", []), json<Project[]>("/api/projects", [])]);
    setTodos(t);
    setReminders(r);
    setProjects(p);
  }, [tab]);
  useLoad(load);
  useOnDataChanged(load);

  const grouped = useMemo(() => {
    const map = new Map<Area, Todo[]>();
    for (const t of [...(todos ?? [])].sort((a, b) => byPriority({ priority: a.priority, due: a.dueAt }, { priority: b.priority, due: b.dueAt })))
      map.set(t.area, [...(map.get(t.area) ?? []), t]);
    return tab === "today" ? [] : AREAS.filter((a) => map.has(a)).map((a) => [a, map.get(a)!] as const);
  }, [todos, tab]);

  const shownProjects = projects
    .filter((p) => tab !== "today" && (tab === "open" ? !["completed", "archived"].includes(p.status) : p.status === "completed"))
    .sort((a, b) => byPriority({ priority: a.priority, due: a.deadline }, { priority: b.priority, due: b.deadline }));

  async function toggle(todo: Todo) {
    setLeaving((s) => new Set(s).add(todo.id));
    await send(`/api/todos/${todo.id}`, "PATCH", { status: todo.status === "open" ? "done" : "open" });
    setTimeout(() => {
      setTodos((l) => l?.filter((t) => t.id !== todo.id) ?? null);
      setLeaving((s) => {
        const n = new Set(s);
        n.delete(todo.id);
        return n;
      });
    }, 300);
  }
  async function setPriority(todo: Todo, priority: string) {
    setTodos((l) => l?.map((t) => (t.id === todo.id ? { ...t, priority } : t)) ?? null);
    await send(`/api/todos/${todo.id}`, "PATCH", { priority });
  }
  async function remove(todo: Todo) {
    setTodos((l) => l?.filter((t) => t.id !== todo.id) ?? null);
    await send(`/api/todos/${todo.id}`, "DELETE");
  }
  async function cancelReminder(id: string) {
    setReminders((l) => l.filter((r) => r.id !== id));
    await send(`/api/reminders/${id}`, "DELETE");
  }
  async function add(title: string) {
    // "project: launch website" makes a project; anything else is a to-do.
    const m = /^project:\s*(.+)$/i.exec(title);
    if (m) {
      const res = await send("/api/projects", "POST", { title: m[1] });
      if (res.ok) {
        const created = (await res.json()) as Project;
        setOpenProject(created.id);
        await load();
      }
      return;
    }
    const res = await send("/api/todos", "POST", { title });
    if (res.ok) {
      const created = (await res.json()) as Todo;
      setTodos((l) => [...(l ?? []), created]);
    }
  }

  return (
    <div className="min-page">
      <PageHeader title="Tasks" action={<Tabs value={tab} options={[["today", "Today"], ["open", "Open"], ["done", "Done"]]} onChange={setTab} />} />
      {tab === "today" && <SchedulePanel />}

      {tab === "open" && <InlineAdd placeholder='Add a to-do (or "project: …")' onAdd={add} className="mb-5" />}

      {tab === "open" && reminders.length > 0 && (
        <Section label="Reminders">
          <ul>
            {reminders.map((r) => (
              <li key={r.id} className="group min-row">
                <span className="flex-1" style={{ color: "var(--ink-200)" }}>
                  {r.text}
                </span>
                <span className="text-xs" style={{ color: "var(--ink-500)" }}>
                  {when(r.fireAt)?.text}
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

      {tab === "today" ? null : todos === null ? (
        <p className="min-sub">Loading…</p>
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
                    <span className={`min-w-0 flex-1 ${done ? "line-through" : ""}`} style={{ color: done ? "var(--ink-600)" : "var(--ink-100)" }}>
                      {PRIORITY_MARK[todo.priority] && (
                        <span className="mr-1 font-semibold" style={{ color: todo.priority === "urgent" ? "var(--bad)" : "var(--warn)" }}>
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

      {shownProjects.length > 0 && (
        <Section label="Projects">
          <ul>
            {shownProjects.map((p) => (
              <ProjectRow key={p.id} project={p} open={openProject === p.id} onToggle={() => setOpenProject(openProject === p.id ? null : p.id)} onChanged={load} />
            ))}
          </ul>
        </Section>
      )}

      {tab !== "today" && todos !== null && grouped.length === 0 && shownProjects.length === 0 && <Empty>{tab === "open" ? "All clear." : "Nothing completed yet."}</Empty>}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <TasksPage />
    </Suspense>
  );
}
