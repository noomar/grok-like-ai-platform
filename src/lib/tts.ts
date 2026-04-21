import { getKey } from "./env";

export type TTSResult = {
  audioBuffer: Buffer;
  format: "mp3";
  durationSec: number;
};

const OPENAI_VOICE_MAP: Record<string, string> = {
  "aria-neural": "alloy",
  "orion-tts": "onyx",
  "lumen-tts": "nova",
  "mira-tts": "shimmer",
};

export class MissingKeyError extends Error {
  constructor(public keyName: string) {
    super(`Missing Key: ${keyName}`);
    this.name = "MissingKeyError";
  }
}

/**
 * Real Text-to-Speech via OpenAI. Throws MissingKeyError if OPENAI_API_KEY is not set.
 */
export async function generateVoiceover(text: string, voiceId: string): Promise<TTSResult> {
  const apiKey = getKey("OPENAI_API_KEY");
  if (!apiKey) {
    throw new MissingKeyError("OPENAI_API_KEY");
  }
  const voice = OPENAI_VOICE_MAP[voiceId] ?? "alloy";

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice,
      input: text,
      response_format: "mp3",
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(`OpenAI TTS failed (${res.status}): ${bodyText.slice(0, 200)}`);
  }

  const ab = await res.arrayBuffer();
  const audioBuffer = Buffer.from(ab);

  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const durationSec = Math.max(2, Math.round(words / 2.5));

  return { audioBuffer, format: "mp3", durationSec };
}
