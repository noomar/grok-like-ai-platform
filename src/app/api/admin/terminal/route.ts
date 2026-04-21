import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { isAdmin, isAdminHeader } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Web terminal. Runs shell commands on whatever host the Nest is deployed on.
 *
 * Security: this endpoint grants effectively-full access to the server. It is
 * gated on the admin cookie OR the `x-admin-password` header. Anyone with
 * `ADMIN_PASSWORD` gets a shell. The Commander explicitly accepted this
 * trade-off — treat `ADMIN_PASSWORD` like a production root password.
 *
 * On Vercel the exec runs inside an ephemeral Lambda sandbox: read-only
 * filesystem outside /tmp, no package installs, state doesn't persist across
 * requests. On the Docker Nest it's a real shell on the container.
 */

const MAX_OUTPUT = 64 * 1024;
const TIMEOUT_MS = 25_000;

export async function POST(request: NextRequest) {
  const sessionOk = await isAdmin();
  const headerOk = isAdminHeader(
    request.headers.get("x-admin-password") ?? undefined,
  );
  if (!sessionOk && !headerOk) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { command, cwd } = (await request.json().catch(() => ({}))) as {
    command?: string;
    cwd?: string;
  };
  if (!command || typeof command !== "string") {
    return NextResponse.json({ error: "command required" }, { status: 400 });
  }

  const start = Date.now();
  const result = await execShell(command, cwd);
  return NextResponse.json({
    ...result,
    durationMs: Date.now() - start,
    host: detectHost(),
    cwd: cwd ?? process.cwd(),
  });
}

function execShell(
  command: string,
  cwd?: string,
): Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn("/bin/sh", ["-c", command], {
      cwd: cwd && cwd.startsWith("/") ? cwd : undefined,
      env: { ...process.env, PATH: process.env.PATH ?? "/usr/bin:/bin" },
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const killTimer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, TIMEOUT_MS);

    child.stdout.on("data", (b: Buffer) => {
      stdout += b.toString("utf8");
      if (stdout.length > MAX_OUTPUT) {
        stdout = stdout.slice(0, MAX_OUTPUT) + "\n…[truncated]";
        child.kill("SIGKILL");
      }
    });
    child.stderr.on("data", (b: Buffer) => {
      stderr += b.toString("utf8");
      if (stderr.length > MAX_OUTPUT) {
        stderr = stderr.slice(0, MAX_OUTPUT) + "\n…[truncated]";
        child.kill("SIGKILL");
      }
    });
    child.on("error", (err) => {
      clearTimeout(killTimer);
      resolve({
        stdout,
        stderr: stderr + `\n[spawn error: ${err.message}]`,
        exitCode: null,
        timedOut,
      });
    });
    child.on("close", (code) => {
      clearTimeout(killTimer);
      resolve({ stdout, stderr, exitCode: code, timedOut });
    });
  });
}

function detectHost(): string {
  if (process.env.VERCEL === "1") return "vercel-lambda";
  if (process.env.FLY_APP_NAME) return `fly:${process.env.FLY_APP_NAME}`;
  if (process.env.RAILWAY_PROJECT_ID) return "railway";
  return "self-hosted";
}
