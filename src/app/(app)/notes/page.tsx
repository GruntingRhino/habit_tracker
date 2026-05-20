"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  FileText,
  Loader2,
  NotebookPen,
  Pencil,
  Plus,
  Square,
  StickyNote,
  Trash2,
} from "lucide-react";
import EmptyState from "@/components/EmptyState";
import LoadingSpinner from "@/components/LoadingSpinner";

interface NoteItem {
  id: string;
  title: string;
  content: string | null;
  type: "note" | "todo";
  status: "active" | "completed";
  createdAt: string;
  updatedAt: string;
}

const TYPE_META = {
  note: {
    label: "Note",
    icon: StickyNote,
    description: "Capture context, ideas, and details worth keeping.",
  },
  todo: {
    label: "To-do",
    icon: CheckCircle2,
    description: "Track a concrete item that should move from active to done.",
  },
} as const;

function sortNotes(items: NoteItem[]) {
  return [...items].sort((left, right) => {
    if (left.type !== right.type) return left.type === "todo" ? -1 : 1;
    if (left.status !== right.status) return left.status === "active" ? -1 : 1;
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function NoteCard({
  note,
  saving,
  onSave,
  onDelete,
  onToggleComplete,
}: {
  note: NoteItem;
  saving: boolean;
  onSave: (noteId: string, updates: Partial<Pick<NoteItem, "title" | "content" | "type" | "status">>) => Promise<void>;
  onDelete: (noteId: string) => Promise<void>;
  onToggleComplete: (note: NoteItem) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content ?? "");

  useEffect(() => {
    setTitle(note.title);
    setContent(note.content ?? "");
  }, [note.title, note.content]);

  async function handleSave() {
    await onSave(note.id, {
      title: title.trim(),
      content: content.trim() || null,
    });
    setEditing(false);
  }

  const TypeIcon = TYPE_META[note.type].icon;
  const isTodo = note.type === "todo";
  const isCompleted = note.status === "completed";

  return (
    <article className="rounded-[22px] border border-white/8 bg-[rgba(8,14,28,0.82)] p-4 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.9)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
            <TypeIcon className="h-4 w-4 text-[var(--accent)]" />
          </div>
          <div className="min-w-0">
            {editing ? (
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
              />
            ) : (
              <h2 className={`text-base font-semibold ${isCompleted ? "line-through opacity-60" : ""} text-[var(--text-primary)]`}>
                {note.title}
              </h2>
            )}
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
              {TYPE_META[note.type].label}
              {isTodo ? ` · ${isCompleted ? "Completed" : "Active"}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isTodo && (
            <button
              onClick={() => onToggleComplete(note)}
              disabled={saving}
              className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-[var(--text-secondary)] transition-colors hover:text-emerald-300 disabled:opacity-50"
              title={isCompleted ? "Mark active" : "Mark completed"}
            >
              {isCompleted ? <Square className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            </button>
          )}
          {editing ? (
            <button
              onClick={handleSave}
              disabled={saving || !title.trim()}
              className="rounded-full border border-emerald-500/30 bg-emerald-500/10 p-2 text-emerald-300 transition-colors hover:bg-emerald-500/15 disabled:opacity-50"
              title="Save"
            >
              <Check className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              title="Edit"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => onDelete(note.id)}
            disabled={saving}
            className="rounded-full border border-red-500/20 bg-red-500/10 p-2 text-red-300 transition-colors hover:bg-red-500/15 disabled:opacity-50"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4">
        {editing ? (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            placeholder="Optional details, reminders, or context."
            className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
          />
        ) : note.content ? (
          <p className={`text-sm leading-6 text-[var(--text-secondary)] ${isCompleted ? "opacity-70" : ""}`}>
            {note.content}
          </p>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">
            No additional details.
          </p>
        )}
      </div>
    </article>
  );
}

export default function NotesPage() {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState<"note" | "todo">("note");

  async function loadNotes() {
    setLoading(true);
    try {
      const res = await fetch("/api/notes", { credentials: "include" });
      const data = await res.json();
      setNotes(Array.isArray(data) ? sortNotes(data) : []);
    } catch {
      setError("Failed to load notes");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadNotes();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim() || undefined,
          type,
          status: "active",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create item");

      setNotes((current) => sortNotes([data, ...current]));
      setTitle("");
      setContent("");
      setType("note");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create item");
    } finally {
      setSubmitting(false);
    }
  }

  async function updateNote(noteId: string, updates: Partial<Pick<NoteItem, "title" | "content" | "type" | "status">>) {
    setSavingId(noteId);
    setError("");
    try {
      const res = await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update item");

      setNotes((current) => sortNotes(current.map((item) => (item.id === noteId ? data : item))));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update item");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteNote(noteId: string) {
    setSavingId(noteId);
    setError("");
    try {
      const res = await fetch(`/api/notes/${noteId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete item");

      setNotes((current) => current.filter((item) => item.id !== noteId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete item");
    } finally {
      setSavingId(null);
    }
  }

  async function toggleComplete(note: NoteItem) {
    await updateNote(note.id, {
      status: note.status === "completed" ? "active" : "completed",
    });
  }

  const activeTodos = useMemo(
    () => notes.filter((item) => item.type === "todo" && item.status === "active"),
    [notes]
  );
  const savedNotes = useMemo(
    () => notes.filter((item) => item.type === "note"),
    [notes]
  );
  const completedTodos = useMemo(
    () => notes.filter((item) => item.type === "todo" && item.status === "completed"),
    [notes]
  );

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center"><LoadingSpinner size="lg" /></div>;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 pb-20 md:px-6 md:py-6 lg:pb-6">
      <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
            Notes
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">
            Keep what matters in one place
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
            Save reference notes or track small to-dos without turning them into full plans.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-5 flex items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-300" />
          <p className="text-sm text-red-200">{error}</p>
        </div>
      )}

      <form
        onSubmit={handleCreate}
        className="mb-6 grid gap-5 rounded-[28px] border border-[rgba(120,145,220,0.18)] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0)),#0f1525] p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.85)] lg:grid-cols-[1.2fr_0.8fr]"
      >
        <div className="space-y-5">
          <section className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Quick Capture
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Keep it short and legible. This surface is for working memory, not for full project breakdowns.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Title
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={type === "todo" ? "Follow up on vendor contract" : "Meeting notes from product sync"}
                  className="w-full rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Details
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={5}
                  placeholder="Optional context, checklist fragments, or reminders."
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
                Type
              </p>
            </div>
            <div className="space-y-3">
              {(Object.entries(TYPE_META) as Array<[keyof typeof TYPE_META, (typeof TYPE_META)[keyof typeof TYPE_META]]>).map(([value, meta]) => {
                const active = type === value;
                const Icon = meta.icon;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setType(value)}
                    className="w-full rounded-2xl border px-4 py-4 text-left transition-all"
                    style={{
                      borderColor: active ? "rgba(79,114,255,0.45)" : "rgba(255,255,255,0.08)",
                      background: active ? "rgba(79,114,255,0.12)" : "rgba(255,255,255,0.03)",
                      boxShadow: active ? "0 18px 40px -24px rgba(79,114,255,0.7)" : "none",
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-2xl border border-white/10 bg-white/[0.04] p-2">
                        <Icon className="h-4 w-4 text-[var(--accent)]" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{meta.label}</p>
                        <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{meta.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-2">
                <NotebookPen className="h-4 w-4 text-[var(--accent)]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Preview</p>
                <p className="text-sm text-[var(--text-secondary)]">
                  {type === "todo" ? "This will land in active to-dos." : "This will land in saved notes."}
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {title.trim() || "Untitled"}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                {content.trim() || "No details yet."}
              </p>
            </div>
            <button
              type="submit"
              disabled={submitting || !title.trim()}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add {type === "todo" ? "to-do" : "note"}
            </button>
          </section>
        </div>
      </form>

      {notes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nothing captured yet"
          description="Add a note or a to-do so the loose ends stop living in your head."
        />
      ) : (
        <div className="space-y-8">
          <section>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Active To-dos</h2>
                <p className="text-sm text-[var(--text-secondary)]">Short execution items that still need to move.</p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                {activeTodos.length}
              </span>
            </div>
            {activeTodos.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-8 text-sm text-[var(--text-muted)]">
                No active to-dos.
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {activeTodos.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    saving={savingId === note.id}
                    onSave={updateNote}
                    onDelete={deleteNote}
                    onToggleComplete={toggleComplete}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Notes</h2>
                <p className="text-sm text-[var(--text-secondary)]">Reference material, reminders, and loose context.</p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                {savedNotes.length}
              </span>
            </div>
            {savedNotes.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-8 text-sm text-[var(--text-muted)]">
                No saved notes.
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {savedNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    saving={savingId === note.id}
                    onSave={updateNote}
                    onDelete={deleteNote}
                    onToggleComplete={toggleComplete}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Completed To-dos</h2>
                <p className="text-sm text-[var(--text-secondary)]">Finished small items stay here until you clear them out.</p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                {completedTodos.length}
              </span>
            </div>
            {completedTodos.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-8 text-sm text-[var(--text-muted)]">
                No completed to-dos yet.
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {completedTodos.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    saving={savingId === note.id}
                    onSave={updateNote}
                    onDelete={deleteNote}
                    onToggleComplete={toggleComplete}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
