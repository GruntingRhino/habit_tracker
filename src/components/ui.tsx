"use client";

import { Check as CheckIcon } from "lucide-react";
import { AREA_META, normalizeArea } from "@/lib/areas";

export function PageHeader({ title, sub, action }: { title: string; sub?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <header className="mb-8 flex items-end justify-between gap-4">
      <div>
        {sub && <p className="min-sub mb-1">{sub}</p>}
        <h1 className="min-h1">{title}</h1>
      </div>
      {action}
    </header>
  );
}

export function Section({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="min-label">{label}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function AreaDot({ area }: { area?: string | null }) {
  const meta = AREA_META[normalizeArea(area)];
  return <span title={meta.label} className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: meta.color }} />;
}

export function Checkbox({ checked, onClick, label }: { checked: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={checked}
      className="group flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full transition-colors"
      style={{ border: `1.5px solid ${checked ? "var(--ink-300)" : "var(--stroke-3)"}`, background: checked ? "var(--ink-300)" : "transparent" }}
    >
      <CheckIcon
        className={`h-2.5 w-2.5 transition-opacity ${checked ? "opacity-100" : "opacity-0 group-hover:opacity-50"}`}
        strokeWidth={3}
        style={{ color: checked ? "var(--bg-base)" : "var(--ink-300)" }}
      />
    </button>
  );
}

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-5">
      {options.map(([v, label]) => (
        <button key={v} className="min-tab" data-active={v === value} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-sm" style={{ color: "var(--ink-500)" }}>{children}</p>;
}
