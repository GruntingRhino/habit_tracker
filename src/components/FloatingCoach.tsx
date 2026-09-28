"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquarePlus, X } from "lucide-react";
import ChatThread from "@/components/ChatThread";

/** Quick-capture chat available on every page (hidden on /chat itself). */
export default function FloatingCoach() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  if (pathname === "/chat") return null;

  return (
    <>
      <button
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Close quick capture" : "Open quick capture"}
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full transition-all duration-200 sm:bottom-5 sm:right-5 lg:bottom-6 lg:right-6"
        style={{
          background: open ? "linear-gradient(135deg, #1e3050, #334d6e)" : "linear-gradient(135deg, var(--blue-400), var(--cyan-400))",
          boxShadow: open ? "0 4px 12px rgba(0,0,0,0.5)" : "0 0 20px rgba(79,127,255,0.45), 0 4px 12px rgba(0,0,0,0.4)",
        }}
      >
        {open ? <X className="h-5 w-5 text-white" /> : <MessageSquarePlus className="h-5 w-5 text-white" />}
      </button>
      {open && (
        <div
          className="fixed bottom-20 right-3 z-50 flex w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl sm:right-5 sm:w-[380px] lg:bottom-24 lg:right-6"
          style={{
            height: "min(520px, calc(100vh - 140px))",
            background: "var(--bg-deep)",
            border: "1px solid var(--stroke-2)",
            boxShadow: "0 24px 48px rgba(0,0,0,0.6)",
          }}
        >
          <div className="px-4 py-3 text-sm font-semibold" style={{ color: "var(--ink-100)", borderBottom: "1px solid var(--stroke-1)" }}>
            Quick capture
          </div>
          <ChatThread compact />
        </div>
      )}
    </>
  );
}
