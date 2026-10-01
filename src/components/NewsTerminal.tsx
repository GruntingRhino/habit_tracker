"use client";

import { DoneCheck } from "@/components/feedback";
import { useMemo, useState } from "react";
import { formatDistanceToNowStrict, format } from "date-fns";
import { RefreshCw } from "lucide-react";

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  topic: string;
  coverage: number;
  publishedAt?: string | null;
}
export interface NewsData {
  at: string | null;
  topics?: string[];
  items: NewsItem[];
}

const SHORT: Record<string, string> = {
  "Top stories": "World",
  "artificial intelligence": "AI",
  "UFC MMA": "MMA",
  "tech startups software": "Tech",
  "Tech (Hacker News)": "HN",
  "business entrepreneurship": "Business",
  "fitness strength training": "Fitness",
  "Christianity faith": "Faith",
  "education technology": "Edu",
};
const short = (t: string) => SHORT[t] ?? t;

/** The nightly top 50 as a terminal: numbered, filterable by topic, scrolls inside itself. */
export default function NewsTerminal({ news, onRefresh }: { news: NewsData | null; onRefresh: () => Promise<void> }) {
  const [topic, setTopic] = useState<string>("All");
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState(false);
  const items = useMemo(() => news?.items ?? [], [news]);
  const topics = useMemo(() => ["All", ...[...new Set(items.map((i) => short(i.topic)))]], [items]);
  const shown = topic === "All" ? items : items.filter((i) => short(i.topic) === topic);

  async function refresh() {
    setBusy(true);
    try {
      await onRefresh();
      setFresh(true);
      setTimeout(() => setFresh(false), 2000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-6 overflow-hidden rounded-xl" style={{ background: "var(--bg-deep)", border: "1px solid var(--stroke-2)" }} aria-label="News">
      <header className="flex items-center gap-2 px-3 py-2 font-mono text-[11px]" style={{ borderBottom: "1px solid var(--stroke-1)", color: "var(--ink-500)" }}>
        <span style={{ color: "var(--good)" }}>●</span>
        <span className="font-semibold tracking-wider" style={{ color: "var(--ink-200)" }}>
          NEWS
        </span>
        <span className="truncate">
          top {items.length || 50}
          {news?.at ? ` · ${format(new Date(news.at), "EEE h:mm a")}` : ""}
        </span>
        <button onClick={refresh} disabled={busy} className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 hover:opacity-80 disabled:opacity-50" aria-label="Refresh news">
          {fresh ? <DoneCheck size={12} color="var(--good)" /> : <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />}
          <span style={fresh ? { color: "var(--good)" } : undefined}>{busy ? "fetching…" : fresh ? "updated" : "refresh"}</span>
        </button>
      </header>

      {items.length > 0 && (
        <div className="flex gap-1 overflow-x-auto px-3 py-2 font-mono text-[11px]" style={{ borderBottom: "1px solid var(--stroke-1)" }}>
          {topics.map((t) => (
            <button
              key={t}
              onClick={() => setTopic(t)}
              className="flex-shrink-0 rounded px-2 py-0.5"
              style={t === topic ? { background: "var(--ink-100)", color: "var(--bg-base)" } : { color: "var(--ink-400)", border: "1px solid var(--stroke-2)" }}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <ol className="max-h-[26rem] overflow-y-auto font-mono text-[13px] lg:max-h-[calc(100vh-11rem)]">
        {!items.length && (
          <li className="px-3 py-4" style={{ color: "var(--ink-500)" }}>
            &gt; no stories yet — tap refresh, or it runs tonight at 11:30
          </li>
        )}
        {shown.map((n) => {
          const rank = items.indexOf(n) + 1;
          return (
            <li key={n.url} style={{ borderBottom: "1px solid var(--stroke-1)" }}>
              <a href={n.url} target="_blank" rel="noreferrer" className="flex gap-2.5 px-3 py-2 hover:bg-white/5">
                <span className="w-5 flex-shrink-0 text-right tabular-nums" style={{ color: rank <= 10 ? "var(--accent)" : "var(--ink-600)" }}>
                  {String(rank).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-sans leading-snug" style={{ color: "var(--ink-100)" }}>
                    {n.title}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px]" style={{ color: "var(--ink-500)" }}>
                    [{short(n.topic)}] {n.source}
                    {n.coverage > 1 ? ` · ${n.coverage} outlets` : ""}
                    {n.publishedAt ? ` · ${formatDistanceToNowStrict(new Date(n.publishedAt))} ago` : ""}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
