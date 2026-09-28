"use client";

import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import FloatingCoach from "./FloatingCoach";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[100dvh] overflow-hidden" style={{ background: "var(--bg-base)" }}>
      <div className="hidden h-full lg:block">
        <Sidebar />
      </div>
      <main
        className="relative flex-1 overflow-y-auto px-5 pt-[calc(env(safe-area-inset-top,0px)+24px)] pb-[calc(env(safe-area-inset-bottom,0px)+96px)] lg:px-12 lg:pt-12 lg:pb-16"
      >
        {children}
      </main>
      <FloatingCoach />
      <MobileNav />
    </div>
  );
}
