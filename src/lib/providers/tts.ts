/**
 * TTS provider pool. Tries open-source first, then falls back to paid
 * providers if their keys are set. Every provider returns an MP3 buffer.
 */

import { EdgeTTS } from "edge-tts-universal";
import { getAudioBase64 } from "google-tts-api";
import { getKey } from "@/lib/env";
import {
  Provider,
  ProviderResult,
  executeSequential,
} from "./core";

export type TTSInput = {
  text: string;
  voiceId?: string;
  /** Split long text into chunks so gTTS (200-char limit) can handle it. */
  chunkLimit?: number;
};

export type TTSOutput = {
  audioBuffer: Buffer;
  format: "mp3";
  durationSec: number;
  provider: string;
};

const EDGE_VOICE_MAP: Record<string, string> = {
  "aria-neural": "en-US-AriaNeural",
  "orion-tts": "en-US-GuyNeural",
  "lumen-tts": "en-US-JennyNeural",
  "mira-tts": "en-US-AvaNeural",
};

const OPENAI_VOICE_MAP: Record<string, string> = {
  "aria-neural": "alloy",
  "orion-tts": "onyx",
  "lumen-tts": "nova",
  "mira-tts": "shimmer",
};

function estimateDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2, Math.round(words / 2.5));
}

const edgeTtsProvider: Provider<TTSInput, TTSOutput> = {
  name: "edge-tts",
  priority: 90,
  timeoutMs: 20_000,
  available: () => true,
  async execute(input, signal) {
    const voice = EDGE_VOICE_MAP[input.voiceId ?? "aria-neural"] ?? "en-US-AriaNeural";
    const tts = new EdgeTTS(input.text, voice);
    const raced = await Promise.race<Buffer>([
      tts.synthesize().then((r: { audio: Blob | ArrayBuffer }) => {
        if (r.audio instanceof ArrayBuffer) return Buffer.from(r.audio);
        // Blob (jsdom / edge runtime)
        return (r.audio as Blob).arrayBuffer().then((ab) => Buffer.from(ab));
      }),
      new Promise<Buffer>((_, reject) => {
        if (signal.aborted) reject(signal.reason);
        else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    ]);
    if (!raced || raced.length < 256) {
      throw new Error("edge-tts returned empty payload");
    }
    return {
      audioBuffer: raced,
      format: "mp3",
      durationSec: estimateDuration(input.text),
      provider: "edge-tts",
    };
  },
};

const gttsProvider: Provider<TTSInput, TTSOutput> = {
  name: "gtts",
  priority: 70,
  timeoutMs: 25_000,
  available: () => true,
  async execute(input, signal) {
    const limit = input.chunkLimit ?? 190;
    const chunks: string[] = [];
    const words = input.text.trim().split(/\s+/);
    let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length > limit) {
        if (cur) chunks.push(cur.trim());
        cur = w;
      } else {
        cur = (cur + " " + w).trim();
      }
    }
    if (cur) chunks.push(cur);
    if (chunks.length === 0) throw new Error("gtts: empty text");

    const parts: Buffer[] = [];
    for (const chunk of chunks) {
      if (signal.aborted) throw signal.reason;
      const b64 = await getAudioBase64(chunk, { lang: "en", slow: false, host: "https://translate.google.com" });
      parts.push(Buffer.from(b64, "base64"));
    }
    const audioBuffer = Buffer.concat(parts);
    if (audioBuffer.length < 256) throw new Error("gtts: tiny payload");
    return {
      audioBuffer,
      format: "mp3",
      durationSec: estimateDuration(input.text),
      provider: "gtts",
    };
  },
};

const openaiProvider: Provider<TTSInput, TTSOutput> = {
  name: "openai",
  priority: 50, // paid fallback; only if key present
  timeoutMs: 60_000,
  available: () => Boolean(getKey("OPENAI_API_KEY")),
  async execute(input, signal) {
    const apiKey = getKey("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY missing");
    const voice = OPENAI_VOICE_MAP[input.voiceId ?? "aria-neural"] ?? "alloy";
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice,
        input: input.text,
        response_format: "mp3",
      }),
      signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`openai tts ${res.status}: ${body.slice(0, 120)}`);
    }
    const ab = await res.arrayBuffer();
    return {
      audioBuffer: Buffer.from(ab),
      format: "mp3",
      durationSec: estimateDuration(input.text),
      provider: "openai",
    };
  },
};

export const ttsProviders: Provider<TTSInput, TTSOutput>[] = [
  edgeTtsProvider,
  gttsProvider,
  openaiProvider,
];

export async function synthesizeTTS(
  input: TTSInput,
  signal?: AbortSignal,
): Promise<ProviderResult<TTSOutput>> {
  return executeSequential("tts", ttsProviders, input, signal);
}
