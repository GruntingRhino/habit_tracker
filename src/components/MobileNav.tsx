"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { MOBILE_MORE, MOBILE_TABS, isActive } from "@/components/nav";

export default function MobileNav() {
  const pathname = usePathname();
  const [moreFor, setMoreFor] = useState<string | null>(null);
  const moreOpen = moreFor === pathname;
  const moreActive = MOBILE_MORE.some((n) => isActive(pathname, n.href));

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMoreFor(null)} style={{ background: "rgba(0,0,0,.5)" }}>
          <div
            className="pb-safe absolute inset-x-0 bottom-0 rounded-t-2xl px-4 pt-4"
            style={{ background: "var(--bg-surface)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-3 gap-2">
              {MOBILE_MORE.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMoreFor(null)}
                  className="flex flex-col items-center gap-1.5 rounded-xl py-4 text-xs"
                  style={{ color: isActive(pathname, href) ? "var(--ink-100)" : "var(--ink-400)", background: "rgba(255,255,255,.03)" }}
                >
                  <Icon className="h-5 w-5" strokeWidth={1.8} />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
      <nav
        className="pb-safe fixed inset-x-0 bottom-0 z-50 flex lg:hidden"
        style={{ background: "var(--bg-deep)", borderTop: "1px solid var(--stroke-1)" }}
      >
        {MOBILE_TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link key={href} href={href} className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px]" style={{ color: active ? "var(--ink-100)" : "var(--ink-500)" }}>
              <Icon className="h-5 w-5" strokeWidth={active ? 2.2 : 1.8} />
              {label}
            </Link>
          );
        })}
        <button
          onClick={() => setMoreFor(moreOpen ? null : pathname)}
          className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px]"
          style={{ color: moreOpen || moreActive ? "var(--ink-100)" : "var(--ink-500)" }}
        >
          <MoreHorizontal className="h-5 w-5" />
          More
        </button>
      </nav>
    </>
  );
}
