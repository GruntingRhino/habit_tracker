"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sun,
  MessageSquare,
  ListTodo,
  FolderKanban,
  Repeat,
  UtensilsCrossed,
  Dumbbell,
  BookOpen,
  StickyNote,
  Settings,
  Brain,
  Lock,
} from "lucide-react";

const navLinks = [
  { href: "/today",    label: "Today", icon: Sun },
  { href: "/chat",     label: "Chat", icon: MessageSquare },
  { href: "/todos",    label: "To-dos", icon: ListTodo },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/habits",   label: "Routines", icon: Repeat },
  { href: "/meals",    label: "Meals", icon: UtensilsCrossed },
  { href: "/weights",  label: "Workouts", icon: Dumbbell },
  { href: "/entry",    label: "Journal", icon: BookOpen },
  { href: "/notes",    label: "Notes", icon: StickyNote },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  onClose?: () => void;
}

export default function Sidebar({ onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className="relative flex h-full w-[260px] flex-shrink-0 flex-col"
      style={{
        background: "linear-gradient(180deg, rgba(255,255,255,.02), transparent), var(--bg-deep)",
        borderRight: "1px solid var(--stroke-1)",
        padding: "24px 16px",
      }}
    >
      {/* ── Brand ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-2 mb-6">
        <div className="gh-logo">
          <Brain className="w-5 h-5 text-white" />
        </div>
        <span
          className="text-lg font-semibold"
          style={{
            color: "var(--ink-100)",
            letterSpacing: "-0.01em",
          }}
        >
          LiveImproved
        </span>
      </div>

      {/* ── Navigation ──────────────────────────────────────────────── */}
      <nav className="flex flex-col gap-1 flex-1 overflow-y-auto">
        {navLinks.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");

          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
              style={
                isActive
                  ? {
                      background: "rgba(79, 127, 255, .08)",
                      border: "1px solid rgba(79, 127, 255, .35)",
                      color: "var(--ink-100)",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,.04)",
                    }
                  : {
                      border: "1px solid transparent",
                      color: "var(--ink-300)",
                    }
              }
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.color = "var(--ink-100)";
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.03)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.color = "var(--ink-300)";
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }
              }}
            >
              <Icon
                className="w-[18px] h-[18px] flex-shrink-0"
                style={{ color: isActive ? "var(--blue-400)" : "var(--ink-400)" }}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      <div
        className="mt-4 flex items-center gap-2 px-3 text-[11px]"
        style={{ color: "var(--ink-500)" }}
      >
        <Lock className="w-3 h-3" /> Private · Tailscale only
      </div>
    </aside>
  );
}
