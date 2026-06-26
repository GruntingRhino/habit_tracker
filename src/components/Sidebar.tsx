"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { LiveImprovedTileIcon } from "@/components/brand/LiveImprovedLogo";
import {
  LayoutDashboard,
  BookOpen,
  FolderKanban,
  StickyNote,
  Settings,
  LogOut,
  User,
  Users,
} from "lucide-react";

const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/entry", label: "Daily Work", icon: BookOpen },
  { href: "/projects", label: "Plans", icon: FolderKanban },
  { href: "/notes", label: "Notes", icon: StickyNote },
  { href: "/social", label: "Social", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  onClose?: () => void;
}

export default function Sidebar({ onClose }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside
      className="relative flex h-full w-[260px] flex-shrink-0 flex-col"
      style={{
        background: "var(--background)",
        borderRight: "1px solid rgba(40,76,140,0.2)",
      }}
    >
      <div
        className="flex items-center gap-2.5 px-[18px] py-4"
        style={{ borderBottom: "1px solid rgba(40,76,140,0.18)" }}
      >
        <LiveImprovedTileIcon className="h-[26px] w-[26px] flex-shrink-0" />
        <span
          style={{
            fontFamily: "var(--font-instrument-serif), serif",
            fontStyle: "italic",
            fontSize: "16px",
            color: "var(--text-primary)",
            letterSpacing: "-0.01em",
          }}
        >
          LiveImproved
        </span>
      </div>

      <nav className="flex-1 px-2.5 py-3 space-y-px overflow-y-auto">
        {navLinks.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");

          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className="flex items-center gap-2.5 px-2.5 py-[7px] rounded-[7px] text-[12px] transition-colors duration-150"
              style={{
                borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                fontWeight: isActive ? 500 : 400,
                paddingLeft: isActive ? 9 : 10,
                background: "transparent",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
                }
              }}
            >
              <Icon className="w-[13px] h-[13px] flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div
        className="p-3"
        style={{ borderTop: "1px solid rgba(40,76,140,0.18)" }}
      >
        <div className="flex items-center gap-2.5 px-2.5 py-2 mb-1 rounded-[7px]">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
            style={{
              background: "rgba(79,114,255,0.12)",
              border: "1px solid rgba(79,114,255,0.18)",
            }}
          >
            <User className="w-3 h-3" style={{ color: "var(--text-secondary)" }} />
          </div>
          <p
            className="text-[11px] font-medium flex-1 truncate"
            style={{ color: "var(--text-secondary)" }}
          >
            {session?.user?.name ?? session?.user?.email ?? "Account"}
          </p>
          <Link
            href="/settings"
            onClick={onClose}
            className="transition-colors flex-shrink-0"
            style={{ color: "var(--text-muted)" }}
            title="Settings"
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-secondary)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-muted)")}
          >
            <Settings className="w-3 h-3" />
          </Link>
        </div>

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-[7px] text-[10px] transition-colors duration-150"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
          }}
        >
          <LogOut className="w-3 h-3" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
