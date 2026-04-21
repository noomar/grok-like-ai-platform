import { NextRequest, NextResponse } from "next/server";

const MOOD_BPM: Record<string, number> = {
  "cinematic-uplift": 112,
  "lofi-chill": 78,
  "trailer-epic": 140,
  "corporate-clean": 98,
  "dark-tension": 90,
  "pop-energetic": 124,
};

/**
 * Music + visual synchronization logic.
 *
 * Given scene durations and a mood, compute beat-aligned cut markers so a
 * downstream renderer can snap scene transitions to the musical grid.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { sceneDurationsSec?: number[]; mood?: string; bpm?: number }
    | null;

  if (!body || !Array.isArray(body.sceneDurationsSec) || body.sceneDurationsSec.length === 0) {
    return NextResponse.json({ error: "sceneDurationsSec is required" }, { status: 400 });
  }

  const bpm = body.bpm ?? MOOD_BPM[body.mood ?? ""] ?? 110;
  const beatSec = 60 / bpm;

  let t = 0;
  const cutMarkers = body.sceneDurationsSec.map((d) => {
    t += d;
    // Snap cut to the nearest beat.
    return Math.round((t / beatSec)) * beatSec;
  });

  return NextResponse.json({
    bpm,
    mood: body.mood ?? "custom",
    beatSec,
    cutMarkers,
    trackUrl: `/assets/music/${body.mood ?? "custom"}-${bpm}bpm.mp3`,
  });
}
