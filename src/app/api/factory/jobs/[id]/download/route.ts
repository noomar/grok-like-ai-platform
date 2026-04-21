import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { ReadableStream as NodeReadableStream } from "node:stream/web";
import path from "node:path";
import { getJob } from "@/lib/factory";
import { localAssetPath } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 });

  const url = new URL(req.url);
  const requested = url.searchParams.get("file") ?? "video.mp4";
  // Prevent path traversal.
  const filename = path.basename(requested);
  const allowed = new Set(["video.mp4", "audio.mp3", "thumbnail.jpg"]);
  if (!allowed.has(filename)) {
    return NextResponse.json({ error: "invalid file" }, { status: 400 });
  }

  const filePath = localAssetPath(id, filename);
  let size: number;
  try {
    const s = await stat(filePath);
    size = s.size;
  } catch {
    return NextResponse.json(
      { error: "asset not available on this instance (restart wiped /tmp, or render incomplete)" },
      { status: 404 },
    );
  }

  const ext = path.extname(filename).toLowerCase();
  const contentType = MIME[ext] ?? "application/octet-stream";

  const disposition = url.searchParams.get("download") != null
    ? `attachment; filename="${job.title.replace(/[^a-zA-Z0-9-_]+/g, "_")}-${filename}"`
    : `inline; filename="${filename}"`;

  const nodeStream = createReadStream(filePath);
  const webStream = Readable.toWeb(nodeStream) as unknown as NodeReadableStream<Uint8Array>;

  return new Response(webStream as unknown as BodyInit, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-length": String(size),
      "content-disposition": disposition,
      "cache-control": "private, max-age=60",
      "accept-ranges": "bytes",
    },
  });
}
