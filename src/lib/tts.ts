import { synthesizeTTS } from "./providers/tts";

export type TTSResult = {
  audioBuffer: Buffer;
  format: "mp3";
  durationSec: number;
  provider?: string;
};

export class MissingKeyError extends Error {
  constructor(public keyName: string) {
    super(`Missing Key: ${keyName}`);
    this.name = "MissingKeyError";
  }
}

/**
 * Self-healing Text-to-Speech via the provider pool (edge-tts → gtts → openai).
 * Returns the first provider that succeeds; throws only if *every* provider
 * fails (including the keyless ones).
 *
 * Callers may still receive an error if e.g. the user's network blocks both
 * Microsoft and Google endpoints and no OpenAI key is set.
 */
export async function generateVoiceover(text: string, voiceId: string): Promise<TTSResult> {
  const r = await synthesizeTTS({ text, voiceId });
  return {
    audioBuffer: r.value.audioBuffer,
    format: "mp3",
    durationSec: r.value.durationSec,
    provider: r.provider,
  };
}
