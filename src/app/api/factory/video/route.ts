import { NextRequest, NextResponse } from "next/server";

type Scene = { index: number; text: string; durationSec: number };

/**
 * Automated video scene assembly.
 *
 * Given a script and optional audio duration, return a scene plan. Wire this
 * into Remotion / Shotstack / FFmpeg by rendering the returned plan server-side.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { script?: string; targetDurationSec?: number; resolution?: "720p" | "1080p" | "4k" }
    | null;

  if (!body || typeof body.script !== "string" || body.script.trim().length === 0) {
    return NextResponse.json({ error: "script is required" }, { status: 400 });
  }

  const paragraphs = body.script
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks = paragraphs.length > 1
    ? paragraphs
    : body.script.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);

  const totalWords = chunks.reduce((n, c) => n + c.split(/\s+/).length, 0);
  const target = body.targetDurationSec ?? Math.max(3, Math.round(totalWords / 2.5));

  const scenes: Scene[] = chunks.map((text, i) => {
    const words = text.split(/\s+/).length;
    const durationSec = Math.max(1, Math.round((words / Math.max(1, totalWords)) * target));
    return { index: i, text, durationSec };
  });

  return NextResponse.json({
    resolution: body.resolution ?? "1080p",
    sceneCount: scenes.length,
    totalDurationSec: scenes.reduce((n, s) => n + s.durationSec, 0),
    scenes,
    videoUrl: `/assets/video/stub-${Date.now()}.mp4`,
  });
}
