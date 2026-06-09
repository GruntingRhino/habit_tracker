"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  BookOpen,
  FolderKanban,
  StickyNote,
  Settings,
  Brain,
  LogOut,
  User,
  Users,
  Flame,
} from "lucide-react";
import PetWidget from "@/components/PetWidget";

const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/entry",     label: "Daily Entry", icon: BookOpen },
  { href: "/projects",  label: "Projects", icon: FolderKanban },
  { href: "/social",    label: "Social", icon: Users },
  { href: "/settings",  label: "Settings", icon: Settings },
];

interface SidebarProps {
  onClose?: () => void;
  streak?: number;
}

export default function Sidebar({ onClose, streak = 0 }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();

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
      <nav className="flex flex-col gap-1 flex-1">
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

      {/* ── Streak card ─────────────────────────────────────────────── */}
      {streak > 0 && (
        <div
          className="mx-1 p-3.5 rounded-[14px] mb-6"
          style={{
            background: "rgba(79, 127, 255, .06)",
            border: "1px solid rgba(79, 127, 255, .18)",
          }}
        >
          <div
            className="text-[10px] uppercase mb-1.5"
            style={{
              letterSpacing: ".18em",
              color: "var(--blue-200)",
            }}
          >
            <span className="inline-flex items-center gap-1">
              <Flame className="w-[11px] h-[11px]" /> Current streak
            </span>
          </div>
          <div
            className="text-[28px] leading-none"
            style={{
              fontFamily: "var(--font-display)",
              color: "var(--ink-100)",
              letterSpacing: "-0.02em",
            }}
          >
            {streak} days
          </div>
          <div
            className="text-[11px] mt-1.5"
            style={{ color: "var(--ink-400)" }}
          >
            Don&apos;t break the chain · log today.
          </div>
        </div>
      )}

      {/* ── Pet Widget ────────────────────────────────────────────── */}
      <div className="mt-auto mb-3">
        <PetWidget />
      </div>

      {/* ── User section ────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2.5 p-2.5 rounded-[14px] cursor-pointer"
        style={{
          background: "rgba(255,255,255,.02)",
          border: "1px solid var(--stroke-1)",
        }}
        onClick={() => {
          window.location.href = "/settings";
        }}
      >
        <div
          className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0"
          style={{
            background: "linear-gradient(135deg, #4f7fff, #2cb6ff)",
            color: "white",
            fontSize: "12px",
            fontWeight: 600,
          }}
        >
          {session?.user?.name
            ? session.user.name.charAt(0).toUpperCase()
            : "U"}
        </div>
        <div className="flex-1 min-w-0">
          {session?.user?.name && (
            <p
              className="text-xs font-medium truncate"
              style={{ color: "var(--ink-100)" }}
            >
              {session.user.name}
            </p>
          )}
          <p
            className="text-[11px] truncate"
            style={{ color: "var(--ink-500)" }}
          >
            {session?.user?.email ?? ""}
          </p>
        </div>
        <Settings
          className="w-4 h-4 cursor-pointer transition-colors"
          style={{ color: "var(--ink-500)" }}
          onMouseEnter={(e) =>
            ((e.currentTarget as unknown as HTMLElement).style.color = "var(--ink-200)")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as unknown as HTMLElement).style.color = "var(--ink-500)")
          }
        />
      </div>

      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="flex items-center gap-2 w-full px-3 py-2.5 mt-2 rounded-xl text-sm transition-all duration-150"
        style={{ color: "var(--ink-400)" }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.color = "var(--bad)";
          (e.currentTarget as HTMLElement).style.background =
            "rgba(255, 95, 109, .08)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.color = "var(--ink-400)";
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
      >
        <LogOut className="w-4 h-4" />
        Sign out
      </button>
    </aside>
  );
}
