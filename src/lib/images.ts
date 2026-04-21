// Free image source: Pollinations.ai (no key required).
// Returns a JPEG image buffer for a given prompt.

export async function fetchPollinationsImage(
  prompt: string,
  {
    width = 1280,
    height = 720,
    seed,
    timeoutMs = 120_000,
    retries = 2,
  }: { width?: number; height?: number; seed?: number; timeoutMs?: number; retries?: number } = {},
): Promise<Buffer> {
  const qs = new URLSearchParams({
    width: String(width),
    height: String(height),
    nologo: "true",
    model: "flux",
    ...(seed !== undefined ? { seed: String(seed) } : {}),
  });
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${qs.toString()}`;

  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { accept: "image/jpeg,image/png,*/*" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        throw new Error(`Pollinations fetch failed: ${res.status} ${res.statusText}`);
      }
      const ab = await res.arrayBuffer();
      if (ab.byteLength < 1024) {
        throw new Error(`Pollinations returned tiny payload (${ab.byteLength} bytes)`);
      }
      return Buffer.from(ab);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Pollinations fetch failed");
}
