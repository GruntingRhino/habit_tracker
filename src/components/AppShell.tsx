"use client";

import TopBar from "./TopBar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden" style={{ background: "var(--bg-base)" }}>
      <TopBar />
      <main className="relative flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] pt-2 lg:px-10 lg:pb-10">
        {children}
      </main>
    </div>
  );
}
