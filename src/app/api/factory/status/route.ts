import { NextRequest, NextResponse } from "next/server";
import { getShotstackStatus } from "@/lib/shotstack";
import { hasKey } from "@/lib/env";

export const runtime = "nodejs";

/**
 * Stateless proxy to Shotstack status. The client polls this endpoint with
 * the render id returned at POST time, so we don't need any persistent
 * server-side state on Vercel's serverless runtime.
 */
export async function GET(req: NextRequest) {
  const renderId = req.nextUrl.searchParams.get("renderId");
  if (!renderId) {
    return NextResponse.json({ error: "renderId required" }, { status: 400 });
  }
  if (!hasKey("SHOTSTACK_API_KEY")) {
    return NextResponse.json(
      { error: "Missing Key: SHOTSTACK_API_KEY" },
      { status: 412 },
    );
  }
  try {
    const s = await getShotstackStatus(renderId);
    return NextResponse.json({
      renderId,
      status: s.status,
      url: s.url ?? null,
      error: s.error ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "poll failed" },
      { status: 502 },
    );
  }
}
