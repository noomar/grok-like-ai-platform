import { getKey } from "./env";
import { MissingKeyError } from "./tts";

export type ShotstackScene = {
  imageUrl: string;
  text: string;
  durationSec: number;
};

type ShotstackClip = {
  asset:
    | { type: "image"; src: string }
    | { type: "title"; text: string; style: string; color?: string; size?: string };
  start: number;
  length: number;
  effect?: string;
  transition?: { in?: string; out?: string };
};

const PROD_BASE = "https://api.shotstack.io/edit/v1";
const STAGE_BASE = "https://api.shotstack.io/edit/stage";

function baseUrl(): string {
  const forceStage = process.env.SHOTSTACK_ENV === "stage";
  return forceStage ? STAGE_BASE : PROD_BASE;
}

/**
 * Submit a render job to Shotstack. Returns the render id.
 * Caller polls `pollShotstackRender(id)` until a URL is populated.
 */
export async function createShotstackRender(
  scenes: ShotstackScene[],
  audioUrl: string | null,
): Promise<string> {
  const apiKey = getKey("SHOTSTACK_API_KEY");
  if (!apiKey) throw new MissingKeyError("SHOTSTACK_API_KEY");

  let t = 0;
  const clips: ShotstackClip[] = [];
  for (const s of scenes) {
    clips.push({
      asset: { type: "image", src: s.imageUrl },
      start: t,
      length: s.durationSec,
      effect: "zoomIn",
      transition: { in: "fade", out: "fade" },
    });
    clips.push({
      asset: {
        type: "title",
        text: s.text.slice(0, 240),
        style: "minimal",
        color: "#ffffff",
        size: "medium",
      },
      start: t,
      length: s.durationSec,
    });
    t += s.durationSec;
  }

  const timeline: Record<string, unknown> = {
    background: "#000000",
    tracks: [{ clips }],
  };
  if (audioUrl) {
    timeline.soundtrack = { src: audioUrl, effect: "fadeInFadeOut" };
  }

  const body = {
    timeline,
    output: { format: "mp4", resolution: "hd", fps: 30 },
  };

  const res = await fetch(`${baseUrl()}/render`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Shotstack submit failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    success: boolean;
    response: { id: string; message?: string };
    message?: string;
  };
  if (!json.success || !json.response?.id) {
    throw new Error(`Shotstack submit rejected: ${json.message ?? "unknown"}`);
  }
  return json.response.id;
}

export type ShotstackStatus = {
  status: string;
  url?: string;
  error?: string;
  renderTime?: number;
};

export async function getShotstackStatus(id: string): Promise<ShotstackStatus> {
  const apiKey = getKey("SHOTSTACK_API_KEY");
  if (!apiKey) throw new MissingKeyError("SHOTSTACK_API_KEY");
  const res = await fetch(`${baseUrl()}/render/${id}`, {
    headers: { "x-api-key": apiKey },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Shotstack poll failed ${res.status}`);
  const json = (await res.json()) as { response: ShotstackStatus };
  return json.response;
}

/**
 * Poll until Shotstack reports `done`, returning the CDN URL of the rendered MP4.
 * Throws on `failed` or timeout.
 */
export async function pollShotstackRender(
  id: string,
  {
    timeoutMs = 300_000,
    intervalMs = 4000,
    onTick,
  }: { timeoutMs?: number; intervalMs?: number; onTick?: (s: ShotstackStatus) => void } = {},
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await getShotstackStatus(id);
    onTick?.(s);
    if (s.status === "done" && s.url) return s.url;
    if (s.status === "failed") throw new Error(s.error ?? "Shotstack render failed");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Shotstack render timeout");
}

export function pollinationsImageUrl(prompt: string, seed?: number, width = 1280, height = 720): string {
  const qs = new URLSearchParams({
    width: String(width),
    height: String(height),
    nologo: "true",
    model: "flux",
    ...(seed !== undefined ? { seed: String(seed) } : {}),
  });
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${qs.toString()}`;
}
