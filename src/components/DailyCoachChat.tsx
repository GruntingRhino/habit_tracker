"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Send } from "lucide-react";
import CoachActionButtons from "@/components/CoachActionButtons";
import { useCoachChat } from "@/hooks/useCoachChat";

export default function DailyCoachChat() {
  const { messages, goals, loading, ready, error, sendMessage, applyAction, pendingActionIds } =
    useCoachChat();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

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
    <section className="mt-8">
      <div className="mb-4 flex items-center gap-2">
        <Bot className="h-4 w-4 text-blue-300" />
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          Daily Coach
        </h2>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {goals.length > 0 ? (
          goals.slice(0, 4).map((goal) => (
            <span
              key={goal.id}
              className="inline-flex items-center rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[11px] font-medium text-blue-200"
            >
              {goal.title}
            </span>
          ))
        ) : (
          <span className="text-xs text-slate-500">Tell the coach your goals and it will remember them here.</span>
        )}
      </div>

      <div className="rounded-3xl border border-[#1f2937] bg-[#0a0f1a] overflow-hidden">
        <div className="h-96 overflow-y-auto p-5 space-y-4">
          {!ready && loading && (
            <p className="text-sm text-slate-500 italic">Loading coach context...</p>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} gap-3`}
            >
              {message.role === "assistant" && (
                <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-300">
                  <Bot className="h-3.5 w-3.5" />
                </div>
              )}

              <div
                className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  message.role === "assistant"
                    ? "rounded-tl-md border border-[#1f2937] bg-[#0f172a] text-slate-100"
                    : "rounded-tr-md bg-blue-600 text-white"
                }`}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.role === "assistant" && (
                  <CoachActionButtons
                    actions={message.actions}
                    onApply={applyAction}
                    pendingActionIds={pendingActionIds}
                    variant="panel"
                  />
                )}
              </div>
            </div>
          ))}

          {loading && ready && (
            <div className="flex justify-start gap-3">
              <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-300">
                <Bot className="h-3.5 w-3.5" />
              </div>
              <div className="rounded-2xl rounded-tl-md border border-[#1f2937] bg-[#0f172a] px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-blue-300" />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="border-t border-[#1f2937] p-4 flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask about goals, habits, projects, or today..."
            disabled={loading}
            className="flex-1 rounded-xl border border-[#334155] bg-[#111827] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/40 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
