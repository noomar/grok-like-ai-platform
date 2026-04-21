import { NextRequest, NextResponse } from "next/server";

/**
 * Standalone Text-to-Speech endpoint.
 *
 * Swap this with a real provider (ElevenLabs, OpenAI, Azure, etc.) by
 * replacing the stub below with a fetch to your TTS API. Read credentials
 * from env vars (e.g. process.env.TTS_API_KEY) — never hardcode keys.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { text?: string; voice?: string }
    | null;

  if (!body || typeof body.text !== "string" || body.text.trim().length === 0) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const words = body.text.trim().split(/\s+/).filter(Boolean).length;
  const durationSec = Math.max(2, Math.round(words / 2.5));

  return NextResponse.json({
    voice: body.voice ?? "aria-neural",
    format: "mp3",
    durationSec,
    // In production: return a signed URL to the generated audio asset.
    audioUrl: `/assets/tts/stub-${Date.now()}.mp3`,
  });
}
