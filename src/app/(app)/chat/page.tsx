"use client";

import { useEffect, useState } from "react";
import ChatThread from "@/components/ChatThread";

function ModelStatus() {
  const [status, setStatus] = useState<{ model: string; up: boolean } | null>(null);
  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);
  if (!status) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--ink-500)" }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: status.up ? "var(--good)" : "var(--bad)" }} />
      {status.model} {status.up ? "loaded" : "offline"}
    </span>
  );
}

export default function ChatPage() {
  return (
    <div className="mx-auto flex h-[calc(100vh-112px)] max-w-3xl flex-col">
      <div className="mb-2 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--ink-100)" }}>
          Chat
        </h1>
        <ModelStatus />
      </div>
      <ChatThread />
    </div>
  );
}
