"use client";

import { useCallback, useEffect, useState } from "react";

export interface ChatAction {
  op: "create" | "complete" | "append";
  type: string;
  id: string;
  title: string;
  area?: string;
  href: string;
  detail?: string;
}

export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: ChatAction[] | null;
  source?: string;
  createdAt: string;
  pending?: boolean;
}

/** sessionOnly: start empty and show only this visit's messages (history stays in the DB). */
export function useAssistantChat({ sessionOnly = false }: { sessionOnly?: boolean } = {}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/chat");
    if (res.ok) setMessages(await res.json());
    setReady(true);
  }, []);

  useEffect(() => {
    if (sessionOnly) {
      setReady(true);
      return;
    }
    let alive = true;
    fetch("/api/chat")
      .then((res) => (res.ok ? res.json() : []))
      .then((list: ChatMsg[]) => {
        if (!alive) return;
        setMessages(list);
        setReady(true);
      })
      .catch(() => setReady(true));
    return () => {
      alive = false;
    };
  }, [sessionOnly]);

  const clear = useCallback(() => setMessages([]), []);

  const send = useCallback(async (text: string) => {
    const value = text.trim();
    if (!value) return;
    setError(null);
    setLoading(true);
    const temp: ChatMsg = { id: `tmp-${Date.now()}`, role: "user", content: value, createdAt: new Date().toISOString(), pending: true };
    setMessages((m) => [...m, temp]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: value }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Something went wrong");
      const data = (await res.json()) as { id: string; reply: string; actions: ChatAction[] };
      setMessages((m) => [
        ...m.map((x) => (x.id === temp.id ? { ...x, pending: false } : x)),
        { id: data.id, role: "assistant", content: data.reply, actions: data.actions, createdAt: new Date().toISOString() },
      ]);
      window.dispatchEvent(new CustomEvent("liveimproved:changed"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setMessages((m) => m.map((x) => (x.id === temp.id ? { ...x, pending: false } : x)));
    } finally {
      setLoading(false);
    }
  }, []);

  const undo = useCallback(async (messageId: string) => {
    const res = await fetch("/api/chat/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId }),
    });
    if (res.ok) {
      setMessages((m) =>
        m.map((x) => (x.id === messageId ? { ...x, actions: [], content: `${x.content}\n\n↩︎ Undone` } : x))
      );
      window.dispatchEvent(new CustomEvent("liveimproved:changed"));
    }
  }, []);

  return { messages, loading, ready, error, send, undo, refresh, clear };
}

/** Re-run `fn` whenever the assistant changes data (so lists refresh after chat captures). */
export function useOnDataChanged(fn: () => void) {
  useEffect(() => {
    const handler = () => fn();
    window.addEventListener("liveimproved:changed", handler);
    return () => window.removeEventListener("liveimproved:changed", handler);
  }, [fn]);
}
