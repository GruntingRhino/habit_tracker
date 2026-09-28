"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Bell, Check, RefreshCw, Sparkles } from "lucide-react";
import { AREA_META, SCORED_AREAS, normalizeArea } from "@/lib/areas";
import { useOnDataChanged } from "@/hooks/useAssistantChat";

interface PlanItem {
  type: "todo" | "task" | "project";
  id: string;
  title: string;
  area: string;
  reason?: string;
  projectId?: string;
  done: boolean;
}

interface Score {
  date: string;
  overall: number;
  physical: number;
  mental: number;
  financial: number;
  spiritual: number;
  work: number;
  rationale: Record<string, string> | null;
  journalScore: number | null;
  journalFeedback: string | null;
  judgedBy: string | null;
}

interface TodayData {
  date: string;
  plan: { items: PlanItem[]; summary: string | null; pending: boolean; model: string | null };
  routines: { id: string; name: string; area: string; timeOfDay: string; done: boolean }[];
  meals: { id: string; name: string; category: string; status: string }[];
  reminders: { id: string; text: string; fireAt: string }[];
  scores: Score[];
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl p-5" style={{ background: "var(--bg-elev-1)", border: "1px solid var(--stroke-1)" }}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--ink-400)" }}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function CheckRow({ done, onClick, children, sub, color }: { done: boolean; onClick: () => void; children: React.ReactNode; sub?: string; color: string }) {
  return (
    <button onClick={onClick} className="group flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[.03]">
      <span
        className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full transition-all"
        style={{ border: `1.5px solid ${done ? "var(--good)" : "var(--stroke-3)"}`, background: done ? "var(--good)" : "transparent" }}
      >
        <Check className={`h-3 w-3 ${done ? "opacity-100" : "opacity-0 group-hover:opacity-60"}`} style={{ color: done ? "#000" : "var(--ink-300)" }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`flex items-center gap-2 text-sm ${done ? "line-through" : ""}`} style={{ color: done ? "var(--ink-500)" : "var(--ink-100)" }}>
          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: color }} />
          {children}
        </span>
        {sub && !done && (
          <span className="mt-0.5 block text-xs" style={{ color: "var(--ink-500)" }}>
            {sub}
          </span>
        )}
      </span>
    </button>
  );
}

function scoreColor(v: number) {
  return v >= 7 ? "var(--good)" : v >= 4.5 ? "var(--warn)" : "var(--bad)";
}

export default function TodayPage() {
  const [data, setData] = useState<TodayData | null>(null);
  const [replanning, setReplanning] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/today");
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/today")
      .then((res) => (res.ok ? res.json() : null))
      .then((d: TodayData | null) => {
        if (alive && d) setData(d);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  useOnDataChanged(load);

  // While the model is still drafting the plan, poll until it lands.
  useEffect(() => {
    if (!data?.plan.pending) return;
    const t = setTimeout(load, 8000);
    return () => clearTimeout(t);
  }, [data, load]);

  async function togglePlanItem(item: PlanItem) {
    setData((d) => d && { ...d, plan: { ...d.plan, items: d.plan.items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)) } });
    if (item.type === "todo") {
      await fetch(`/api/todos/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: item.done ? "open" : "done" }) });
    } else if (item.type === "task" && item.projectId) {
      await fetch(`/api/projects/${item.projectId}/tasks/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: item.done ? "todo" : "completed", completedAt: item.done ? null : new Date().toISOString() }),
      });
    } else if (item.type === "project") {
      await fetch(`/api/projects/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: item.done ? "active" : "completed" }) });
    }
  }

  async function toggleRoutine(id: string, done: boolean) {
    setData((d) => d && { ...d, routines: d.routines.map((r) => (r.id === id ? { ...r, done: !done } : r)) });
    await fetch(`/api/habits/${id}/log`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completed: !done }) });
  }

  async function replan() {
    setReplanning(true);
    await fetch("/api/today", { method: "POST" });
    await load();
    setReplanning(false);
  }

  if (!data) return <p style={{ color: "var(--ink-500)" }}>Loading…</p>;

  const todayKey = format(new Date(), "yyyy-MM-dd");
  const judged = [...data.scores].reverse().find((s) => s.judgedBy && format(new Date(s.date), "yyyy-MM-dd") !== todayKey);
  const latest = judged ?? [...data.scores].reverse().find((s) => format(new Date(s.date), "yyyy-MM-dd") !== todayKey);
  const doneCount = data.plan.items.filter((i) => i.done).length;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <p className="text-sm" style={{ color: "var(--ink-400)" }}>
          {format(new Date(), "EEEE, MMMM d")}
        </p>
        <h1 className="text-3xl font-semibold" style={{ color: "var(--ink-100)" }}>
          Today
        </h1>
        {data.plan.summary && (
          <p className="mt-1 flex items-center gap-2 text-sm" style={{ color: "var(--blue-200)" }}>
            <Sparkles className="h-4 w-4" /> {data.plan.summary}
          </p>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card
            title={`Focus · ${doneCount}/${data.plan.items.length}`}
            action={
              <button onClick={replan} disabled={replanning} className="inline-flex items-center gap-1.5 text-xs disabled:opacity-50" style={{ color: "var(--ink-400)" }}>
                <RefreshCw className={`h-3.5 w-3.5 ${replanning ? "animate-spin" : ""}`} />
                {replanning ? "Planning…" : "Replan"}
              </button>
            }
          >
            {data.plan.pending && (
              <p className="mb-2 text-xs" style={{ color: "var(--ink-500)" }}>
                Draft by priority — Spark is building your real plan…
              </p>
            )}
            {data.plan.items.length === 0 ? (
              <p className="py-4 text-sm" style={{ color: "var(--ink-500)" }}>
                Nothing planned. Tell the <Link href="/chat" className="underline">chat</Link> what you need to get done.
              </p>
            ) : (
              <div className="space-y-0.5">
                {data.plan.items.map((item) => (
                  <CheckRow
                    key={item.id}
                    done={item.done}
                    onClick={() => togglePlanItem(item)}
                    color={AREA_META[normalizeArea(item.area)].color}
                    sub={item.reason}
                  >
                    {item.title}
                    {item.type === "project" && (
                      <span className="text-[10px] uppercase" style={{ color: "var(--ink-500)" }}>
                        project
                      </span>
                    )}
                  </CheckRow>
                ))}
              </div>
            )}
          </Card>

          <Card title="Routines" action={<Link href="/habits" className="text-xs" style={{ color: "var(--ink-400)" }}>Manage</Link>}>
            {data.routines.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--ink-500)" }}>
                No routines for today. Try &ldquo;read the Bible every morning&rdquo; in chat.
              </p>
            ) : (
              <div className="grid gap-0.5 sm:grid-cols-2">
                {data.routines.map((r) => (
                  <CheckRow key={r.id} done={r.done} onClick={() => toggleRoutine(r.id, r.done)} color={AREA_META[normalizeArea(r.area)].color}>
                    {r.name}
                  </CheckRow>
                ))}
              </div>
            )}
          </Card>

          {(data.meals.length > 0 || data.reminders.length > 0) && (
            <Card title="Also today">
              <ul className="space-y-2 text-sm">
                {data.reminders.map((r) => (
                  <li key={r.id} className="flex items-center gap-2" style={{ color: "var(--ink-200)" }}>
                    <Bell className="h-3.5 w-3.5" style={{ color: "var(--blue-200)" }} />
                    {r.text}
                    <span className="text-xs" style={{ color: "var(--ink-500)" }}>
                      {format(new Date(r.fireAt), "h:mm a")}
                    </span>
                  </li>
                ))}
                {data.meals.map((m) => (
                  <li key={m.id} className="flex items-center gap-2" style={{ color: "var(--ink-200)" }}>
                    <span>🍽</span> <span className="capitalize" style={{ color: "var(--ink-400)" }}>{m.category}:</span> {m.name}
                    {m.status === "eaten" && <Check className="h-3.5 w-3.5" style={{ color: "var(--good)" }} />}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card title={latest ? `Scores · ${format(new Date(latest.date), "EEE MMM d")}` : "Scores"}>
            {!latest ? (
              <p className="text-sm" style={{ color: "var(--ink-500)" }}>
                Your first score arrives tonight at 11:30pm.
              </p>
            ) : (
              <>
                <div className="mb-4 flex items-baseline gap-2">
                  <span className="text-5xl font-semibold tabular-nums" style={{ color: "var(--ink-100)" }}>
                    {latest.overall.toFixed(1)}
                  </span>
                  <span className="text-sm" style={{ color: "var(--ink-500)" }}>
                    / 10 overall{latest.judgedBy ? "" : " · rule-based"}
                  </span>
                </div>
                <ul className="space-y-2.5">
                  {SCORED_AREAS.map((a) => (
                    <li key={a}>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="h-2 w-2 rounded-full" style={{ background: AREA_META[a].color }} />
                        <span className="flex-1" style={{ color: "var(--ink-200)" }}>
                          {AREA_META[a].label}
                        </span>
                        <span className="font-semibold tabular-nums" style={{ color: scoreColor(latest[a]) }}>
                          {Math.round(latest[a])}
                        </span>
                      </div>
                      {latest.rationale?.[a] && (
                        <p className="ml-4 text-xs" style={{ color: "var(--ink-500)" }}>
                          {latest.rationale[a]}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
                {latest.journalFeedback && (
                  <div className="mt-4 rounded-xl p-3 text-sm" style={{ background: "var(--accent-muted)", color: "var(--ink-200)" }}>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--blue-200)" }}>
                      Journal{latest.journalScore != null ? ` · ${latest.journalScore}/10` : ""}
                    </p>
                    {latest.journalFeedback}
                  </div>
                )}
              </>
            )}
          </Card>

          {data.scores.length > 1 && (
            <Card title="Overall · last 14 days">
              <div className="flex h-24 items-end gap-[2px]" role="img" aria-label="Overall score per day for the last 14 days">
                {data.scores.map((s) => (
                  <div
                    key={s.date}
                    title={`${format(new Date(s.date), "EEE MMM d")}: ${s.overall.toFixed(1)}/10`}
                    className="flex-1 rounded-t-[4px] transition-opacity hover:opacity-80"
                    style={{ height: `${Math.max(4, s.overall * 10)}%`, background: "var(--accent)" }}
                  />
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[10px]" style={{ color: "var(--ink-500)" }}>
                <span>{format(new Date(data.scores[0].date), "MMM d")}</span>
                <span>{format(new Date(data.scores[data.scores.length - 1].date), "MMM d")}</span>
              </div>
            </Card>
          )}

          <Link
            href="/entry"
            className="block rounded-2xl p-4 text-sm transition-colors hover:bg-white/[.03]"
            style={{ border: "1px dashed var(--stroke-2)", color: "var(--ink-300)" }}
          >
            📝 Write tonight&apos;s journal →
          </Link>
        </div>
      </div>
    </div>
  );
}
