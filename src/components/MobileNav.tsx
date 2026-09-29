"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, SETTINGS, isActive } from "@/components/nav";

/** Phone: the five sections along the bottom, settings as a small gear at the top right. */
export default function MobileNav() {
  const pathname = usePathname();
  return (
    <>
      <Link
        href={SETTINGS.href}
        aria-label="Settings"
        className="fixed right-3 top-[calc(env(safe-area-inset-top,0px)+10px)] z-40 flex h-8 w-8 items-center justify-center rounded-full lg:hidden"
        style={{ color: isActive(pathname, SETTINGS.href) ? "var(--ink-100)" : "var(--ink-500)" }}
      >
        <SETTINGS.icon className="h-4 w-4" />
      </Link>
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-50 flex lg:hidden" style={{ background: "var(--bg-deep)", borderTop: "1px solid var(--stroke-1)" }}>
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link key={href} href={href} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]" style={{ color: active ? "var(--ink-100)" : "var(--ink-500)" }}>
              <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.2 : 1.8} />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
