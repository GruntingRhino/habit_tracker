"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, isActive } from "@/components/nav";
import { LiveImprovedMark } from "@/components/brand/LiveImprovedLogo";

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-[208px] flex-shrink-0 flex-col px-4 py-8" style={{ borderRight: "1px solid var(--stroke-1)" }}>
      <div className="mb-8 flex items-center gap-2 px-2 text-sm font-semibold tracking-tight" style={{ color: "var(--ink-100)" }}>
        <LiveImprovedMark className="h-4 w-4" />
        LiveImproved
      </div>
      <nav className="flex flex-1 flex-col gap-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:text-[var(--ink-100)]"
              style={{ color: active ? "var(--ink-100)" : "var(--ink-500)", background: active ? "rgba(255,255,255,.04)" : "transparent" }}
            >
              <Icon className="h-4 w-4" strokeWidth={active ? 2.2 : 1.8} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
