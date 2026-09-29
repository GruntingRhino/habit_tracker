"use client";

import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[100dvh] overflow-hidden" style={{ background: "var(--bg-base)" }}>
      <div className="hidden h-full lg:block">
        <Sidebar />
      </div>
      <main className="relative flex-1 overflow-y-auto px-4 pt-[calc(env(safe-area-inset-top,0px)+16px)] pb-[calc(env(safe-area-inset-bottom,0px)+72px)] lg:px-10 lg:pt-7 lg:pb-10">
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
