import { getKey } from "./env";
import { MissingKeyError } from "./tts";

type ShotstackClip = {
  asset: { type: "image" | "title"; src?: string; text?: string; style?: string };
  start: number;
  length: number;
  effect?: string;
};

export type ShotstackScene = {
  imageUrl: string;
  text: string;
  durationSec: number;
};

/**
 * Optional: submit a render job to Shotstack if SHOTSTACK_API_KEY is set.
 * Returns the render id. Caller polls /render/:id until `url` is populated.
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
    });
    clips.push({
      asset: { type: "title", text: s.text.slice(0, 140), style: "minimal" },
      start: t,
      length: s.durationSec,
    });
    t += s.durationSec;
  }

  const tracks = [{ clips }];
  const timeline: Record<string, unknown> = {
    background: "#000000",
    tracks,
  };
  if (audioUrl) {
    timeline.soundtrack = { src: audioUrl, effect: "fadeInFadeOut" };
  }

  const body = {
    timeline,
    output: {
      format: "mp4",
      resolution: "hd",
      fps: 30,
    },
  };

  const res = await fetch("https://api.shotstack.io/stage/render", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Shotstack submit failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { success: boolean; response: { id: string } };
  return json.response.id;
}

export async function pollShotstackRender(id: string, timeoutMs = 120_000): Promise<string> {
  const apiKey = getKey("SHOTSTACK_API_KEY");
  if (!apiKey) throw new MissingKeyError("SHOTSTACK_API_KEY");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`https://api.shotstack.io/stage/render/${id}`, {
      headers: { "x-api-key": apiKey },
    });
    if (!res.ok) throw new Error(`Shotstack poll failed ${res.status}`);
    const json = (await res.json()) as {
      response: { status: string; url?: string; error?: string };
    };
    const { status, url, error } = json.response;
    if (status === "done" && url) return url;
    if (status === "failed") throw new Error(error ?? "Shotstack render failed");
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Shotstack render timeout");
}
