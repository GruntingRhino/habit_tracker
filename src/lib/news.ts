/**
 * Nightly news (worker, 11:30pm): the top 50 big things in the world, weighted to his interests.
 *
 *   - topics come from his profile (interests + goals), e.g. MMA, AI, business, fitness, faith
 *   - sources: Google News RSS (top stories + one search per topic), Hacker News front page
 *   - "big" = covered by many outlets (story clusters) and recent; his topics get a boost
 * Ranking is plain code over real headlines: nothing is invented. Stored in BrainState "news".
 */
import prisma from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import type { ProfileContent } from "@/lib/brain/categories";

export const NEWS_KEY = "news";

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
  topic: string;
  /** How many outlets ran the same story. */
  coverage: number;
  score: number;
}

export interface NewsState {
  at: string;
  topics: string[];
  items: NewsItem[];
  errors: string[];
}

// Interest words in his profile → search topics.
const TOPIC_MAP: [RegExp, string][] = [
  [/\bmma\b|combat|ufc|boxing|fight/i, "UFC MMA"],
  [/\b(ai|a\.i\.|artificial intelligence|llm|agents?|local model)\b/i, "artificial intelligence"],
  [/\b(tech|coding|software|developer|startups?)\b/i, "tech startups software"],
  [/\b(business|money|equity|capital|entrepreneur|revenue)\b/i, "business entrepreneurship"],
  [/\b(gym|lifting|fitness|muscle|bulk|training)\b/i, "fitness strength training"],
  [/\b(god|faith|bible|pray|christian)\b/i, "Christianity faith"],
  [/\b(school|education|goodhours|volunteer)\b/i, "education technology"],
];
const DEFAULT_TOPICS = ["artificial intelligence", "UFC MMA", "business entrepreneurship", "fitness strength training"];

export async function interestTopics(userId: string) {
  const docs = await prisma.profileDoc.findMany({ where: { userId, category: { in: ["interests", "goals"] } }, select: { content: true } });
  const text = docs.flatMap((d) => ((d.content as unknown as ProfileContent)?.beliefs ?? []).map((b) => b.text)).join(" ");
  const topics = TOPIC_MAP.filter(([re]) => re.test(text)).map(([, t]) => t);
  return topics.length ? topics.slice(0, 6) : DEFAULT_TOPICS;
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, "")
    .trim();

/** Minimal RSS parser: <item><title/><link/><pubDate/><source/></item>. */
export function parseRss(xml: string, topic: string): Omit<NewsItem, "coverage" | "score">[] {
  const out: Omit<NewsItem, "coverage" | "score">[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = m[1];
    const get = (tag: string) => decode(item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] ?? "");
    let title = get("title");
    const source = get("source") || (title.match(/ - ([^-]+)$/)?.[1] ?? "").trim();
    // Google News titles end with " - Outlet".
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const url = get("link") || get("comments");
    const date = get("pubDate");
    if (title && url) out.push({ title, url, source: source || new URL(url).hostname.replace(/^www\./, ""), publishedAt: date ? new Date(date).toISOString() : null, topic });
  }
  return out;
}

const STOP = new Set("a an the of to in on for and or with at by from as is are was were be it its this that after over new says say will could".split(" "));
function words(title: string) {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
  );
}
function overlap(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n / Math.min(a.size, b.size);
}

/** Cluster the same story across outlets, score by coverage, recency and his topics, keep the top n. */
export function rankNews(raw: Omit<NewsItem, "coverage" | "score">[], now = new Date(), n = 50): NewsItem[] {
  const clusters: { lead: Omit<NewsItem, "coverage" | "score">; w: Set<string>; members: number; topics: Set<string> }[] = [];
  for (const item of raw) {
    const w = words(item.title);
    const hit = clusters.find((c) => overlap(c.w, w) >= 0.6);
    if (hit) {
      hit.members++;
      hit.topics.add(item.topic);
      // Prefer the most recent headline as the representative.
      if ((item.publishedAt ?? "") > (hit.lead.publishedAt ?? "")) hit.lead = item;
    } else clusters.push({ lead: item, w, members: 1, topics: new Set([item.topic]) });
  }
  const ranked = clusters
    .map((c) => {
      const ageH = c.lead.publishedAt ? (now.getTime() - new Date(c.lead.publishedAt).getTime()) / 3_600_000 : 48;
      const recency = ageH <= 24 ? 1 : ageH <= 48 ? 0.6 : ageH <= 96 ? 0.3 : 0.1;
      const interest = [...c.topics].some((t) => t !== "Top stories" && t !== "Tech (Hacker News)") ? 1.5 : 1;
      const score = Math.round((Math.log2(1 + c.members) + 1) * recency * interest * 100) / 100;
      const topic = [...c.topics].find((t) => t !== "Top stories") ?? "Top stories";
      return { ...c.lead, topic, coverage: c.members, score };
    })
    .filter((x) => x.score > 0.15)
    .sort((a, b) => b.score - a.score);
  // Keep the world in view: at least a quarter of the list is top stories.
  const world = ranked.filter((x) => x.topic === "Top stories").slice(0, Math.floor(n / 4));
  const rest = ranked.filter((x) => !world.includes(x)).slice(0, n - world.length);
  return [...world, ...rest].sort((a, b) => b.score - a.score);
}

async function fetchText(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (LiveImproved news digest)" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.text();
}

const gnews = (q?: string) =>
  q ? `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:2d`)}&hl=en-US&gl=US&ceid=US:en` : "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en";

/** Fetch, rank and store tonight's top 50. */
export async function refreshNews(userId: string, now = new Date()): Promise<NewsState> {
  const topics = await interestTopics(userId);
  const feeds: [string, string][] = [["Top stories", gnews()], ...topics.map((t) => [t, gnews(t)] as [string, string]), ["Tech (Hacker News)", "https://hnrss.org/frontpage?count=30"]];
  const raw: Omit<NewsItem, "coverage" | "score">[] = [];
  const errors: string[] = [];
  for (const [topic, url] of feeds) {
    try {
      raw.push(...parseRss(await fetchText(url), topic).slice(0, 40));
    } catch (error) {
      errors.push(`${topic}: ${error instanceof Error ? error.message : error}`);
    }
  }
  const state: NewsState = { at: now.toISOString(), topics, items: rankNews(raw, now), errors };
  const value = state as unknown as Prisma.InputJsonValue;
  await prisma.brainState.upsert({ where: { key: NEWS_KEY }, update: { value }, create: { key: NEWS_KEY, value } });
  return state;
}

export async function readNews(): Promise<NewsState | null> {
  const row = await prisma.brainState.findUnique({ where: { key: NEWS_KEY } });
  return (row?.value as unknown as NewsState) ?? null;
}
