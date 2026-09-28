"use client";

import { useEffect, useState } from "react";
import ChatThread from "@/components/ChatThread";

export default function ChatPage() {
  const [up, setUp] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((s: { up: boolean }) => setUp(s.up))
      .catch(() => setUp(false));
  }, []);

  return (
    <div className="min-page flex h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-120px)] flex-col lg:h-[calc(100vh-7rem)]">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="min-h1">Chat</h1>
        {up !== null && (
          <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--ink-500)" }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: up ? "var(--good)" : "var(--bad)" }} />
            Spark {up ? "ready" : "offline"}
          </span>
        )}
      </header>
      <ChatThread />
    </div>
  );
}
