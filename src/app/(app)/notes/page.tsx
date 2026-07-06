"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Search,
  Square,
  StickyNote,
  Trash2,
} from "lucide-react";
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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

        <div className="flex items-center gap-2 self-end sm:self-auto">
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
  const [search, setSearch] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);

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

  const filtered = useMemo(() => {
    if (!search.trim()) return notes;
    const q = search.toLowerCase();
    return notes.filter((n) => n.title.toLowerCase().includes(q) || (n.content ?? "").toLowerCase().includes(q));
  }, [notes, search]);

  const activeTodos = useMemo(
    () => filtered.filter((item) => item.type === "todo" && item.status === "active"),
    [filtered]
  );
  const savedNotes = useMemo(
    () => filtered.filter((item) => item.type === "note"),
    [filtered]
  );
  const completedTodos = useMemo(
    () => filtered.filter((item) => item.type === "todo" && item.status === "completed"),
    [filtered]
  );

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center"><LoadingSpinner size="lg" /></div>;
  }

  const cardStyle = {
    background: "linear-gradient(135deg,#0c1830 0%,#091222 100%)",
    border: "1px solid rgba(40,76,140,0.22)",
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 pb-20 md:px-6 md:py-6 lg:pb-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold mb-0.5" style={{ color: "#c8deff", fontFamily: "'Syne', sans-serif" }}>
          Notes
        </h1>
        <p className="text-xs" style={{ color: "#2d4a6a" }}>
          {activeTodos.length} to-do{activeTodos.length !== 1 ? "s" : ""} · {savedNotes.length} note{savedNotes.length !== 1 ? "s" : ""}
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2">
          <AlertCircle className="h-4 w-4 text-red-300" />
          <p className="text-sm text-red-200">{error}</p>
        </div>
      )}

      {/* Quick capture */}
      <form onSubmit={handleCreate} className="mb-4">
        <div className="flex items-center gap-2 rounded-xl px-4 py-2.5" style={cardStyle}>
          <span className="text-sm flex-shrink-0" style={{ color: "#2d4a6a" }}>+</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Quick capture — title of a note or to-do..."
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "#c8deff" }}
          />
          <div className="flex items-center gap-1 flex-shrink-0">
            {(["note", "todo"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className="px-3 py-1 rounded-lg text-xs font-medium transition-all capitalize"
                style={
                  type === t
                    ? { background: "rgba(79,114,255,0.2)", color: "#a8c4ff", border: "1px solid rgba(79,114,255,0.4)" }
                    : { color: "#4a6a90", border: "1px solid transparent" }
                }
              >
                {t === "todo" ? "To-do" : "Note"}
              </button>
            ))}
            <button
              type="submit"
              disabled={submitting || !title.trim()}
              className="ml-1 px-4 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-40"
              style={{ background: "linear-gradient(135deg,#4f72ff,#22d3ee)" }}
            >
              {submitting ? "..." : "Add"}
            </button>
          </div>
        </div>
      </form>

      {/* Search */}
      <div className="flex items-center gap-2 rounded-xl px-4 py-2.5 mb-6" style={cardStyle}>
        <Search className="w-4 h-4 flex-shrink-0" style={{ color: "#2d4a6a" }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notes and to-dos..."
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ color: "#c8deff" }}
        />
      </div>

      {notes.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm mb-2" style={{ color: "#4a6a90" }}>Nothing captured yet</p>
          <p className="text-xs" style={{ color: "#2d4a6a" }}>Add a note or to-do above</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Active To-dos */}
          {activeTodos.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#2d4a6a" }}>Active To-dos</p>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(40,76,140,0.3)", color: "#4a6a90" }}>{activeTodos.length}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {activeTodos.map((note) => (
                  <div
                    key={`${note.id}:${note.updatedAt}`}
                    className="rounded-xl p-4"
                    style={cardStyle}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => void toggleComplete(note)}
                        className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border-2 transition-all"
                        style={{ borderColor: "#334d6e" }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium" style={{ color: "#c8deff" }}>{note.title}</p>
                        {note.content && (
                          <p className="text-xs mt-1 line-clamp-2" style={{ color: "#4a6a90" }}>{note.content}</p>
                        )}
                      </div>
                      <button
                        onClick={() => void deleteNote(note.id)}
                        className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: "#334d6e" }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#f87171")}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#334d6e")}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Notes */}
          {savedNotes.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#2d4a6a" }}>Notes</p>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(40,76,140,0.3)", color: "#4a6a90" }}>{savedNotes.length}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {savedNotes.map((note) => (
                  <div
                    key={`${note.id}:${note.updatedAt}`}
                    className="rounded-xl p-4"
                    style={cardStyle}
                  >
                    <p className="text-sm font-medium mb-1" style={{ color: "#c8deff" }}>{note.title}</p>
                    {note.content && (
                      <p className="text-xs line-clamp-3 leading-relaxed" style={{ color: "#4a6a90" }}>{note.content}</p>
                    )}
                    <div className="flex items-center justify-end mt-3">
                      <button
                        onClick={() => void deleteNote(note.id)}
                        style={{ color: "#334d6e" }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#f87171")}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#334d6e")}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Completed to-dos (collapsed) */}
          {completedTodos.length > 0 && (
            <section>
              <button
                onClick={() => setShowCompleted((v) => !v)}
                className="flex items-center gap-2 text-xs transition-colors"
                style={{ color: "#4a6a90" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#6b8cb8")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#4a6a90")}
              >
                ▸ Show {completedTodos.length} completed to-do{completedTodos.length !== 1 ? "s" : ""}
              </button>
              {showCompleted && (
                <div className="grid gap-2 sm:grid-cols-2 mt-3">
                  {completedTodos.map((note) => (
                    <div key={`${note.id}:${note.updatedAt}`} className="rounded-xl p-4 opacity-50" style={cardStyle}>
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-green-500" />
                        <p className="text-sm line-through" style={{ color: "#4a6a90" }}>{note.title}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
