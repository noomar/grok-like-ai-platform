import { NextRequest, NextResponse } from "next/server";
import { enqueueJob, listJobs, submitShotstackJob } from "@/lib/factory";
import { hasKey } from "@/lib/env";
import { MissingKeyError } from "@/lib/tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Note: on serverless (Vercel), in-memory state does NOT persist between
  // invocations, so this list is only authoritative when running on a
  // long-lived single-process host (e.g. `npm run start` on a box). On
  // serverless the client is expected to keep its own list and poll
  // `/api/factory/status?renderId=...` for per-job updates.
  return NextResponse.json({ jobs: listJobs() });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | {
        title?: string;
        script?: string;
        voice?: string;
        musicMood?: string;
        requestedBy?: string;
      }
    | null;

  if (!body || typeof body.script !== "string" || body.script.trim().length === 0) {
    return NextResponse.json({ error: "script is required" }, { status: 400 });
  }

  const input = {
    title: body.title ?? "",
    script: body.script,
    voice: body.voice,
    musicMood: body.musicMood,
    requestedBy: body.requestedBy,
  };

  // On serverless hosts (or whenever Shotstack is the primary engine) we
  // submit synchronously to Shotstack and return the engineRenderId so the
  // client can poll `/api/factory/status` without relying on server state.
  if (hasKey("SHOTSTACK_API_KEY")) {
    try {
      const job = await submitShotstackJob(input);
      return NextResponse.json({ job }, { status: 201 });
    } catch (err) {
      if (err instanceof MissingKeyError) {
        return NextResponse.json(
          { error: `Missing Key: ${err.keyName}`, missingKey: err.keyName },
          { status: 412 },
        );
      }
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "submit failed" },
        { status: 502 },
      );
    }
  }

  // Fallback: in-process pipeline (ffmpeg path). Only useful on a long-lived
  // host because it relies on the in-memory store.
  const job = enqueueJob(input);
  return NextResponse.json({ job }, { status: 201 });
}
