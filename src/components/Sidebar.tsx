"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, SETTINGS, isActive } from "@/components/nav";
import { LiveImprovedMark } from "@/components/brand/LiveImprovedLogo";

export default function Sidebar() {
  const pathname = usePathname();
  const link = (href: string, active: boolean) => ({
    className: "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors hover:text-[var(--ink-100)]",
    style: { color: active ? "var(--ink-100)" : "var(--ink-500)", background: active ? "rgba(255,255,255,.04)" : "transparent" },
    href,
  });

  return (
    <aside className="flex h-full w-[168px] flex-shrink-0 flex-col px-3 py-5" style={{ borderRight: "1px solid var(--stroke-1)" }}>
      <div className="mb-5 flex items-center gap-2 px-2 text-[13px] font-semibold tracking-tight" style={{ color: "var(--ink-100)" }}>
        <LiveImprovedMark className="h-4 w-4" />
        LiveImproved
      </div>
      <nav className="flex flex-1 flex-col gap-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link key={href} {...link(href, active)}>
              <Icon className="h-4 w-4" strokeWidth={active ? 2.2 : 1.8} />
              {label}
            </Link>
          );
        })}
      </nav>
      <Link {...link(SETTINGS.href, isActive(pathname, SETTINGS.href))} aria-label="Settings">
        <SETTINGS.icon className="h-4 w-4" strokeWidth={1.8} />
        Settings
      </Link>
    </aside>
  );
}
