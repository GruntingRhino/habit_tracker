"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, History, SquarePen, Star, Check } from "lucide-react";
import { AreaDot } from "@/components/ui";
import ChatHistory from "@/components/ChatHistory";
import { useAssistantChat, type ChatMsg, type PlanCard } from "@/hooks/useAssistantChat";

const EXAMPLES = [
  "I want to get really good at MMA",
  "Remind me in 6 minutes to stretch",
  "I have to finish the thesis, file taxes and plan the retreat",
  "What's on today?",
];

const TYPE_LABEL: Record<string, string> = {
  todo: "To-do",
  project: "Project",
  task: "Task",
  routine: "Habit",
  reminder: "Reminder",
  meal: "Meal",
  workout: "Workout",
  journal: "Journal",
  note: "Note",
  plan: "Plan",
};

// Lines the server writes for created items; the UI shows them as rows instead.
const ACTION_LINE = /^\S+ (To-do|Project|Task|Routine|Habit|Reminder|Meal|Workout|Journal|Note|Calendar|Sleep|✅ Done|Removed):/;

function PlanView({ plan, projectHref, undone }: { plan: PlanCard; projectHref?: string; undone: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ${undone ? "opacity-50" : ""}`} style={{ background: "rgba(255,255,255,.04)", border: "1px solid var(--stroke-1)" }}>
      <div className="mb-1 flex items-center gap-2">
        <AreaDot area={plan.area} />
        <h3 className={`text-[15px] font-semibold ${undone ? "line-through" : ""}`} style={{ color: "var(--ink-100)" }}>
          {plan.title}
        </h3>
      </div>
      {plan.summary && <p className="mb-3 text-sm">{plan.summary}</p>}
      {plan.weekly.length > 0 && (
        <>
          <p className="min-label mb-1">Every week</p>
          <ul className="mb-3 space-y-0.5 text-sm">
            {plan.weekly.map((w) => (
              <li key={w}>· {w}</li>
            ))}
          </ul>
        </>
      )}
      <p className="min-label mb-1">Steps</p>
      <ol className="mb-3 space-y-1 text-sm">
        {plan.steps.map((s, i) => (
          <li key={`${i}-${s.title}`} className="flex gap-2">
            <span className="w-4 flex-shrink-0 text-right" style={{ color: "var(--ink-500)" }}>
              {i + 1}
            </span>
            <span className="flex-1">{s.title}</span>
            {s.when && (
              <span className="flex-shrink-0 text-xs" style={{ color: "var(--ink-500)" }}>
                {s.when}
              </span>
            )}
          </li>
        ))}
      </ol>
      {plan.first && (
        <p className="mb-3 text-sm">
          <span style={{ color: "var(--accent-2)" }}>Start now:</span> {plan.first}
        </p>
      )}
      {undone ? (
        <p className="text-xs" style={{ color: "var(--ink-500)" }}>
          Undone. Say “make the plan again” to bring it back.
        </p>
      ) : (
        <p className="text-xs" style={{ color: "var(--ink-500)" }}>
          {projectHref && (
            <Link href={projectHref} className="mr-1 inline-flex items-center gap-1" style={{ color: "var(--good)" }}>
              <Check className="h-3.5 w-3.5" /> Open project
            </Link>
          )}
          · Want changes? Say “make the plan easier”.
        </p>
      )}
    </div>
  );
}

function AssistantBody({ msg, onUndo }: { msg: ChatMsg; onUndo: (id: string) => void }) {
  const actions = msg.actions ?? [];
  const undone = Boolean(msg.meta?.undone);
  const text = msg.content
    .split("\n")
    .filter((l) => !ACTION_LINE.test(l))
    .join("\n")
    .trim();
  const projectHref = actions.find((a) => a.type === "project")?.href;
  return (
    <div className="max-w-[92%] text-[15px] leading-relaxed" style={{ color: "var(--ink-200)" }}>
      {actions.length > 0 && (
        <div className="mb-1">
          {actions.map((a) => (
            <Link key={`${a.type}-${a.id}-${a.op}`} href={a.href} className="flex items-center gap-2.5 py-1 text-sm hover:opacity-80">
              <AreaDot area={a.area} />
              <span style={{ color: "var(--ink-500)" }}>{a.op === "complete" ? "Done" : a.op === "delete" ? "Removed" : TYPE_LABEL[a.type] ?? a.type}</span>
              <span className="truncate" style={{ color: "var(--ink-100)" }}>{a.title}</span>
              {a.detail && <span className="truncate text-xs" style={{ color: "var(--ink-500)" }}>{a.detail}</span>}
            </Link>
          ))}
          <button onClick={() => onUndo(msg.id)} className="min-link mt-1 text-xs">
            Undo
          </button>
        </div>
      )}
      {msg.meta?.plan ? (
        <PlanView plan={msg.meta.plan} projectHref={projectHref} undone={undone} />
      ) : (
        text && (
          <p className="whitespace-pre-wrap">
            {text}
            {msg.streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse align-text-bottom" style={{ background: "var(--ink-400)" }} />}
          </p>
        )
      )}
    </div>
  );
}

interface ChatThreadProps {
  compact?: boolean;
  /** Shown behind the thread; fades back once the conversation starts. */
  background?: React.ReactNode;
}

export default function ChatThread({ compact = false, background }: ChatThreadProps) {
  const chat = useAssistantChat({ sessionOnly: Boolean(background) });
  const { messages, conversation, loading, status, ready, error, send, undo, clear, openConversation, toggleSaved } = chat;
  const chatting = messages.length > 0 || loading;
  const [input, setInput] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: ready ? "smooth" : "auto" });
  }, [messages, loading, ready, status]);

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

  const last = messages[messages.length - 1];
  const options = !loading && last?.role === "assistant" && !last.meta?.undone ? last.meta?.options ?? [] : [];
  const streaming = messages.some((m) => m.streaming);
  const iconButton = "flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-[rgba(255,255,255,.06)]";

  return (
    <div className={`relative flex h-full min-h-0 flex-col ${compact ? "px-3" : ""}`}>
      {showHistory && (
        <ChatHistory
          activeId={conversation?.id ?? null}
          onOpen={(id) => {
            setShowHistory(false);
            void openConversation(id);
          }}
          onClose={() => setShowHistory(false)}
          onDeleted={(id) => {
            if (id === conversation?.id) clear();
          }}
        />
      )}
      {background && (
        <div
          aria-hidden={chatting}
          className={`absolute inset-x-0 top-10 flex justify-center transition-all duration-500 ease-out ${
            chatting ? "pointer-events-none opacity-0" : "z-20 opacity-100"
          }`}
        >
          {background}
        </div>
      )}

      <div className={`relative z-10 flex items-center gap-1 ${compact ? "pt-2" : ""}`}>
        <button onClick={() => setShowHistory(true)} aria-label="Chat history" title="Chat history" className={iconButton} style={{ color: "var(--ink-400)" }}>
          <History className="h-4 w-4" />
        </button>
        {chatting && conversation && (
          <p className="min-w-0 flex-1 truncate text-center text-xs" style={{ color: "var(--ink-500)" }}>
            {conversation.title}
          </p>
        )}
        {chatting && (
          <div className="ml-auto flex items-center gap-1">
            {conversation && (
              <button
                onClick={toggleSaved}
                aria-label={conversation.saved ? "Unsave chat" : "Save chat"}
                aria-pressed={conversation.saved}
                title={conversation.saved ? "Saved" : "Save chat"}
                className={iconButton}
                style={{ color: conversation.saved ? "#f5c451" : "var(--ink-400)" }}
              >
                <Star className="h-4 w-4" fill={conversation.saved ? "currentColor" : "none"} />
              </button>
            )}
            <button onClick={clear} disabled={loading} aria-label="New chat" title="New chat" className={`${iconButton} disabled:opacity-30`} style={{ color: "var(--ink-400)" }}>
              <SquarePen className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className={`relative min-h-0 flex-1 space-y-5 overflow-y-auto ${compact ? "py-3" : "py-2"}`}>
        {ready && messages.length === 0 && !background && (
          <div className="space-y-2 pt-4">
            <p className="min-sub mb-3">Tell it anything: it files tasks and reminders, tracks your goals, and keeps you on schedule.</p>
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
        {options.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {options.map((o) => (
              <button
                key={o}
                onClick={() => submit(o)}
                className="rounded-full px-3 py-1.5 text-sm transition-colors hover:bg-[rgba(255,255,255,.1)]"
                style={{ border: "1px solid var(--stroke-2)", color: "var(--ink-200)" }}
              >
                {o}
              </button>
            ))}
          </div>
        )}
        {loading && !streaming && (
          <p className="animate-pulse text-sm" style={{ color: "var(--ink-500)" }}>
            {status ?? "Thinking…"}
          </p>
        )}
        {error && <p className="text-sm" style={{ color: "var(--bad)" }}>{error}</p>}
        <div ref={bottomRef} />
      </div>

      <div className={`relative flex items-end gap-2 rounded-3xl py-1.5 pl-4 pr-1.5 ${compact ? "mb-3" : "mt-3"}`} style={{ background: "rgba(255,255,255,.06)" }}>
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
          placeholder={options.length ? "Tap an answer or type your own" : "Message"}
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
