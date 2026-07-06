"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, BookOpen, FolderKanban, StickyNote } from "lucide-react";
import Sidebar from "./Sidebar";
import FloatingCoach from "./FloatingCoach";
import DailyEntryReminder from "./DailyEntryReminder";

const mobileNav = [
  { href: "/dashboard", label: "Home",  icon: LayoutDashboard },
  { href: "/entry",     label: "Daily", icon: BookOpen },
  { href: "/projects",  label: "Plans", icon: FolderKanban },
  { href: "/notes",     label: "Notes", icon: StickyNote },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div
      className="flex h-dvh min-h-dvh flex-col overflow-hidden lg:flex-row"
      style={{ background: "var(--bg-base)" }}
    >
      <DailyEntryReminder />

      {/* Desktop sidebar */}
      <div className="hidden lg:block flex-shrink-0">
        <Sidebar />
      </div>

      <main className="relative min-h-0 w-full flex-1 overflow-y-auto">
        {children}
      </main>

      {/* Floating AI Coach — desktop only */}
      <div className="hidden lg:block">
        <FloatingCoach />
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        className="z-40 flex flex-shrink-0 items-start pt-2 lg:hidden"
        style={{
          height: "calc(72px + env(safe-area-inset-bottom))",
          paddingBottom: "env(safe-area-inset-bottom)",
          background: "linear-gradient(180deg, var(--bg-surface, #0c1830) 0%, var(--background, #060d1c) 100%)",
          borderTop: "1px solid rgba(40,76,140,0.2)",
        }}
      >
        {mobileNav.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center gap-1 py-1"
            >
              <div
                className="flex items-center justify-center rounded-[10px]"
                style={{
                  width: 34,
                  height: 26,
                  background: isActive ? "rgba(79,114,255,0.12)" : "transparent",
                  transition: "background 0.15s",
                }}
              >
                <Icon
                  className="w-[15px] h-[15px]"
                  style={{ color: isActive ? "var(--accent, #4f72ff)" : "#334d6e" }}
                />
              </div>
              <span
                className="text-[9px] leading-none"
                style={{
                  color: isActive ? "var(--accent, #4f72ff)" : "#334d6e",
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
