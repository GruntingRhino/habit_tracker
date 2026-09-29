"use client";

import { useCallback, useEffect, useState } from "react";
import { differenceInCalendarDays, format } from "date-fns";
import { Star, Trash2, X, Target } from "lucide-react";
import { HISTORY_EVENT } from "@/hooks/useAssistantChat";

interface Item {
  id: string;
  title: string;
  saved: boolean;
  source: string;
  isPlan: boolean;
  updatedAt: string;
  preview: string;
}

function bucket(date: Date) {
  const days = differenceInCalendarDays(new Date(), date);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "Previous 7 days";
  return "Previous 30 days";
}

function when(date: Date) {
  const days = differenceInCalendarDays(new Date(), date);
  if (days <= 0) return format(date, "h:mm a");
  if (days < 7) return format(date, "EEE");
  return format(date, "MMM d");
}

interface ChatHistoryProps {
  activeId: string | null;
  onOpen: (id: string) => void;
  onClose: () => void;
  onDeleted: (id: string) => void;
}

/** Saved chats, then everything from the last 30 days grouped by day. */
export default function ChatHistory({ activeId, onOpen, onClose, onDeleted }: ChatHistoryProps) {
  const [items, setItems] = useState<Item[] | null>(null);

  const load = useCallback(() => {
    fetch("/api/chat/conversations")
      .then((r) => (r.ok ? r.json() : []))
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(HISTORY_EVENT, load);
    return () => window.removeEventListener(HISTORY_EVENT, load);
  }, [load]);

  async function toggleSaved(item: Item) {
    setItems((list) => list?.map((x) => (x.id === item.id ? { ...x, saved: !x.saved } : x)) ?? null);
    await fetch(`/api/chat/conversations/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saved: !item.saved }),
    });
    window.dispatchEvent(new CustomEvent(HISTORY_EVENT));
  }

  async function remove(item: Item) {
    if (!window.confirm(`Delete “${item.title}”?`)) return;
    setItems((list) => list?.filter((x) => x.id !== item.id) ?? null);
    await fetch(`/api/chat/conversations/${item.id}`, { method: "DELETE" });
    onDeleted(item.id);
  }

  const saved = items?.filter((i) => i.saved) ?? [];
  const groups = new Map<string, Item[]>();
  for (const i of items?.filter((x) => !x.saved) ?? []) {
    const key = bucket(new Date(i.updatedAt));
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  const sections: [string, Item[]][] = [...(saved.length ? [["Saved", saved] as [string, Item[]]] : []), ...groups];

  return (
    <div className="absolute inset-0 z-20 flex flex-col" style={{ background: "var(--bg-base)" }}>
      <div className="flex items-center justify-between py-2">
        <h2 className="text-[15px] font-semibold" style={{ color: "var(--ink-100)" }}>
          Chats
        </h2>
        <button onClick={onClose} aria-label="Close history" className="flex h-8 w-8 items-center justify-center rounded-full" style={{ color: "var(--ink-400)" }}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {items === null && <p className="min-sub pt-4">Loading…</p>}
        {items?.length === 0 && <p className="min-sub pt-4">No chats in the last 30 days. Star a chat to keep it here for good.</p>}
        {sections.map(([label, list]) => (
          <section key={label} className="mt-4">
            <h3 className="min-label mb-1">{label}</h3>
            {list.map((item) => (
              <div
                key={item.id}
                className="group flex items-center gap-2 rounded-xl px-2 py-2 transition-colors hover:bg-[rgba(255,255,255,.04)]"
                style={item.id === activeId ? { background: "rgba(255,255,255,.06)" } : undefined}
              >
                <button onClick={() => onOpen(item.id)} className="min-w-0 flex-1 text-left">
                  <span className="flex items-center gap-1.5 text-sm" style={{ color: "var(--ink-100)" }}>
                    {item.isPlan && <Target className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "var(--accent-2)" }} />}
                    <span className="truncate">{item.title}</span>
                  </span>
                  <span className="block truncate text-xs" style={{ color: "var(--ink-500)" }}>
                    {when(new Date(item.updatedAt))}
                    {item.source === "telegram" ? " · Telegram" : ""} · {item.preview}
                  </span>
                </button>
                <button
                  onClick={() => toggleSaved(item)}
                  aria-label={item.saved ? "Unsave chat" : "Save chat"}
                  aria-pressed={item.saved}
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${item.saved ? "" : "opacity-60 lg:opacity-0 lg:group-hover:opacity-100"}`}
                  style={{ color: item.saved ? "#f5c451" : "var(--ink-500)" }}
                >
                  <Star className="h-4 w-4" fill={item.saved ? "currentColor" : "none"} />
                </button>
                <button
                  onClick={() => remove(item)}
                  aria-label="Delete chat"
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full opacity-60 lg:opacity-0 lg:group-hover:opacity-100"
                  style={{ color: "var(--ink-500)" }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
