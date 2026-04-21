/**
 * News provider pool — zero-auth, zero-key, federated across multiple RSS
 * feeds. Each provider is a public RSS endpoint; the pool races the top
 * `concurrency` feeds and returns the first successful parse. Circuit-breaker
 * state from `core.ts` automatically deprioritises feeds that are down.
 *
 * All feeds are explicit publish-for-syndication (RSS/Atom), not scraped HTML.
 */

import { Provider, ProviderResult, executeRace } from "./core";

export type NewsInput = {
  /** Optional topic. If set, providers that support query-driven feeds
   *  (Google News, DuckDuckGo) will pass it in. Feeds without query support
   *  return their default front page. */
  topic?: string;
  /** Max items to return (default 8). */
  limit?: number;
  /** Prefer feeds in this language. "auto" (default) picks best per feed. */
  language?: "auto" | "en" | "tr";
};

export type NewsItem = {
  title: string;
  description: string;
  link: string;
  publishedAt?: string;
  source: string;
};

export type NewsOutput = {
  items: NewsItem[];
  /** e.g. "bbc-world", "google-news", "hackernews". */
  source: string;
};

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCharCode(parseInt(n, 16)))
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  return m ? decodeEntities(m[1]) : "";
}

/**
 * Minimal RSS 2.0 + Atom parser (handles <item> and <entry>). Good enough for
 * the federated feeds we pull; for anything more exotic we'd reach for
 * fast-xml-parser but I'd rather not take a dep just for this.
 */
function parseFeed(xml: string, sourceLabel: string): NewsItem[] {
  const items: NewsItem[] = [];
  const blocks = xml.match(/<(item|entry)[^>]*>[\s\S]*?<\/(?:item|entry)>/gi) ?? [];
  for (const block of blocks) {
    const title = extractTag(block, "title");
    if (!title) continue;
    const description =
      extractTag(block, "description") ||
      extractTag(block, "summary") ||
      extractTag(block, "content");
    // Atom uses <link href=".."/>, RSS uses <link>..</link>.
    const linkMatch =
      block.match(/<link[^>]*href=["']([^"']+)["']/i) ||
      block.match(/<link[^>]*>([^<]+)<\/link>/i);
    const link = linkMatch ? decodeEntities(linkMatch[1]) : "";
    const publishedAt =
      extractTag(block, "pubDate") ||
      extractTag(block, "published") ||
      extractTag(block, "updated") ||
      undefined;
    items.push({
      title,
      description: description.slice(0, 400),
      link,
      publishedAt,
      source: sourceLabel,
    });
  }
  return items;
}

async function fetchFeed(
  url: string,
  sourceLabel: string,
  signal: AbortSignal,
): Promise<NewsItem[]> {
  const res = await fetch(url, {
    signal,
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; AuroraNewsBot/1.0; +https://grok-like-ai-platform.vercel.app)",
      accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
    },
  });
  if (!res.ok) throw new Error(`${sourceLabel} ${res.status}`);
  const xml = await res.text();
  const items = parseFeed(xml, sourceLabel);
  if (items.length === 0) throw new Error(`${sourceLabel}: no items parsed`);
  return items;
}

function buildProvider(
  name: string,
  urlFor: (topic: string | undefined) => string,
  priority: number,
): Provider<NewsInput, NewsOutput> {
  return {
    name,
    priority,
    timeoutMs: 12_000,
    available: () => true,
    async execute(input, signal) {
      const items = await fetchFeed(urlFor(input.topic), name, signal);
      return {
        items: items.slice(0, input.limit ?? 8),
        source: name,
      };
    },
  };
}

/** Google News supports arbitrary topic searches without auth. */
const googleNews = buildProvider(
  "google-news",
  (topic) =>
    topic && topic.trim()
      ? `https://news.google.com/rss/search?q=${encodeURIComponent(topic.trim())}&hl=en-US&gl=US&ceid=US:en`
      : `https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en`,
  100,
);

const googleNewsTR = buildProvider(
  "google-news-tr",
  (topic) =>
    topic && topic.trim()
      ? `https://news.google.com/rss/search?q=${encodeURIComponent(topic.trim())}&hl=tr&gl=TR&ceid=TR:tr`
      : `https://news.google.com/rss?hl=tr&gl=TR&ceid=TR:tr`,
  95,
);

const bbcWorld = buildProvider(
  "bbc-world",
  () => "https://feeds.bbci.co.uk/news/world/rss.xml",
  80,
);

const aljazeera = buildProvider(
  "aljazeera",
  () => "https://www.aljazeera.com/xml/rss/all.xml",
  75,
);

const hackerNews = buildProvider(
  "hackernews",
  () => "https://hnrss.org/frontpage",
  70,
);

/** Reuters-style aggregator via Yahoo! News RSS (keyless). */
const yahooNews = buildProvider(
  "yahoo-news",
  (topic) =>
    topic && topic.trim()
      ? `https://news.search.yahoo.com/rss?p=${encodeURIComponent(topic.trim())}`
      : `https://www.yahoo.com/news/rss`,
  60,
);

const trtHaber = buildProvider(
  "trt-haber",
  () => "https://www.trthaber.com/sondakika_articles.rss",
  55,
);

const hurriyet = buildProvider(
  "hurriyet",
  () => "https://www.hurriyet.com.tr/rss/anasayfa",
  50,
);

export const newsProviders: Provider<NewsInput, NewsOutput>[] = [
  googleNews,
  googleNewsTR,
  bbcWorld,
  aljazeera,
  hackerNews,
  yahooNews,
  trtHaber,
  hurriyet,
];

function filterByLanguage(
  providers: Provider<NewsInput, NewsOutput>[],
  lang: NewsInput["language"],
): Provider<NewsInput, NewsOutput>[] {
  if (!lang || lang === "auto") return providers;
  const turkish = new Set(["google-news-tr", "trt-haber", "hurriyet"]);
  return providers.filter((p) =>
    lang === "tr" ? turkish.has(p.name) : !turkish.has(p.name),
  );
}

/** Fetch news from the pool. Races the top 2 feeds to cut latency; falls
 *  through to the rest sequentially on failure. */
export async function fetchNews(
  input: NewsInput,
  signal?: AbortSignal,
): Promise<ProviderResult<NewsOutput>> {
  const providers = filterByLanguage(newsProviders, input.language);
  return executeRace("news", providers, input, {
    concurrency: 2,
    parentSignal: signal,
  });
}
