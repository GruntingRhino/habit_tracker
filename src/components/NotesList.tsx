"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, isThisYear, isToday } from "date-fns";
import { Empty } from "@/components/ui";
import { useLoad, useOnDataChanged } from "@/hooks/useAssistantChat";

interface Note {
  id: string;
  title: string;
  content: string | null;
  type: string;
  updatedAt: string;
}

const stamp = (date: string) => {
  const d = new Date(date);
  return isToday(d) ? format(d, "h:mm a") : format(d, isThisYear(d) ? "MMM d" : "MMM d, yyyy");
};
/** First line is the title; the whole text is the body. */
function split(text: string) {
  const t = text.trim();
  const title = t.split("\n")[0].slice(0, 120);
  return { title, content: t === title ? null : t };
}
const send = (url: string, method: string, body?: unknown) =>
  fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

function NoteRow({ note, onSave, onDelete }: { note: Note; onSave: (n: Note, text: string) => void; onDelete: (n: Note) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(note.content ?? note.title);
  const body = note.content && note.content !== note.title ? note.content.replace(note.title, "").trim() : "";
  if (open) {
    return (
      <li className="min-row flex-col items-stretch">
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(10, Math.max(3, text.split("\n").length + 1))} className="w-full resize-none bg-transparent text-sm leading-relaxed outline-none" style={{ color: "var(--ink-100)" }} />
        <div className="mt-1 flex gap-4 text-xs">
          <button style={{ color: "var(--ink-100)" }} onClick={() => (onSave(note, text), setOpen(false))}>
            Save
          </button>
          <button style={{ color: "var(--ink-400)" }} onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button className="ml-auto" style={{ color: "var(--bad)" }} onClick={() => onDelete(note)}>
            Delete
          </button>
        </div>
      </li>
    );
  }
  return (
    <li className="min-row cursor-pointer items-start" onClick={() => setOpen(true)}>
      <div className="min-w-0 flex-1">
        <p style={{ color: "var(--ink-100)" }}>{note.title}</p>
        {body && (
          <p className="line-clamp-1 whitespace-pre-wrap text-xs" style={{ color: "var(--ink-500)" }}>
            {body}
          </p>
        )}
      </div>
      <span className="text-xs" style={{ color: "var(--ink-600)" }}>
        {stamp(note.updatedAt)}
      </span>
    </li>
  );
}

export default function NotesList() {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const load = useCallback(async () => {
    const res = await fetch("/api/notes");
    setNotes(res.ok ? ((await res.json()) as Note[]).filter((n) => n.type === "note") : []);
  }, []);
  useLoad(load);
  useOnDataChanged(load);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? (notes ?? []).filter((n) => `${n.title} ${n.content ?? ""}`.toLowerCase().includes(q)) : notes ?? [];
  }, [notes, query]);

  async function add() {
    if (!draft.trim()) return;
    const { title, content } = split(draft);
    setDraft("");
    const res = await send("/api/notes", "POST", { title, ...(content ? { content } : {}) });
    if (res.ok) {
      const note = (await res.json()) as Note;
      setNotes((l) => [note, ...(l ?? [])]);
    }
  }
  async function save(note: Note, text: string) {
    if (!text.trim()) return;
    const { title, content } = split(text);
    setNotes((l) => l?.map((n) => (n.id === note.id ? { ...n, title, content, updatedAt: new Date().toISOString() } : n)) ?? null);
    await send(`/api/notes/${note.id}`, "PATCH", { title, content });
  }
  async function remove(note: Note) {
    setNotes((l) => l?.filter((n) => n.id !== note.id) ?? null);
    await send(`/api/notes/${note.id}`, "DELETE");
  }

  return (
    <div>
      <div className="mb-3 flex items-start gap-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), void add())}
          rows={1}
          placeholder="Write a note (Enter to save)"
          aria-label="New note"
          className="min-input flex-1 resize-none"
        />
        {(notes?.length ?? 0) > 5 && <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search notes" className="min-input w-28" />}
      </div>
      {notes === null ? (
        <p className="min-sub">Loading…</p>
      ) : shown.length === 0 ? (
        <Empty>{query ? "No matches." : "No notes yet. Or say “note: …” in Chat."}</Empty>
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
