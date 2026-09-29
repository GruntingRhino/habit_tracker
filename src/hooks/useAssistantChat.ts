"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ChatAction {
  op: "create" | "complete" | "append";
  type: string;
  id: string;
  title: string;
  area?: string;
  href: string;
  detail?: string;
}

export interface PlanCard {
  title: string;
  summary: string;
  area: string;
  weekly: string[];
  steps: { title: string; when?: string }[];
  first: string;
}

export interface ChatMeta {
  options?: string[];
  plan?: PlanCard;
  /** What an undo reversed. */
  undone?: string[];
}

export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: ChatAction[] | null;
  meta?: ChatMeta | null;
  source?: string;
  createdAt: string;
  pending?: boolean;
  streaming?: boolean;
}

export interface ConversationInfo {
  id: string;
  title: string;
  saved: boolean;
}

/** Fired whenever a conversation is created, renamed, saved or deleted, so history lists refresh. */
export const HISTORY_EVENT = "liveimproved:history";

/** sessionOnly: start with a fresh chat instead of resuming the latest one. */
export function useAssistantChat({ sessionOnly = false }: { sessionOnly?: boolean } = {}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [conversation, setConversation] = useState<ConversationInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationRef = useRef<string | null>(null);

  const load = useCallback(async (id?: string) => {
    const res = await fetch(id ? `/api/chat?conversationId=${encodeURIComponent(id)}` : "/api/chat");
    const data = res.ok ? ((await res.json()) as { conversation: ConversationInfo | null; messages: ChatMsg[] }) : null;
    conversationRef.current = data?.conversation?.id ?? null;
    setConversation(data?.conversation ?? null);
    setMessages(data?.messages ?? []);
    setError(null);
    setReady(true);
  }, []);

  useEffect(() => {
    if (sessionOnly) {
      setReady(true);
      return;
    }
    load().catch(() => setReady(true));
  }, [sessionOnly, load]);

  /** Start a new chat (the next message creates the conversation). */
  const clear = useCallback(() => {
    conversationRef.current = null;
    setConversation(null);
    setMessages([]);
    setError(null);
  }, []);

  const openConversation = useCallback((id: string) => load(id).catch(() => setError("Couldn't open that chat")), [load]);

  const send = useCallback(async (text: string) => {
    const value = text.trim();
    if (!value) return;
    setError(null);
    setLoading(true);
    setStatus(null);
    const stamp = Date.now();
    const temp: ChatMsg = { id: `tmp-${stamp}`, role: "user", content: value, createdAt: new Date().toISOString(), pending: true };
    const streamId = `stream-${stamp}`;
    setMessages((m) => [...m, temp]);

    const upsertStream = (fn: (content: string) => string) =>
      setMessages((m) => {
        const has = m.some((x) => x.id === streamId);
        if (!has) return [...m, { id: streamId, role: "assistant", content: fn(""), createdAt: new Date().toISOString(), streaming: true }];
        return m.map((x) => (x.id === streamId ? { ...x, content: fn(x.content) } : x));
      });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: value, conversationId: conversationRef.current }),
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? "Something went wrong");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;
      while (!done) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const event = JSON.parse(line);
          if (event.type === "conversation") {
            if (conversationRef.current !== event.id) {
              conversationRef.current = event.id;
              setConversation({ id: event.id, title: value.slice(0, 48), saved: false });
            }
            setMessages((m) => m.map((x) => (x.id === temp.id ? { ...x, pending: false } : x)));
          } else if (event.type === "status") {
            setStatus(event.text);
          } else if (event.type === "token") {
            setStatus(null);
            upsertStream((c) => c + event.text);
          } else if (event.type === "done") {
            const r = event.reply as { id: string; reply: string; actions: ChatAction[]; meta: ChatMeta | null };
            const final: ChatMsg = { id: r.id, role: "assistant", content: r.reply, actions: r.actions, meta: r.meta, createdAt: new Date().toISOString() };
            setMessages((m) => [...m.filter((x) => x.id !== streamId).map((x) => (x.id === temp.id ? { ...x, pending: false } : x)), final]);
            done = true;
          } else if (event.type === "error") {
            throw new Error(event.error ?? "Something went wrong");
          }
        }
      }
      if (!done) throw new Error("Connection dropped. Your message is saved; reopen the chat to see the reply.");
      window.dispatchEvent(new CustomEvent("liveimproved:changed"));
      window.dispatchEvent(new CustomEvent(HISTORY_EVENT));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setMessages((m) => m.filter((x) => x.id !== streamId).map((x) => (x.id === temp.id ? { ...x, pending: false } : x)));
    } finally {
      setLoading(false);
      setStatus(null);
    }
  }, []);

  const undo = useCallback(async (messageId: string) => {
    const res = await fetch("/api/chat/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId }),
    });
    if (!res.ok) return;
    // Undo can change more than this message (plan state, pending questions), so reload the conversation.
    const id = conversationRef.current;
    if (id) await load(id).catch(() => undefined);
    else setMessages((m) => m.map((x) => (x.id === messageId ? { ...x, actions: [], meta: { ...x.meta, options: undefined, undone: ["Undone"] }, content: `${x.content}\n\n↩︎ Undone` } : x)));
    window.dispatchEvent(new CustomEvent("liveimproved:changed"));
  }, [load]);

  const toggleSaved = useCallback(async () => {
    const current = conversation;
    if (!current) return;
    const saved = !current.saved;
    setConversation({ ...current, saved });
    const res = await fetch(`/api/chat/conversations/${current.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saved }),
    });
    if (!res.ok) setConversation(current);
    window.dispatchEvent(new CustomEvent(HISTORY_EVENT));
  }, [conversation]);

  return { messages, conversation, loading, status, ready, error, send, undo, clear, openConversation, toggleSaved, refresh: load };
}

/** Re-run `fn` whenever the assistant changes data (so lists refresh after chat captures). */
export function useOnDataChanged(fn: () => void) {
  useEffect(() => {
    const handler = () => fn();
    window.addEventListener("liveimproved:changed", handler);
    return () => window.removeEventListener("liveimproved:changed", handler);
  }, [fn]);
}

/** Run an async loader on mount and whenever it changes (deferred, so state updates land outside the effect body). */
export function useLoad(load: () => Promise<unknown>, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load, enabled]);
}
