"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import Sidebar from "./Sidebar";
import FloatingCoach from "./FloatingCoach";
import DailyEntryReminder from "./DailyEntryReminder";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--background)" }}>
      <DailyEntryReminder />

      {/* ── Desktop sidebar (always visible) ── */}
      <div className="hidden lg:block flex-shrink-0">
        <Sidebar />
      </div>

      {/* ── Mobile backdrop ── */}
      {open && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: "rgba(6,13,28,0.8)", backdropFilter: "blur(4px)" }}
          onClick={() => setOpenPath(null)}
        />
      )}

      {/* ── Mobile sidebar (slides in from left) ── */}
      <div
        className="fixed inset-y-0 left-0 z-50 lg:hidden transition-transform duration-300 ease-out"
        style={{ transform: open ? "translateX(0)" : "translateX(-100%)" }}
      >
        <Sidebar onClose={() => setOpenPath(null)} />
      </div>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-y-auto relative">
        {children}
      </main>

      {/* ── Floating AI Coach (bottom-right) ── */}
      <FloatingCoach />

      {/* ── Mobile FAB toggle (bottom-left) ── */}
      <button
        onClick={() =>
          setOpenPath((current) => (current === pathname ? null : pathname))
        }
        aria-label={open ? "Close menu" : "Open menu"}
        className="fixed bottom-5 left-5 z-50 lg:hidden w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200"
        style={{
          background: open
            ? "linear-gradient(135deg, #334d6e, #1e3050)"
            : "linear-gradient(135deg, #4f72ff 0%, #22d3ee 100%)",
          boxShadow: open
            ? "0 0 12px rgba(30,48,80,0.6), 0 4px 12px rgba(0,0,0,0.4)"
            : "0 0 20px rgba(79,114,255,0.45), 0 4px 12px rgba(0,0,0,0.4)",
        }}
      >
        {open
          ? <X    className="w-5 h-5 text-white" />
          : <Menu className="w-5 h-5 text-white" />
        }
      </button>
    </div>
  );
}
