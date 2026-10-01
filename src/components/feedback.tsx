"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Making it obvious a tap worked: a button that spins while busy, draws a ✓ and says so when it's
 * done (or shakes and says why when it didn't), and small toasts for things that change elsewhere.
 */

// ---- toasts -------------------------------------------------------------------------------------

type Toast = { id: number; text: string; kind: "ok" | "error"; leaving?: boolean };
const EVENT = "liveimproved:toast";
let seq = 0;

/** "✓ Password changed" at the bottom of the screen for ~2.5 s. */
export function toast(text: string, kind: "ok" | "error" = "ok") {
  window.dispatchEvent(new CustomEvent<Toast>(EVENT, { detail: { id: ++seq, text, kind } }));
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<Toast>).detail;
      setItems((l) => [...l.slice(-2), t]);
      setTimeout(() => setItems((l) => l.map((x) => (x.id === t.id ? { ...x, leaving: true } : x))), 2400);
      setTimeout(() => setItems((l) => l.filter((x) => x.id !== t.id)), 2700);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return (
    <div aria-live="polite" role="status">
      {items.map((t, i) => (
        <div key={t.id} className="toast" data-kind={t.kind} data-leaving={t.leaving ? "true" : "false"} style={{ bottom: `calc(env(safe-area-inset-bottom, 0px) + ${22 + (items.length - 1 - i) * 52}px)` }}>
          {t.kind === "ok" ? <DoneCheck size={16} /> : <span aria-hidden>✕</span>}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

// ---- pieces -------------------------------------------------------------------------------------

/** A ✓ that draws itself. */
export function DoneCheck({ size = 14, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg className="fx-check flex-shrink-0" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Spinner({ size = 13 }: { size?: number }) {
  return (
    <svg className="fx-spin flex-shrink-0" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ---- the button ---------------------------------------------------------------------------------

type State = "idle" | "busy" | "done" | "error";

/**
 * An action that returns a promise. Resolve → ✓ + doneLabel (and the toast, if given); throw (or
 * return false) → shake + the error's message. Goes back to normal after ~2 s.
 */
export function ActionButton({
  onAction,
  children,
  doneLabel = "Done",
  busyLabel,
  toastText,
  className = "min-btn",
  style,
  disabled,
  type = "button",
  title,
  ariaLabel,
}: {
  onAction: () => Promise<unknown> | unknown;
  children: React.ReactNode;
  doneLabel?: React.ReactNode;
  busyLabel?: React.ReactNode;
  toastText?: string;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
  ariaLabel?: string;
}) {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  async function run(e?: React.MouseEvent) {
    if (type === "submit") e?.preventDefault();
    if (state === "busy") return;
    setState("busy");
    setError(null);
    try {
      const r = await onAction();
      if (r === false) throw new Error("Didn't work — try again");
      setState("done");
      if (toastText) toast(toastText);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Didn't work — try again");
      setState("error");
    }
    timer.current = setTimeout(() => setState("idle"), 2000);
  }

  return (
    <button
      type={type}
      onClick={run}
      disabled={disabled || state === "busy"}
      title={title}
      aria-label={ariaLabel}
      aria-busy={state === "busy"}
      className={`${className} inline-flex items-center gap-1.5 ${state === "done" ? "fx-flash" : ""} ${state === "error" ? "fx-shake" : ""}`}
      style={{ ...style, ...(state === "done" ? { color: "var(--good)" } : state === "error" ? { color: "var(--bad)" } : {}) }}
    >
      {state === "busy" && <Spinner />}
      {state === "done" && <DoneCheck />}
      {state === "busy" ? busyLabel ?? children : state === "done" ? doneLabel : state === "error" ? error : children}
    </button>
  );
}

/** For fetch-based actions: throws the server's error message on a non-OK response. */
export async function must(res: Response | null, fallback = "Didn't work — try again") {
  if (res?.ok) return res;
  throw new Error((await res?.json().catch(() => null))?.error ?? fallback);
}

/** After a fetch: a ✓ toast when it worked, a red one when it didn't. Returns the response. */
export function report<T extends Response | null | undefined>(res: T, okText: string, failText = "That didn't save — try again"): T {
  if (res && res.ok) toast(okText);
  else toast(failText, "error");
  return res;
}
