"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  BookOpen,
  FolderKanban,
  Settings,
  Brain,
  LogOut,
  User,
} from "lucide-react";

const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/entry",     label: "Daily Entry", icon: BookOpen },
  { href: "/projects",  label: "Projects",    icon: FolderKanban },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside
      className="flex flex-col h-screen w-64 flex-shrink-0 relative"
      style={{
        background: "linear-gradient(180deg, #060e20 0%, #070d1d 100%)",
        borderRight: "1px solid rgba(40, 76, 140, 0.25)",
      }}
    >
      {/* Subtle inner glow on right edge */}
      <div
        className="absolute inset-y-0 right-0 w-px pointer-events-none"
        style={{ background: "linear-gradient(180deg, transparent 0%, rgba(79,114,255,0.2) 40%, rgba(79,114,255,0.1) 70%, transparent 100%)" }}
      />

      {/* ── Brand ───────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-5 py-5"
        style={{ borderBottom: "1px solid rgba(40, 76, 140, 0.2)" }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: "linear-gradient(135deg, #4f72ff 0%, #22d3ee 100%)",
            boxShadow: "0 0 16px rgba(79, 114, 255, 0.35)",
          }}
        >
          <Brain className="w-4 h-4 text-white" />
        </div>
        <span
          className="font-semibold text-sm tracking-wide"
          style={{
            fontFamily: "'Syne', sans-serif",
            background: "linear-gradient(135deg, #c8deff 0%, #a0bfff 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          Habit Intelligence
        </span>
      </div>

      {/* ── Navigation ──────────────────────────────────────────────── */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navLinks.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");

          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 relative group"
              style={
                isActive
                  ? {
                      background: "linear-gradient(135deg, rgba(79,114,255,0.18) 0%, rgba(79,114,255,0.06) 100%)",
                      border: "1px solid rgba(79,114,255,0.28)",
                      color: "#a8c4ff",
                      boxShadow: "0 0 12px rgba(79,114,255,0.12)",
                    }
                  : {
                      border: "1px solid transparent",
                      color: "rgba(107, 140, 184, 0.9)",
                    }
              }
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = "rgba(18, 36, 66, 0.7)";
                  (e.currentTarget as HTMLElement).style.color = "#c8deff";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                  (e.currentTarget as HTMLElement).style.color = "rgba(107, 140, 184, 0.9)";
                }
              }}
            >
              {isActive && (
                <div
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full"
                  style={{ background: "linear-gradient(180deg, #4f72ff, #22d3ee)" }}
                />
              )}
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* ── User section ────────────────────────────────────────────── */}
      <div
        className="p-3"
        style={{ borderTop: "1px solid rgba(40, 76, 140, 0.2)" }}
      >
        <div
          className="flex items-center gap-3 px-3 py-2.5 mb-1 rounded-lg"
          style={{ background: "rgba(12, 24, 48, 0.6)" }}
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, rgba(79,114,255,0.2), rgba(34,211,238,0.2))",
              border: "1px solid rgba(79,114,255,0.2)",
            }}
          >
            <User className="w-3.5 h-3.5" style={{ color: "#7a9cc4" }} />
          </div>
          <div className="flex-1 min-w-0">
            {session?.user?.name && (
              <p className="text-xs font-medium truncate" style={{ color: "#c8deff" }}>
                {session.user.name}
              </p>
            )}
            <p className="text-xs truncate" style={{ color: "#334d6e" }}>
              {session?.user?.email ?? ""}
            </p>
          </div>
          <Link
            href="/settings"
            className="transition-colors"
            style={{ color: "#334d6e" }}
            title="Settings"
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#7a9cc4")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#334d6e")}
          >
            <Settings className="w-3.5 h-3.5" />
          </Link>
        </div>

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-all duration-150"
          style={{ color: "#3d5a7a" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "#ff6b7a";
            (e.currentTarget as HTMLElement).style.background = "rgba(255, 77, 106, 0.08)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = "#3d5a7a";
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }}
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
