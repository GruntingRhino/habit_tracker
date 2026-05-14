"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, MessageSquare, Send, Sparkles, X } from "lucide-react";
import CoachActionButtons from "@/components/CoachActionButtons";
import { useCoachChat } from "@/hooks/useCoachChat";

const CATEGORY_DOT_COLORS: Record<string, string> = {
  physical: "#22c55e",
  financial: "#10b981",
  focus: "#3b82f6",
  mental: "#a855f7",
  appearance: "#f59e0b",
  general: "#64748b",
};

const QUICK_PROMPTS = [
  "Audit my goals — where am I falling short?",
  "What habits am I missing for my goals?",
  "Which of my habits are underperforming?",
  "Build me a game plan for this week",
];

function FloatingCoachPanel() {
  const { messages, goals, loading, ready, error, sendMessage, applyAction, pendingActionIds } =
    useCoachChat();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function handleSend() {
    const value = input.trim();
    if (!value || loading) return;
    setInput("");
    void sendMessage(value);
  }

  return (
    <div
      className="fixed bottom-20 right-5 z-50 flex flex-col rounded-2xl overflow-hidden w-[340px] sm:w-[380px] lg:right-6 lg:bottom-24"
      style={{
        height: "min(560px, calc(100vh - 140px))",
        background: "linear-gradient(180deg, #060e20 0%, #070d1d 100%)",
        border: "1px solid rgba(79,114,255,0.2)",
        boxShadow: "0 0 60px rgba(6,13,28,0.9), 0 24px 48px rgba(0,0,0,0.6)",
      }}
    >
      <div
        className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(40, 76, 140, 0.25)" }}
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #7c3aed 0%, #4f72ff 100%)" }}
        >
          <Bot className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: "#c8deff" }}>
            AI Coach
          </p>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
            <p className="text-xs" style={{ color: "#3d5a7a" }}>
              Persistent memory · Goal aware
            </p>
          </div>
        </div>
      </div>

      <div
        className="px-3 py-2.5 flex flex-wrap gap-2 flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(40, 76, 140, 0.15)" }}
      >
        {goals.length > 0 ? (
          goals.map((goal) => {
            const dotColor = CATEGORY_DOT_COLORS[goal.category] ?? CATEGORY_DOT_COLORS.general;
            return (
              <span
                key={goal.id}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
                style={{
                  background: "rgba(79,114,255,0.08)",
                  border: "1px solid rgba(79,114,255,0.15)",
                  color: "#8fb4ff",
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: dotColor }}
                />
                {goal.priority === "high" && <span className="text-[9px] text-amber-400">↑</span>}
                {goal.title}
              </span>
            );
          })
        ) : (
          <span className="text-[11px]" style={{ color: "#516b89" }}>
            No remembered goals yet — tell me what you&apos;re working toward
          </span>
        )}
      </div>

      <div
        className="flex gap-2 px-3 py-2.5 overflow-x-auto flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(40, 76, 140, 0.15)" }}
      >
        {QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => void sendMessage(prompt)}
            disabled={loading}
            className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all disabled:opacity-40"
            style={{
              background: "rgba(79,114,255,0.08)",
              border: "1px solid rgba(79,114,255,0.2)",
              color: "#7a9eff",
            }}
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {!ready && loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-8">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{
                background: "rgba(124,58,237,0.15)",
                border: "1px solid rgba(124,58,237,0.25)",
              }}
            >
              <Sparkles className="w-5 h-5" style={{ color: "#a78bfa" }} />
            </div>
            <p className="text-xs text-center" style={{ color: "#3d5a7a" }}>
              Loading coach context...
            </p>
          </div>
        )}

        {error && (
          <div
            className="rounded-xl px-3 py-2 text-xs"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              color: "#fca5a5",
            }}
          >
            {error}
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex items-end gap-2 ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {message.role === "assistant" && (
              <div
                className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-lg mb-0.5"
                style={{
                  background: "rgba(124,58,237,0.2)",
                  border: "1px solid rgba(124,58,237,0.3)",
                }}
              >
                <Bot className="w-3 h-3" style={{ color: "#a78bfa" }} />
              </div>
            )}
            <div
              className={`max-w-[84%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed ${
                message.role === "assistant" ? "rounded-bl-md" : "rounded-br-md"
              }`}
              style={
                message.role === "assistant"
                  ? {
                      background: "rgba(10, 18, 36, 0.95)",
                      border: "1px solid rgba(40, 76, 140, 0.3)",
                      color: "#c8deff",
                    }
                  : {
                      background: "linear-gradient(135deg, #4f72ff 0%, #3d5ee6 100%)",
                      color: "#ffffff",
                    }
              }
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
              {message.role === "assistant" && (
                <CoachActionButtons
                  actions={message.actions}
                  onApply={applyAction}
                  pendingActionIds={pendingActionIds}
                  variant="floating"
                />
              )}
            </div>
            {message.role === "user" && (
              <div
                className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-lg mb-0.5"
                style={{
                  background: "rgba(79,114,255,0.15)",
                  border: "1px solid rgba(79,114,255,0.25)",
                }}
              >
                <MessageSquare className="w-3 h-3" style={{ color: "#7a9eff" }} />
              </div>
            )}
          </div>
        ))}

        {loading && ready && (
          <div className="flex items-end gap-2 justify-start">
            <div
              className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-lg"
              style={{
                background: "rgba(124,58,237,0.2)",
                border: "1px solid rgba(124,58,237,0.3)",
              }}
            >
              <Bot className="w-3 h-3" style={{ color: "#a78bfa" }} />
            </div>
            <div
              className="rounded-2xl rounded-bl-md px-4 py-3"
              style={{
                background: "rgba(10, 18, 36, 0.95)",
                border: "1px solid rgba(40, 76, 140, 0.3)",
              }}
            >
              <div className="flex gap-1 items-center">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div
        className="p-3 flex gap-2 flex-shrink-0"
        style={{ borderTop: "1px solid rgba(40, 76, 140, 0.25)" }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
          placeholder="Ask about goals, habits, projects, or your logs..."
          disabled={loading}
          className="flex-1 rounded-xl text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none disabled:opacity-50 px-3 py-2"
          style={{
            background: "rgba(6, 13, 28, 0.8)",
            border: "1px solid rgba(40, 76, 140, 0.35)",
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: "linear-gradient(135deg, #7c3aed 0%, #4f72ff 100%)",
          }}
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function FloatingCoach() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Close AI Coach" : "Open AI Coach"}
        className="fixed bottom-5 right-5 z-50 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 lg:bottom-6 lg:right-6"
        style={{
          background: open
            ? "linear-gradient(135deg, #1e3050, #334d6e)"
            : "linear-gradient(135deg, #7c3aed 0%, #4f72ff 100%)",
          boxShadow: open
            ? "0 4px 12px rgba(0,0,0,0.5)"
            : "0 0 20px rgba(124,58,237,0.5), 0 4px 12px rgba(0,0,0,0.4)",
        }}
      >
        {open ? <X className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-white" />}
      </button>
      {open && <FloatingCoachPanel />}
    </>
  );
}
