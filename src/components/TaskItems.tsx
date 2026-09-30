"use client";

import { useCallback, useState } from "react";
import { format, isPast, isToday, isTomorrow } from "date-fns";
import { ChevronRight, FolderKanban, Loader2, Sparkles, X } from "lucide-react";
import { PRIORITIES } from "@/lib/areas";
import { AreaDot, Checkbox, InlineAdd } from "@/components/ui";
import { useLoad } from "@/hooks/useAssistantChat";

export interface Todo {
  id: string;
  title: string;
  notes: string | null;
  area: string;
  priority: string;
  status: "open" | "done";
  dueAt: string | null;
  completedAt: string | null;
}
export interface Project {
  id: string;
  title: string;
  description: string | null;
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
  dueDate: string | null;
}

export const send = (url: string, method: string, body?: unknown) =>
  fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

export function whenLabel(date: string | null) {
  if (!date) return null;
  const d = new Date(date);
  const time = d.getHours() || d.getMinutes() ? ` ${format(d, "h:mm a")}` : "";
  if (isToday(d)) return { text: `Today${time}`, late: isPast(d) };
  if (isTomorrow(d)) return { text: `Tomorrow${time}`, late: false };
  return { text: `${format(d, "EEE, MMM d")}${time}`, late: isPast(d) };
}

/** ISO → value for <input type="datetime-local"> (local time). */
const toLocalInput = (iso: string | null) => (iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : "");
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

const PRIORITY_MARK: Record<string, string> = { urgent: "!!", high: "!" };

function Mark({ priority }: { priority: string }) {
  return PRIORITY_MARK[priority] ? (
    <span className="mr-1 font-semibold" style={{ color: priority === "urgent" ? "var(--bad)" : "var(--warn)" }}>
      {PRIORITY_MARK[priority]}
    </span>
  ) : null;
}

interface AiResult {
  reply: string;
  changes: string[];
  item: { type: "todo" | "project"; id: string };
  snapshot: unknown;
}

/** "Ask AI…" on one item. It can take a minute (small local model). */
function AskAI({ type, id, onDone }: { type: "todo" | "project"; id: string; onDone: (item: { type: "todo" | "project"; id: string }) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(instruction: string) {
    if (!instruction.trim() || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    const res = await send("/api/items/ai", "POST", { type, id, instruction }).catch(() => null);
    const body = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res?.ok) return setError(body?.error ?? "Couldn't reach the AI.");
    setResult(body as AiResult);
    setText("");
    window.dispatchEvent(new CustomEvent("liveimproved:changed"));
    onDone((body as AiResult).item);
  }
  async function undo() {
    if (!result?.snapshot) return;
    const res = await send("/api/items/restore", "POST", { snapshot: result.snapshot });
    const body = await res.json().catch(() => null);
    setResult(null);
    window.dispatchEvent(new CustomEvent("liveimproved:changed"));
    if (body?.item) onDone(body.item);
  }

  return (
    <div className="mt-2 rounded-lg border p-2" style={{ borderColor: "var(--stroke-1)", background: "rgba(255,255,255,.02)" }}>
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "var(--accent)" }} />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask(text)}
          disabled={busy}
          placeholder={type === "todo" ? "Ask AI: make a plan, write a recipe, move to Fri 6pm…" : "Ask AI: add steps, write notes, push everything a week…"}
          aria-label="Ask AI about this item"
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--ink-600)]"
          style={{ color: "var(--ink-100)" }}
        />
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "var(--ink-400)" }} />
        ) : (
          text.trim() && (
            <button onClick={() => ask(text)} className="min-chip">
              Go
            </button>
          )
        )}
      </div>
      {!busy && !result && !text && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {(type === "todo" ? ["Make a plan", "Add details"] : ["Make a plan", "Write notes for this"]).map((s) => (
            <button key={s} onClick={() => ask(s)} className="min-chip py-0 text-[11px]">
              {s}
            </button>
          ))}
        </div>
      )}
      {busy && <p className="mt-1 text-xs" style={{ color: "var(--ink-500)" }}>Working on it… (the local AI can take up to a minute)</p>}
      {error && <p className="mt-1 text-xs" style={{ color: "var(--bad)" }}>{error}</p>}
      {result && (
        <div className="mt-1.5 text-xs" style={{ color: "var(--ink-300)" }}>
          <p>{result.reply}</p>
          {result.changes.length > 0 && <p className="mt-0.5" style={{ color: "var(--ink-500)" }}>{result.changes.slice(0, 8).join(" · ")}</p>}
          {result.snapshot != null && (
            <button onClick={undo} className="min-link mt-1">
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Title, due date & time, priority, description — saved as you leave each field. */
function Details({
  title,
  due,
  priority,
  description,
  onSave,
}: {
  title: string;
  due: string | null;
  priority: string;
  description: string | null;
  onSave: (patch: { title?: string; due?: string | null; priority?: string; description?: string | null }) => Promise<void>;
}) {
  const [t, setT] = useState(title);
  const [d, setD] = useState(description ?? "");
  return (
    <div className="space-y-2">
      <input value={t} onChange={(e) => setT(e.target.value)} onBlur={() => t.trim() && t !== title && onSave({ title: t.trim() })} aria-label="Title" className="min-input py-1" />
      <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--ink-500)" }}>
        <label className="flex items-center gap-1.5">
          Due
          <input type="datetime-local" defaultValue={toLocalInput(due)} onBlur={(e) => onSave({ due: fromLocalInput(e.target.value) })} aria-label="Due date and time" className="min-field w-auto py-0.5" />
        </label>
        <select value={priority} onChange={(e) => onSave({ priority: e.target.value })} aria-label="Priority" className="min-field w-auto py-0.5">
          {PRIORITIES.map((p) => (
            <option key={p} value={p} className="bg-[#0f1525]">
              {p}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={d}
        onChange={(e) => setD(e.target.value)}
        onBlur={() => d !== (description ?? "") && onSave({ description: d.trim() || null })}
        placeholder="Description"
        aria-label="Description"
        rows={Math.max(2, Math.min(14, d.split("\n").length + 1))}
        className="min-field resize-y leading-relaxed"
      />
    </div>
  );
}

export function TodoItem({ todo, open, onToggleOpen, onChanged, onOpenItem, leaving, onComplete }: { todo: Todo; open: boolean; onToggleOpen: () => void; onChanged: () => void; onOpenItem: (item: { type: "todo" | "project"; id: string }) => void; leaving: boolean; onComplete: () => void }) {
  const due = whenLabel(todo.dueAt);
  const done = todo.status === "done" || leaving;
  async function save(p: { title?: string; due?: string | null; priority?: string; description?: string | null }) {
    await send(`/api/todos/${todo.id}`, "PATCH", { ...(p.title ? { title: p.title } : {}), ...(p.due !== undefined ? { dueAt: p.due } : {}), ...(p.priority ? { priority: p.priority } : {}), ...(p.description !== undefined ? { notes: p.description } : {}) });
    onChanged();
  }
  async function makeProject() {
    const res = await send("/api/items/convert", "POST", { id: todo.id });
    const body = await res.json().catch(() => null);
    onChanged();
    if (body?.id) onOpenItem({ type: "project", id: body.id });
  }
  async function remove() {
    await send(`/api/todos/${todo.id}`, "DELETE");
    onChanged();
  }
  return (
    <li className={`border-b transition-opacity duration-300 ${leaving ? "opacity-0" : ""}`} style={{ borderColor: "var(--stroke-1)" }}>
      <div className="group flex items-center gap-2.5 py-2 text-sm">
        <Checkbox checked={done} onClick={onComplete} label={done ? "Mark open" : "Mark done"} />
        <button onClick={onToggleOpen} className="min-w-0 flex-1 text-left" aria-expanded={open} aria-label={`Open ${todo.title}`}>
          <span className={`block truncate ${done ? "line-through" : ""}`} style={{ color: done ? "var(--ink-600)" : "var(--ink-100)" }}>
            <Mark priority={todo.priority} />
            {todo.title}
          </span>
          {todo.notes && !open && <span className="block truncate text-xs" style={{ color: "var(--ink-500)" }}>{todo.notes.split("\n")[0]}</span>}
        </button>
        {due && todo.status === "open" && <span className="flex-shrink-0 text-xs" style={{ color: due.late ? "var(--bad)" : "var(--ink-500)" }}>{due.text}</span>}
        {todo.status === "done" && todo.completedAt && <span className="text-xs" style={{ color: "var(--ink-600)" }}>{format(new Date(todo.completedAt), "MMM d")}</span>}
        <AreaDot area={todo.area as never} />
      </div>
      {open && (
        <div className="mb-3 ml-7">
          <Details title={todo.title} due={todo.dueAt} priority={todo.priority} description={todo.notes} onSave={save} />
          <AskAI type="todo" id={todo.id} onDone={onOpenItem} />
          <div className="mt-2 flex gap-3 text-xs">
            <button onClick={makeProject} className="min-link flex items-center gap-1">
              <FolderKanban className="h-3 w-3" /> Make it a project
            </button>
            <button onClick={remove} className="min-link" style={{ color: "var(--bad)" }}>
              Delete
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

export function ProjectItem({ project, open, onToggleOpen, onChanged, onOpenItem }: { project: Project; open: boolean; onToggleOpen: () => void; onChanged: () => void; onOpenItem: (item: { type: "todo" | "project"; id: string }) => void }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${project.id}/tasks`, { cache: "no-store" });
    setTasks(res.ok ? await res.json() : []);
  }, [project.id]);
  useLoad(load, open);

  const top = (tasks ?? []).filter((t) => !t.parentTaskId);
  const due = project.deadline ? whenLabel(project.deadline) : null;
  const done = project.status === "completed";

  async function save(p: { title?: string; due?: string | null; priority?: string; description?: string | null }) {
    await send(`/api/projects/${project.id}`, "PATCH", { ...(p.title ? { title: p.title } : {}), ...(p.due !== undefined ? { deadline: p.due } : {}), ...(p.priority ? { priority: p.priority } : {}), ...(p.description !== undefined ? { description: p.description } : {}) });
    onChanged();
  }
  async function toggleTask(t: Task) {
    setTasks((l) => l?.map((x) => (x.id === t.id ? { ...x, status: x.status === "completed" ? "todo" : "completed" } : x)) ?? null);
    await send(`/api/projects/${project.id}/tasks/${t.id}`, "PATCH", { status: t.status === "completed" ? "todo" : "completed" });
    onChanged();
  }
  async function setTaskDate(t: Task, v: string) {
    const iso = v ? new Date(`${v}T19:00`).toISOString() : null;
    setTasks((l) => l?.map((x) => (x.id === t.id ? { ...x, dueDate: iso } : x)) ?? null);
    await send(`/api/projects/${project.id}/tasks/${t.id}`, "PATCH", { dueDate: iso });
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
  async function setStatus(status: "completed" | "active") {
    await send(`/api/projects/${project.id}`, "PATCH", { status });
    onChanged();
  }
  async function remove() {
    if (!window.confirm(`Delete "${project.title}" and its checklist?`)) return;
    await send(`/api/projects/${project.id}`, "DELETE");
    onChanged();
  }
  return (
    <li className="border-b" style={{ borderColor: "var(--stroke-1)" }}>
      <div className="group flex items-center gap-2.5 py-2 text-sm">
        <Checkbox checked={done} onClick={() => setStatus(done ? "active" : "completed")} label={done ? "Reopen project" : "Complete project"} />
        <button onClick={onToggleOpen} className="flex min-w-0 flex-1 items-center gap-1.5 text-left" aria-expanded={open}>
          <ChevronRight className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${open ? "rotate-90" : ""}`} style={{ color: "var(--ink-500)" }} />
          <span className={`truncate ${done ? "line-through" : ""}`} style={{ color: done ? "var(--ink-600)" : "var(--ink-100)" }}>
            <Mark priority={project.priority} />
            {project.title}
          </span>
        </button>
        <span className="text-xs tabular-nums" style={{ color: "var(--ink-500)" }}>
          {project.completedTaskCount}/{project.taskCount}
        </span>
        {due && !done && <span className="flex-shrink-0 text-xs" style={{ color: due.late ? "var(--bad)" : "var(--ink-500)" }}>{due.text}</span>}
        <AreaDot area={project.area as never} />
      </div>
      {open && (
        <div className="mb-3 ml-7">
          <Details title={project.title} due={project.deadline} priority={project.priority} description={project.description} onSave={save} />
          <p className="min-label mb-1 mt-3">Checklist</p>
          {tasks === null ? (
            <p className="min-sub py-1">Loading…</p>
          ) : (
            <ul>
              {top.map((t) => (
                <li key={t.id} className="group flex items-center gap-2.5 py-1 text-sm">
                  <Checkbox checked={t.status === "completed"} onClick={() => toggleTask(t)} label={t.status === "completed" ? "Reopen task" : "Complete task"} />
                  <span className={`min-w-0 flex-1 ${t.status === "completed" ? "line-through" : ""}`} style={{ color: t.status === "completed" ? "var(--ink-600)" : "var(--ink-200)" }}>
                    {t.title}
                  </span>
                  <input
                    type="date"
                    defaultValue={t.dueDate ? format(new Date(t.dueDate), "yyyy-MM-dd") : ""}
                    onBlur={(e) => setTaskDate(t, e.target.value)}
                    aria-label={`Date for ${t.title}`}
                    className="w-[7.5rem] bg-transparent text-xs outline-none"
                    style={{ color: t.dueDate && isPast(new Date(t.dueDate)) && t.status !== "completed" ? "var(--bad)" : "var(--ink-500)", colorScheme: "dark" }}
                  />
                  <button onClick={() => removeTask(t)} aria-label={`Delete ${t.title}`} className="opacity-40 hover:opacity-100">
                    <X className="h-3 w-3" style={{ color: "var(--ink-500)" }} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <InlineAdd placeholder="Add a step" onAdd={addTask} className="py-1 text-[13px]" />
          <AskAI type="project" id={project.id} onDone={async (item) => (await load(), onOpenItem(item))} />
          <button onClick={remove} className="min-link mt-2 text-xs" style={{ color: "var(--bad)" }}>
            Delete project
          </button>
        </div>
      )}
    </li>
  );
}
