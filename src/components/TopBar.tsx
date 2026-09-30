"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Home } from "lucide-react";
import { NAV, SETTINGS, isActive } from "@/components/nav";

/** Top bar on every page: home on the left, a dropdown to every section on the right. */
export default function TopBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = [...NAV, SETTINGS].find((n) => isActive(pathname, n.href));

  // Close when tapping outside or after navigating.
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between px-4 pb-2 pt-[calc(env(safe-area-inset-top,0px)+10px)] lg:px-10" style={{ background: "var(--bg-base)" }}>
      <Link href="/home" aria-label="Home" className="flex items-center gap-2 text-sm font-semibold" style={{ color: pathname === "/home" ? "var(--ink-100)" : "var(--ink-300)" }}>
        <Home className="h-4 w-4" />
        <span>LiveImproved</span>
      </Link>
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Go to page"
          className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm"
          style={{ borderColor: "var(--stroke-2)", color: "var(--ink-100)" }}
        >
          {current?.label ?? "Menu"}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <nav role="menu" className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border py-1 shadow-xl" style={{ borderColor: "var(--stroke-2)", background: "var(--bg-elev-2)" }}>
            {[...NAV, SETTINGS].map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-white/[.06]"
                  style={{ color: active ? "var(--ink-100)" : "var(--ink-300)", background: active ? "rgba(255,255,255,.05)" : undefined }}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </nav>
        )}
      </div>
    </header>
  );
}
