"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, Undo2 } from "lucide-react";
import { AREA_META, normalizeArea } from "@/lib/areas";
import { useAssistantChat, type ChatMsg } from "@/hooks/useAssistantChat";

const SUGGESTIONS = [
  "What's on today?",
  "Help me prioritize",
  "Remind me tomorrow at 8am to ",
  "Today I felt ",
];

function ActionCards({ msg, onUndo }: { msg: ChatMsg; onUndo: (id: string) => void }) {
  const actions = (msg.actions ?? []).filter(
    (a) => !(a.type === "todo" && msg.actions?.some((b) => b.type === "reminder" && b.title === a.title))
  );
  if (!actions.length) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {actions.map((a) => {
        const area = AREA_META[normalizeArea(a.area)];
        return (
          <Link
            key={`${a.type}-${a.id}`}
            href={a.href}
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors hover:bg-white/5"
            style={{ border: "1px solid var(--stroke-2)", background: "rgba(255,255,255,.02)" }}
          >
            <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: area.color }} />
            <span className="uppercase tracking-wider text-[10px]" style={{ color: "var(--ink-500)" }}>
              {a.op === "complete" ? "done" : a.type}
            </span>
            <span className="flex-1 truncate" style={{ color: "var(--ink-200)" }}>
              {a.title}
            </span>
            {a.detail && (
              <span className="truncate text-[11px]" style={{ color: "var(--ink-500)" }}>
                {a.detail}
              </span>
            )}
          </Link>
        );
      })}
      <button
        onClick={() => onUndo(msg.id)}
        className="inline-flex items-center gap-1 text-[11px] transition-colors hover:text-white"
        style={{ color: "var(--ink-500)" }}
      >
        <Undo2 className="h-3 w-3" /> Undo
      </button>
    </div>
  );
}

export default function ChatThread({ compact = false }: { compact?: boolean }) {
  const { messages, loading, ready, error, send, undo } = useAssistantChat();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: ready ? "smooth" : "auto" });
  }, [messages, loading, ready]);

  function submit() {
    const value = input.trim();
    if (!value || loading) return;
    setInput("");
    void send(value);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`flex-1 min-h-0 overflow-y-auto ${compact ? "p-3" : "px-1 py-4"} space-y-3`}>
        {ready && messages.length === 0 && (
          <div className="py-10 text-center text-sm" style={{ color: "var(--ink-400)" }}>
            Dump anything here — &ldquo;I have to finish the thesis, file taxes and plan the retreat&rdquo; —
            <br />
            and it gets filed into the right place.
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${m.pending ? "opacity-60" : ""}`}
              style={
                m.role === "user"
                  ? { background: "var(--accent-muted)", border: "1px solid rgba(79,127,255,.3)", color: "var(--ink-100)" }
                  : { background: "var(--bg-elev-2)", border: "1px solid var(--stroke-1)", color: "var(--ink-200)" }
              }
            >
              {m.role === "assistant" && m.actions?.length ? null : m.content}
              {m.role === "assistant" && m.actions?.length ? (
                <>
                  {m.content
                    .split("\n")
                    .filter((line) => !/^\S+ (To-do|Project|Task|Routine|Reminder|Meal|Workout|Journal|Note|✅ Done):/.test(line))
                    .join("\n")
                    .trim() || "Filed:"}
                  <ActionCards msg={m} onUndo={undo} />
                </>
              ) : null}
              {m.source === "telegram" && (
                <span className="ml-2 text-[10px]" style={{ color: "var(--ink-500)" }}>
                  via Telegram
                </span>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-3.5 py-2.5 text-sm" style={{ background: "var(--bg-elev-2)", color: "var(--ink-400)" }}>
              <span className="inline-flex gap-1">
                <span className="animate-pulse">●</span>
                <span className="animate-pulse [animation-delay:150ms]">●</span>
                <span className="animate-pulse [animation-delay:300ms]">●</span>
              </span>
              <span className="ml-2 text-xs">Spark is sorting that out…</span>
            </div>
          </div>
        )}
        {error && <p className="text-center text-xs" style={{ color: "var(--bad)" }}>{error}</p>}
        <div ref={bottomRef} />
      </div>

      {!compact && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                if (s.endsWith(" ")) {
                  setInput(s);
                  inputRef.current?.focus();
                } else void send(s);
              }}
              disabled={loading}
              className="flex-shrink-0 rounded-full px-3 py-1 text-xs disabled:opacity-40"
              style={{ background: "var(--accent-muted)", border: "1px solid rgba(79,127,255,.25)", color: "var(--blue-200)" }}
            >
              {s.trim()}
            </button>
          ))}
        </div>
      )}

      <div
        className={`flex items-end gap-2 rounded-2xl p-2 ${compact ? "m-3 mt-0" : ""}`}
        style={{ background: "var(--bg-elev-1)", border: "1px solid var(--stroke-2)" }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={compact ? 1 : 2}
          placeholder="Tasks, projects, reminders, meals, workouts, how your day went…"
          className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-[var(--ink-500)]"
          style={{ color: "var(--ink-100)" }}
        />
        <button
          onClick={submit}
          disabled={loading || !input.trim()}
          aria-label="Send"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl disabled:opacity-30"
          style={{ background: "linear-gradient(135deg, var(--blue-400), var(--cyan-400))" }}
        >
          <ArrowUp className="h-4 w-4 text-white" />
        </button>
      </div>
    </div>
  );
}
