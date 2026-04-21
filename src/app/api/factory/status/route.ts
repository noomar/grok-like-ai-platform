import { NextRequest, NextResponse } from "next/server";
import { pollVideoStatus } from "@/lib/providers/video";
import { hasKey } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stateless proxy for video provider status. The renderId is of the form
 * `<provider>:<id>` (e.g. `shotstack:abc`, `hf-space:123`). Legacy plain
 * ids without a provider prefix are treated as shotstack.
 *
 * No server-side state is kept — the client polls this endpoint per-job
 * so serverless hosts can scale without coordination.
 */
export async function GET(req: NextRequest) {
  const renderId = req.nextUrl.searchParams.get("renderId");
  if (!renderId) {
    return NextResponse.json({ error: "renderId required" }, { status: 400 });
  }
  // Fast-fail when the relevant provider isn't configured. We infer from the
  // prefix; legacy ids assume shotstack.
  const provider = renderId.includes(":") ? renderId.split(":")[0] : "shotstack";
  if (provider === "shotstack" && !hasKey("SHOTSTACK_API_KEY")) {
    return NextResponse.json(
      { error: "Missing Key: SHOTSTACK_API_KEY", provider },
      { status: 412 },
    );
  }
  if (provider === "hf-space" && !hasKey("HF_RENDER_URL")) {
    return NextResponse.json(
      { error: "Missing Key: HF_RENDER_URL", provider },
      { status: 412 },
    );
  }
  try {
    const s = await pollVideoStatus(renderId);
    return NextResponse.json({
      renderId,
      provider: s.provider,
      status: s.status,
      url: s.url ?? null,
      error: s.error ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "poll failed", provider },
      { status: 502 },
    );
  }
}
