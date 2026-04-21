import { NextRequest, NextResponse } from "next/server";
import { enqueueJob, listJobs } from "@/lib/factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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

  const job = enqueueJob({
    title: body.title ?? "",
    script: body.script,
    voice: body.voice,
    musicMood: body.musicMood,
    requestedBy: body.requestedBy,
  });

  return NextResponse.json({ job }, { status: 201 });
}
