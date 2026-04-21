import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { put } from "@vercel/blob";
import { getKey, hasKey } from "./env";

export type StoredAsset = {
  kind: "blob" | "local";
  url: string;
  /** Absolute filesystem path, only for kind="local". */
  localPath?: string;
  sizeBytes: number;
};

const LOCAL_ROOT = path.join(os.tmpdir(), "aurora-renders");

/**
 * Persist a buffer. Uses Vercel Blob when BLOB_READ_WRITE_TOKEN is set;
 * otherwise writes to /tmp and returns a relative URL served by the
 * `/api/factory/jobs/[id]/download` route.
 */
export async function persistAsset(
  jobId: string,
  filename: string,
  data: Buffer,
  contentType: string,
): Promise<StoredAsset> {
  if (hasKey("BLOB_READ_WRITE_TOKEN")) {
    const token = getKey("BLOB_READ_WRITE_TOKEN")!;
    const blob = await put(`jobs/${jobId}/${filename}`, data, {
      access: "public",
      contentType,
      token,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return { kind: "blob", url: blob.url, sizeBytes: data.length };
  }

  const dir = path.join(LOCAL_ROOT, jobId);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, data);
  return {
    kind: "local",
    url: `/api/factory/jobs/${jobId}/download?file=${encodeURIComponent(filename)}`,
    localPath: filePath,
    sizeBytes: data.length,
  };
}

export async function readLocalAsset(jobId: string, filename: string): Promise<Buffer> {
  const filePath = path.join(LOCAL_ROOT, jobId, filename);
  return fs.readFile(filePath);
}

export function localAssetPath(jobId: string, filename: string): string {
  return path.join(LOCAL_ROOT, jobId, filename);
}

export async function cleanupLocalJob(jobId: string): Promise<void> {
  const dir = path.join(LOCAL_ROOT, jobId);
  await fs.rm(dir, { recursive: true, force: true });
}
