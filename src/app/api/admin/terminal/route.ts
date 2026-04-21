import { NextRequest, NextResponse } from "next/server";
import { isAdmin, isAdminHeader } from "@/lib/session";
import { execShell } from "@/lib/shell-exec";

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

  const result = await execShell(command, {
    cwd,
    timeoutMs: TIMEOUT_MS,
    maxOutput: MAX_OUTPUT,
  });
  return NextResponse.json({
    ...result,
    host: detectHost(),
    cwd: cwd ?? process.cwd(),
  });
}

function detectHost(): string {
  if (process.env.VERCEL === "1") return "vercel-lambda";
  if (process.env.FLY_APP_NAME) return `fly:${process.env.FLY_APP_NAME}`;
  if (process.env.RAILWAY_PROJECT_ID) return "railway";
  return "self-hosted";
}
