"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, isThisYear, isToday } from "date-fns";
import { Empty, PageHeader } from "@/components/ui";
import { useOnDataChanged } from "@/hooks/useAssistantChat";

interface Note {
  id: string;
  title: string;
  content: string | null;
  type: string;
  updatedAt: string;
}

function stamp(date: string) {
  const d = new Date(date);
  if (isToday(d)) return format(d, "h:mm a");
  return format(d, isThisYear(d) ? "MMM d" : "MMM d, yyyy");
}

/** First line becomes the title; the whole text is kept as the body. */
function split(text: string) {
  const trimmed = text.trim();
  const first = trimmed.split("\n")[0].slice(0, 120);
  return { title: first, content: trimmed === first ? null : trimmed };
}

async function fetchNotes(): Promise<Note[]> {
  const res = await fetch("/api/notes");
  if (!res.ok) return [];
  return ((await res.json()) as Note[]).filter((n) => n.type === "note");
}

function NoteRow({ note, onSave, onDelete }: { note: Note; onSave: (n: Note, text: string) => void; onDelete: (n: Note) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(note.content ?? note.title);
  const body = note.content && note.content !== note.title ? note.content.replace(note.title, "").trim() : "";

  if (open) {
    return (
      <li className="min-row flex-col items-stretch">
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={Math.min(12, Math.max(3, text.split("\n").length + 1))}
          className="w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none"
          style={{ color: "var(--ink-100)" }}
        />
        <div className="mt-2 flex gap-4">
          <button
            className="min-link"
            style={{ color: "var(--ink-100)" }}
            onClick={() => {
              onSave(note, text);
              setOpen(false);
            }}
          >
            Save
          </button>
          <button className="min-link" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button className="min-link ml-auto" style={{ color: "var(--bad)" }} onClick={() => onDelete(note)}>
            Delete
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="min-row cursor-pointer items-start" onClick={() => setOpen(true)}>
      <div className="min-w-0 flex-1">
        <p className="text-[15px]" style={{ color: "var(--ink-100)" }}>
          {note.title}
        </p>
        {body && (
          <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-sm" style={{ color: "var(--ink-500)" }}>
            {body}
          </p>
        )}
      </div>
      <span className="pt-0.5 text-xs" style={{ color: "var(--ink-600)" }}>
        {stamp(note.updatedAt)}
      </span>
    </li>
  );
}

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => setNotes(await fetchNotes()), []);
  useEffect(() => {
    let alive = true;
    fetchNotes().then((n) => alive && setNotes(n));
    return () => {
      alive = false;
    };
  }, []);
  useOnDataChanged(load);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes ?? [];
    return (notes ?? []).filter((n) => `${n.title} ${n.content ?? ""}`.toLowerCase().includes(q));
  }, [notes, query]);

  async function add() {
    if (!draft.trim()) return;
    const { title, content } = split(draft);
    setDraft("");
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, ...(content ? { content } : {}) }),
    });
    if (res.ok) {
      const note = (await res.json()) as Note;
      setNotes((list) => [note, ...(list ?? [])]);
    }
  }

  async function save(note: Note, text: string) {
    if (!text.trim()) return;
    const { title, content } = split(text);
    setNotes((list) => list?.map((n) => (n.id === note.id ? { ...n, title, content, updatedAt: new Date().toISOString() } : n)) ?? null);
    await fetch(`/api/notes/${note.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, content }) });
  }

  async function remove(note: Note) {
    setNotes((list) => list?.filter((n) => n.id !== note.id) ?? null);
    await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
  }

  return (
    <div className="min-page">
      <PageHeader
        title="Notes"
        action={
          (notes?.length ?? 0) > 5 && (
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="min-input w-32 py-1 text-sm" />
          )
        }
      />

      <div className="mb-10">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add();
          }}
          rows={draft ? Math.min(8, draft.split("\n").length + 1) : 1}
          placeholder="Write a note"
          className="min-input resize-none"
        />
        {draft.trim() && (
          <button onClick={add} className="min-link mt-2" style={{ color: "var(--ink-100)" }}>
            Save note
          </button>
        )}
        <p className="min-sub mt-2">Or say “note: …” / “jot this down …” in Chat or Telegram.</p>
      </div>

      {notes === null ? (
        <p className="min-sub">Loading…</p>
      ) : shown.length === 0 ? (
        <Empty>{query ? "No matches." : "No notes yet."}</Empty>
      ) : (
        <ul>
          {shown.map((n) => (
            <NoteRow key={`${n.id}-${n.updatedAt}`} note={n} onSave={save} onDelete={remove} />
          ))}
        </ul>
      )}
    </div>
  );
}
