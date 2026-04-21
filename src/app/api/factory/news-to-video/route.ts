import { NextRequest, NextResponse } from "next/server";
import { fetchNews, NewsItem } from "@/lib/providers/news";
import { submitVideoJob } from "@/lib/factory";
import { hasKey } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * News → Video: pulls headlines from the RSS pool (no API keys), builds a
 * scene-per-headline script, and submits it through the video provider pool.
 *
 * Body: { topic?, count?, language?: "auto" | "en" | "tr", title?, voice?,
 *         musicMood?, preview?: boolean }
 *
 * preview=true returns the headlines + script without submitting a render —
 * useful for UI preview or debugging.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    topic?: string;
    count?: number;
    language?: "auto" | "en" | "tr";
    title?: string;
    voice?: string;
    musicMood?: string;
    preview?: boolean;
  };

  const count = Math.max(2, Math.min(8, body.count ?? 5));
  try {
    const news = await fetchNews({
      topic: body.topic,
      limit: count,
      language: body.language ?? "auto",
    });
    const items = news.value.items.slice(0, count);
    if (items.length === 0) {
      return NextResponse.json(
        { error: "news pool returned no items" },
        { status: 502 },
      );
    }

    const script = buildScript(items);
    const title =
      body.title?.trim() ||
      (body.topic?.trim()
        ? `News brief: ${body.topic.trim()}`
        : "Top stories brief");

    if (body.preview) {
      return NextResponse.json({
        preview: true,
        title,
        script,
        newsProvider: news.provider,
        newsLatencyMs: news.latencyMs,
        items,
      });
    }

    // Require at least one hosted video provider (matches /api/factory/jobs).
    if (!hasKey("SHOTSTACK_API_KEY") && !hasKey("HF_RENDER_URL")) {
      return NextResponse.json(
        {
          error:
            "No hosted video provider configured. Set SHOTSTACK_API_KEY or HF_RENDER_URL.",
          preview: { title, script, items, newsProvider: news.provider },
        },
        { status: 412 },
      );
    }

    const job = await submitVideoJob({
      title,
      script,
      voice: body.voice ?? "aria-neural",
      musicMood: body.musicMood ?? "ambient",
      requestedBy: "news-to-video",
    });

    return NextResponse.json(
      {
        job,
        newsProvider: news.provider,
        newsLatencyMs: news.latencyMs,
        items,
      },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "news-to-video failed" },
      { status: 502 },
    );
  }
}

/** GET variant for quick previews. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const topic = url.searchParams.get("topic") ?? undefined;
  const count = parseInt(url.searchParams.get("count") ?? "5", 10);
  const language = (url.searchParams.get("language") ?? "auto") as
    | "auto"
    | "en"
    | "tr";
  try {
    const news = await fetchNews({ topic, limit: count, language });
    return NextResponse.json({
      source: news.provider,
      latencyMs: news.latencyMs,
      items: news.value.items,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "news pool failed" },
      { status: 502 },
    );
  }
}

function buildScript(items: NewsItem[]): string {
  // Each headline becomes its own scene. We prefer the title alone (punchier);
  // if the title is very short, we append the first sentence of the description
  // so the scene has enough to read on-screen.
  return items
    .map((it) => {
      const titleClean = it.title.replace(/\s*-\s*[^-]*$/, "").trim();
      if (titleClean.length >= 40) return titleClean;
      const firstSentence = it.description
        .split(/(?<=[.!?])\s+/)[0]
        ?.trim() ?? "";
      return firstSentence && firstSentence.length > titleClean.length
        ? `${titleClean}. ${firstSentence}`
        : titleClean;
    })
    .filter((s) => s.length > 0)
    .join("\n\n");
}
