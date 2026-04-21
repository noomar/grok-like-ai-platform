import { NextRequest, NextResponse } from "next/server";
import { generateVoiceover, MissingKeyError } from "@/lib/tts";
import { persistAsset } from "@/lib/storage";
import { createId } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Real Text-to-Speech. Calls OpenAI TTS, stores the MP3, returns a downloadable URL.
 * Requires OPENAI_API_KEY.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { text?: string; voice?: string }
    | null;

  if (!body || typeof body.text !== "string" || body.text.trim().length === 0) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  try {
    const result = await generateVoiceover(body.text, body.voice ?? "aria-neural");
    const tmpId = createId("tts");
    const asset = await persistAsset(tmpId, "audio.mp3", result.audioBuffer, "audio/mpeg");
    return NextResponse.json({
      voice: body.voice ?? "aria-neural",
      format: "mp3",
      durationSec: result.durationSec,
      audioUrl: asset.url,
      sizeBytes: asset.sizeBytes,
    });
  } catch (err) {
    if (err instanceof MissingKeyError) {
      return NextResponse.json(
        { error: err.message, missingKey: err.keyName },
        { status: 412 },
      );
    }
    const message = err instanceof Error ? err.message : "TTS failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
