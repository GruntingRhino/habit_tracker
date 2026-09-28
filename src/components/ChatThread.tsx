"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, X } from "lucide-react";
import { AreaDot } from "@/components/ui";
import { useAssistantChat, type ChatMsg } from "@/hooks/useAssistantChat";

const EXAMPLES = [
  "Remind me in 6 minutes to stretch",
  "Note: garage code is 4412",
  "I have to finish the thesis, file taxes and plan the retreat",
  "What's on today?",
];

const TYPE_LABEL: Record<string, string> = {
  todo: "To-do",
  project: "Project",
  task: "Task",
  routine: "Routine",
  reminder: "Reminder",
  meal: "Meal",
  workout: "Workout",
  journal: "Journal",
  note: "Note",
};

// Lines the server writes for created items; the UI shows them as rows instead.
const ACTION_LINE = /^\S+ (To-do|Project|Task|Routine|Reminder|Meal|Workout|Journal|Note|✅ Done):/;

function AssistantBody({ msg, onUndo }: { msg: ChatMsg; onUndo: (id: string) => void }) {
  const actions = msg.actions ?? [];
  const text = actions.length ? msg.content.split("\n").filter((l) => !ACTION_LINE.test(l)).join("\n").trim() : msg.content;
  return (
    <div className="max-w-[92%] text-[15px] leading-relaxed" style={{ color: "var(--ink-200)" }}>
      {actions.length > 0 && (
        <div className="mb-1">
          {actions.map((a) => (
            <Link key={`${a.type}-${a.id}`} href={a.href} className="flex items-center gap-2.5 py-1 text-sm hover:opacity-80">
              <AreaDot area={a.area} />
              <span style={{ color: "var(--ink-500)" }}>{a.op === "complete" ? "Done" : TYPE_LABEL[a.type] ?? a.type}</span>
              <span className="truncate" style={{ color: "var(--ink-100)" }}>{a.title}</span>
              {a.detail && <span className="truncate text-xs" style={{ color: "var(--ink-500)" }}>{a.detail}</span>}
            </Link>
          ))}
          <button onClick={() => onUndo(msg.id)} className="min-link mt-1 text-xs">
            Undo
          </button>
        </div>
      )}
      {text && <p className="whitespace-pre-wrap">{text}</p>}
    </div>
  );
}

interface ChatThreadProps {
  compact?: boolean;
  /** Shown behind the thread; fades back once the conversation starts. */
  background?: React.ReactNode;
}

export default function ChatThread({ compact = false, background }: ChatThreadProps) {
  const { messages, loading, ready, error, send, undo, clear } = useAssistantChat({ sessionOnly: Boolean(background) });
  const chatting = messages.length > 0 || loading;
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: ready ? "smooth" : "auto" });
  }, [messages, loading, ready]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  function submit(value = input) {
    const text = value.trim();
    if (!text || loading) return;
    setInput("");
    void send(text);
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {background && (
        <div
          aria-hidden={chatting}
          className={`absolute inset-x-0 top-0 bottom-16 flex items-center justify-center transition-all duration-700 ease-out ${
            chatting ? "pointer-events-none scale-[0.97] opacity-[0.07] blur-[2px]" : "opacity-100"
          }`}
        >
          {background}
        </div>
      )}
      {background && chatting && !loading && (
        <button
          onClick={clear}
          aria-label="Back to scores"
          className="absolute right-0 top-0 z-10 flex h-8 w-8 items-center justify-center rounded-full"
          style={{ color: "var(--ink-500)" }}
        >
          <X className="h-4 w-4" />
        </button>
      )}
      <div className={`relative min-h-0 flex-1 space-y-5 overflow-y-auto ${compact ? "p-4" : background && chatting ? "pb-2 pt-10" : "py-2"}`}>
        {ready && messages.length === 0 && !background && (
          <div className="space-y-2 pt-4">
            <p className="min-sub mb-3">Tell it anything — it files it for you.</p>
            {EXAMPLES.map((e) => (
              <button key={e} onClick={() => submit(e)} className="block text-left text-sm hover:text-[var(--ink-100)]" style={{ color: "var(--ink-400)" }}>
                “{e}”
              </button>
            ))}
          </div>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <p
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[15px] ${m.pending ? "opacity-60" : ""}`}
                style={{ background: "rgba(255,255,255,.06)", color: "var(--ink-100)" }}
              >
                {m.content}
              </p>
            </div>
          ) : (
            <AssistantBody key={m.id} msg={m} onUndo={undo} />
          )
        )}
        {loading && (
          <p className="animate-pulse text-sm" style={{ color: "var(--ink-500)" }}>
            Thinking…
          </p>
        )}
        {error && <p className="text-sm" style={{ color: "var(--bad)" }}>{error}</p>}
        <div ref={bottomRef} />
      </div>

      <div className={`relative flex items-end gap-2 rounded-3xl py-1.5 pl-4 pr-1.5 ${compact ? "m-3" : "mt-3"}`} style={{ background: "rgba(255,255,255,.06)" }}>
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
          rows={1}
          placeholder="Message"
          className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-[15px] outline-none placeholder:text-[var(--ink-600)]"
          style={{ color: "var(--ink-100)" }}
        />
        <button
          onClick={() => submit()}
          disabled={loading || !input.trim()}
          aria-label="Send"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-opacity disabled:opacity-20"
          style={{ background: "var(--ink-100)", color: "var(--bg-base)" }}
        >
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
