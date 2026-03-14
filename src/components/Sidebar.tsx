"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  BookOpen,
  CheckSquare,
  FolderKanban,
  BarChart3,
  Settings,
  Brain,
  LogOut,
  User,
  Dumbbell,
} from "lucide-react";

const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/entry", label: "Daily Entry", icon: BookOpen },
  { href: "/habits", label: "Habits", icon: CheckSquare },
  { href: "/weights", label: "Weights", icon: Dumbbell },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside className="flex flex-col h-screen w-64 bg-[#0f172a] border-r border-[#1e293b] flex-shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-[#1e293b]">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
          <Brain className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-slate-100 text-sm">
          Habit Intelligence
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navLinks.map(({ href, label, icon: Icon }) => {
          const isActive =
            pathname === href || pathname.startsWith(href + "/");

          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-600/20 text-blue-400 border border-blue-500/20"
                  : "text-slate-400 hover:text-slate-100 hover:bg-[#1e293b]"
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User info + logout */}
      <div className="border-t border-[#1e293b] p-3">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="w-8 h-8 rounded-full bg-[#1e293b] flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex-1 min-w-0">
            {session?.user?.name && (
              <p className="text-slate-100 text-xs font-medium truncate">
                {session.user.name}
              </p>
            )}
            <p className="text-slate-500 text-xs truncate">
              {session?.user?.email ?? ""}
            </p>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 text-sm transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
