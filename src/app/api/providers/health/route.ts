import { NextResponse } from "next/server";
import { getPoolSnapshot } from "@/lib/providers/core";
import { ttsProviders } from "@/lib/providers/tts";
import { imageProviders } from "@/lib/providers/images";
import { videoProviders } from "@/lib/providers/video";
import { environmentStatus } from "@/lib/factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Monitoring endpoint: returns a snapshot of every provider pool with
 * recent success/failure counts, latency, cooldowns, and whether each
 * provider is currently "available" (configured in this runtime).
 */
export async function GET() {
  const snapshot = getPoolSnapshot();

  const registry = {
    tts: ttsProviders,
    images: imageProviders,
    video: videoProviders,
  };

  const out: Record<
    string,
    Array<{
      name: string;
      priority: number;
      available: boolean;
      successes: number;
      failures: number;
      avgLatencyMs: number;
      cooldownUntil: number;
      lastError?: string;
      lastOkAt?: number;
      lastFailAt?: number;
    }>
  > = {};

  for (const [poolName, providers] of Object.entries(registry)) {
    out[poolName] = providers.map((p) => {
      const h = snapshot[poolName]?.[p.name] ?? {
        successes: 0,
        failures: 0,
        avgLatencyMs: 0,
        cooldownUntil: 0,
      };
      return {
        name: p.name,
        priority: p.priority,
        available: p.available(),
        successes: h.successes,
        failures: h.failures,
        avgLatencyMs: h.avgLatencyMs,
        cooldownUntil: h.cooldownUntil,
        lastError: h.lastError,
        lastOkAt: h.lastOkAt,
        lastFailAt: h.lastFailAt,
      };
    });
  }

  return NextResponse.json({
    pools: out,
    environment: environmentStatus(),
    generatedAt: new Date().toISOString(),
  });
}
