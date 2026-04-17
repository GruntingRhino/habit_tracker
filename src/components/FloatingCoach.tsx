"use client";

import { useState, useEffect, useRef } from "react";
import { Bot, X, Send, Loader2, Sparkles, MessageSquare } from "lucide-react";

interface CoachMessage {
  role: "user" | "assistant";
  content: string;
}

const QUICK_PROMPTS = [
  "What habits should I add?",
  "How am I doing?",
  "Best morning routine?",
  "How to stay consistent?",
];

export default function FloatingCoach() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && !initialized) {
      setInitialized(true);
      void sendMessage(null);
    }
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(userText: string | null) {
    const newMessages: CoachMessage[] = userText
      ? [...messages, { role: "user" as const, content: userText }]
      : [{ role: "user" as const, content: "Hello! Briefly introduce yourself and tell me what you can help me with as my habit coach." }];

    if (userText) setMessages(newMessages);
    setLoading(true);
    try {
      const res = await fetch("/api/chat/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json() as { message: string };
      const assistantMsg: CoachMessage = { role: "assistant", content: data.message };
      setMessages((prev) => {
        const base = userText ? prev : [];
        return [...base, assistantMsg];
      });
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Connection issue. Try again in a moment." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    void sendMessage(text);
  }

  function handleQuickPrompt(prompt: string) {
    setInput("");
    void sendMessage(prompt);
  }

  return (
    <>
      {/* Floating button — bottom-right, avoids mobile menu FAB on left */}
      <button
        onClick={() => setOpen((v) => !v)}
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
        {open
          ? <X className="w-5 h-5 text-white" />
          : <Bot className="w-5 h-5 text-white" />
        }
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-20 right-5 z-50 flex flex-col rounded-2xl overflow-hidden w-[340px] sm:w-[380px] lg:right-6 lg:bottom-24"
          style={{
            height: "min(520px, calc(100vh - 140px))",
            background: "linear-gradient(180deg, #060e20 0%, #070d1d 100%)",
            border: "1px solid rgba(79,114,255,0.2)",
            boxShadow: "0 0 60px rgba(6,13,28,0.9), 0 24px 48px rgba(0,0,0,0.6)",
          }}
        >
          {/* Header */}
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
              <p className="text-sm font-semibold" style={{ color: "#c8deff" }}>AI Coach</p>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <p className="text-xs" style={{ color: "#3d5a7a" }}>Online · Habit Intelligence</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: "#3d5a7a" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#c8deff")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#3d5a7a")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick prompts */}
          <div
            className="flex gap-2 px-3 py-2.5 overflow-x-auto flex-shrink-0"
            style={{ borderBottom: "1px solid rgba(40, 76, 140, 0.15)" }}
          >
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => handleQuickPrompt(prompt)}
                disabled={loading}
                className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all disabled:opacity-40"
                style={{
                  background: "rgba(79,114,255,0.08)",
                  border: "1px solid rgba(79,114,255,0.2)",
                  color: "#7a9eff",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(79,114,255,0.15)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(79,114,255,0.08)";
                }}
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
            {messages.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center h-full gap-3 py-8">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.25)" }}
                >
                  <Sparkles className="w-5 h-5" style={{ color: "#a78bfa" }} />
                </div>
                <p className="text-xs text-center" style={{ color: "#3d5a7a" }}>
                  Starting session...
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex items-end gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
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
                  className={`max-w-[82%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed ${
                    msg.role === "assistant" ? "rounded-bl-md" : "rounded-br-md"
                  }`}
                  style={
                    msg.role === "assistant"
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
                  {msg.content}
                </div>
                {msg.role === "user" && (
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

            {loading && (
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

          {/* Input */}
          <div
            className="p-3 flex gap-2 flex-shrink-0"
            style={{ borderTop: "1px solid rgba(40, 76, 140, 0.25)" }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask your coach anything..."
              disabled={loading}
              className="flex-1 rounded-xl text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none disabled:opacity-50 px-3 py-2"
              style={{
                background: "rgba(6, 13, 28, 0.8)",
                border: "1px solid rgba(40, 76, 140, 0.35)",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "rgba(124,58,237,0.5)";
                e.target.style.boxShadow = "0 0 0 2px rgba(124,58,237,0.08)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "rgba(40, 76, 140, 0.35)";
                e.target.style.boxShadow = "none";
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
      )}
    </>
  );
}
