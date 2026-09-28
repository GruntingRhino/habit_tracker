"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Plus, X } from "lucide-react";
import ChatThread from "@/components/ChatThread";

/** Desktop quick-capture; on phones the Chat tab does this job. */
export default function FloatingCoach() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  if (pathname === "/chat") return null;

  return (
    <div className="hidden lg:block">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close quick capture" : "Quick capture"}
        className="fixed bottom-6 right-6 z-50 flex h-11 w-11 items-center justify-center rounded-full transition-colors"
        style={{ background: "var(--ink-100)", color: "var(--bg-base)" }}
      >
        {open ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
      </button>
      {open && (
        <div
          className="fixed bottom-20 right-6 z-50 flex w-[380px] flex-col overflow-hidden rounded-2xl"
          style={{ height: "min(520px, calc(100vh - 140px))", background: "var(--bg-surface)", border: "1px solid var(--stroke-2)", boxShadow: "0 24px 48px rgba(0,0,0,.5)" }}
        >
          <ChatThread compact />
        </div>
      )}
    </div>
  );
}
