/**
 * Image provider pool. Returns an image either as a public URL (for
 * hosted-render engines like Shotstack) or as a Buffer (for local ffmpeg).
 *
 * Providers:
 *   - pollinations: free, keyless, AI-generated via flux (PRIMARY)
 *   - aihorde: anonymous SD via crowdsourced workers (SECONDARY)
 *   - picsum: non-AI stock fallback — guarantees we always have something
 */

import { Provider, ProviderResult, executeSequential } from "./core";

export type ImageInput = {
  prompt: string;
  /** Stable seed so repeated requests for the same scene are reproducible. */
  seed?: number;
  width?: number;
  height?: number;
  /** If true, pool will return a public URL; otherwise the provider may
   *  proxy and return a Buffer. Shotstack path uses url:true. */
  urlOnly?: boolean;
};

export type ImageOutput = {
  url: string; // always populated (for hosted engines)
  buffer?: Buffer; // populated only when fetched
  provider: string;
  width: number;
  height: number;
};

function clampSize(n: number | undefined, fallback: number): number {
  if (!n || Number.isNaN(n)) return fallback;
  return Math.max(256, Math.min(1536, Math.round(n)));
}

const pollinationsProvider: Provider<ImageInput, ImageOutput> = {
  name: "pollinations",
  priority: 100,
  timeoutMs: 30_000,
  available: () => true,
  async execute(input, signal) {
    const w = clampSize(input.width, 1280);
    const h = clampSize(input.height, 720);
    const seed = input.seed ?? Math.floor(Math.random() * 1_000_000);
    const params = new URLSearchParams({
      width: String(w),
      height: String(h),
      seed: String(seed),
      model: "flux",
      nologo: "true",
      enhance: "true",
    });
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(input.prompt)}?${params.toString()}`;
    if (input.urlOnly) {
      // Pollinations serves the image on-demand when Shotstack fetches the URL.
      // We still do a light HEAD to confirm reachability; failures mark unhealthy.
      const head = await fetch(url, { method: "HEAD", signal });
      if (!head.ok) throw new Error(`pollinations HEAD ${head.status}`);
      return { url, provider: "pollinations", width: w, height: h };
    }
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`pollinations ${res.status}`);
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    if (buf.length < 1024) throw new Error("pollinations tiny payload");
    return { url, buffer: buf, provider: "pollinations", width: w, height: h };
  },
};

const AI_HORDE_API = "https://aihorde.net/api/v2";

const aihordeProvider: Provider<ImageInput, ImageOutput> = {
  name: "aihorde",
  priority: 60,
  timeoutMs: 120_000,
  available: () => true,
  async execute(input, signal) {
    const w = clampSize(input.width, 1024);
    const h = clampSize(input.height, 576);
    // Round to 64
    const snap = (n: number) => Math.max(64, Math.round(n / 64) * 64);
    const apiKey = "0000000000"; // anonymous key per AI Horde docs
    const startRes = await fetch(`${AI_HORDE_API}/generate/async`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: apiKey,
        "Client-Agent": "aurora-platform:1.0:+https://github.com/noomar/grok-like-ai-platform",
      },
      body: JSON.stringify({
        prompt: input.prompt,
        params: {
          width: snap(w),
          height: snap(h),
          steps: 20,
          sampler_name: "k_euler_a",
          seed: input.seed ? String(input.seed) : undefined,
          n: 1,
        },
        nsfw: false,
        trusted_workers: false,
        r2: true,
      }),
      signal,
    });
    if (!startRes.ok) {
      const body = await startRes.text().catch(() => "");
      throw new Error(`aihorde start ${startRes.status}: ${body.slice(0, 120)}`);
    }
    const startJson = (await startRes.json()) as { id?: string; message?: string };
    if (!startJson.id) throw new Error(`aihorde: no id (${startJson.message ?? ""})`);
    const id = startJson.id;

    // Poll check endpoint until done or 110s budget.
    const deadline = Date.now() + 110_000;
    while (Date.now() < deadline) {
      if (signal.aborted) throw signal.reason;
      await new Promise((r) => setTimeout(r, 4000));
      const chk = await fetch(`${AI_HORDE_API}/generate/check/${id}`, { signal });
      if (!chk.ok) continue;
      const cj = (await chk.json()) as { done?: boolean; faulted?: boolean };
      if (cj.faulted) throw new Error("aihorde faulted");
      if (cj.done) break;
    }
    const statusRes = await fetch(`${AI_HORDE_API}/generate/status/${id}`, { signal });
    if (!statusRes.ok) throw new Error(`aihorde status ${statusRes.status}`);
    const sj = (await statusRes.json()) as {
      generations?: Array<{ img?: string }>;
    };
    const urlOrB64 = sj.generations?.[0]?.img;
    if (!urlOrB64) throw new Error("aihorde: no image");
    // r2:true returns a public URL; otherwise base64.
    if (/^https?:\/\//.test(urlOrB64)) {
      if (input.urlOnly) {
        return { url: urlOrB64, provider: "aihorde", width: w, height: h };
      }
      const r = await fetch(urlOrB64, { signal });
      const buf = Buffer.from(await r.arrayBuffer());
      return { url: urlOrB64, buffer: buf, provider: "aihorde", width: w, height: h };
    }
    const buf = Buffer.from(urlOrB64, "base64");
    // Build a data URL only as a last resort (Shotstack won't accept it).
    if (input.urlOnly) throw new Error("aihorde returned base64, needs URL");
    return {
      url: `data:image/webp;base64,${urlOrB64}`,
      buffer: buf,
      provider: "aihorde",
      width: w,
      height: h,
    };
  },
};

const picsumProvider: Provider<ImageInput, ImageOutput> = {
  name: "picsum",
  priority: 10, // last-resort stock fallback (not AI)
  timeoutMs: 15_000,
  available: () => true,
  async execute(input, signal) {
    const w = clampSize(input.width, 1280);
    const h = clampSize(input.height, 720);
    const seed = input.seed ?? Math.floor(Math.random() * 1_000_000);
    const url = `https://picsum.photos/seed/${encodeURIComponent(String(seed))}/${w}/${h}`;
    if (input.urlOnly) {
      return { url, provider: "picsum", width: w, height: h };
    }
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`picsum ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return { url, buffer: buf, provider: "picsum", width: w, height: h };
  },
};

export const imageProviders: Provider<ImageInput, ImageOutput>[] = [
  pollinationsProvider,
  aihordeProvider,
  picsumProvider,
];

export async function fetchSceneImage(
  input: ImageInput,
  signal?: AbortSignal,
): Promise<ProviderResult<ImageOutput>> {
  return executeSequential("images", imageProviders, input, signal);
}
