/**
 * Video render pool. A "render" here means: given a list of scenes
 * (each with a public image URL, optional text, duration) + optional audio URL,
 * submit a render job and return a renderId + provider name. The client then
 * polls status via /api/factory/status?renderId=provider:id.
 *
 * Providers:
 *   - shotstack: paid (primary when SHOTSTACK_API_KEY set)
 *   - hf-space: self-hosted FastAPI + ffmpeg on HF Spaces (HF_RENDER_URL)
 *   - ffmpeg-local: in-process ffmpeg (works on Node hosts, NOT on Vercel
 *     serverless where /tmp is tiny and cold starts are slow — but still
 *     available as a last-resort on a VM)
 */

import { Provider, ProviderResult, executeSequential } from "./core";
import { getKey, hasKey } from "@/lib/env";
import { createShotstackRender, getShotstackStatus } from "@/lib/shotstack";

export type VideoScene = {
  imageUrl: string;
  text?: string;
  durationSec: number;
};

export type VideoRenderInput = {
  scenes: VideoScene[];
  audioUrl?: string | null;
  width?: number;
  height?: number;
};

export type VideoRenderHandle = {
  /** `${provider}:${renderId}` — the client polls this compound id. */
  renderId: string;
  provider: string;
};

export type VideoStatus = {
  status: "queued" | "fetching" | "rendering" | "saving" | "done" | "failed";
  url: string | null;
  error: string | null;
  provider: string;
};

function snapshotEnv() {
  return {
    shotstack: hasKey("SHOTSTACK_API_KEY"),
    hfSpace: Boolean(getKey("HF_RENDER_URL")),
  };
}

/* ----------------------------- Shotstack ---------------------------------- */

const shotstackProvider: Provider<VideoRenderInput, VideoRenderHandle> = {
  name: "shotstack",
  priority: 100,
  timeoutMs: 30_000,
  available: () => snapshotEnv().shotstack,
  async execute(input) {
    const id = await createShotstackRender(
      input.scenes.map((s) => ({
        imageUrl: s.imageUrl,
        text: s.text ?? "",
        durationSec: s.durationSec,
      })),
      input.audioUrl ?? null,
    );
    return { renderId: id, provider: "shotstack" };
  },
};

async function shotstackStatus(renderId: string): Promise<VideoStatus> {
  const s = await getShotstackStatus(renderId);
  const map: Record<string, VideoStatus["status"]> = {
    queued: "queued",
    fetching: "fetching",
    rendering: "rendering",
    saving: "saving",
    done: "done",
    failed: "failed",
  };
  return {
    status: map[s.status] ?? "rendering",
    url: s.url ?? null,
    error: s.error ?? null,
    provider: "shotstack",
  };
}

/* ------------------------------ HF Space ---------------------------------- */
/**
 * Contract for the self-hosted worker (see services/render-worker/):
 *   POST /render  { scenes, audioUrl?, width?, height? }
 *     -> 202 { renderId: string }
 *   GET  /status/:renderId -> { status, url, error }
 */

const hfSpaceProvider: Provider<VideoRenderInput, VideoRenderHandle> = {
  name: "hf-space",
  priority: 80,
  timeoutMs: 30_000,
  available: () => Boolean(getKey("HF_RENDER_URL")),
  async execute(input, signal) {
    const base = getKey("HF_RENDER_URL")!.replace(/\/$/, "");
    const res = await fetch(`${base}/render`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(getKey("HF_RENDER_TOKEN")
          ? { authorization: `Bearer ${getKey("HF_RENDER_TOKEN")}` }
          : {}),
      },
      body: JSON.stringify(input),
      signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`hf-space ${res.status}: ${body.slice(0, 160)}`);
    }
    const j = (await res.json()) as { renderId?: string };
    if (!j.renderId) throw new Error("hf-space: missing renderId");
    return { renderId: j.renderId, provider: "hf-space" };
  },
};

async function hfSpaceStatus(renderId: string): Promise<VideoStatus> {
  const base = getKey("HF_RENDER_URL")?.replace(/\/$/, "");
  if (!base) return { status: "failed", url: null, error: "HF_RENDER_URL not set", provider: "hf-space" };
  const res = await fetch(`${base}/status/${encodeURIComponent(renderId)}`, {
    headers: getKey("HF_RENDER_TOKEN")
      ? { authorization: `Bearer ${getKey("HF_RENDER_TOKEN")}` }
      : undefined,
  });
  if (!res.ok) {
    return { status: "failed", url: null, error: `status ${res.status}`, provider: "hf-space" };
  }
  const j = (await res.json()) as { status?: string; url?: string; error?: string };
  const status = (j.status ?? "rendering") as VideoStatus["status"];
  return {
    status,
    url: j.url ?? null,
    error: j.error ?? null,
    provider: "hf-space",
  };
}

/* ------------------------------- exports ---------------------------------- */

export const videoProviders: Provider<VideoRenderInput, VideoRenderHandle>[] = [
  shotstackProvider,
  hfSpaceProvider,
];

export async function submitVideoRender(
  input: VideoRenderInput,
  signal?: AbortSignal,
): Promise<ProviderResult<VideoRenderHandle>> {
  return executeSequential("video", videoProviders, input, signal);
}

/** Stateless status lookup. renderId is "provider:id"; legacy plain ids
 *  default to shotstack. */
export async function pollVideoStatus(renderId: string): Promise<VideoStatus> {
  const [maybeProvider, ...rest] = renderId.split(":");
  const providers = ["shotstack", "hf-space"] as const;
  const provider = (providers as readonly string[]).includes(maybeProvider)
    ? (maybeProvider as (typeof providers)[number])
    : "shotstack";
  const id = (providers as readonly string[]).includes(maybeProvider)
    ? rest.join(":")
    : renderId;
  switch (provider) {
    case "shotstack":
      return shotstackStatus(id);
    case "hf-space":
      return hfSpaceStatus(id);
  }
}
