import { NextRequest, NextResponse } from "next/server";
import { isAdmin, isAdminHeader } from "@/lib/session";
import { runAgent } from "@/lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Agent executor. POST a `{ goal }`, get back a transcript of the plan the
 * keyless planner produced and the shell output of each step it ran.
 *
 * Admin-gated. Same trust boundary as /api/admin/terminal.
 */
export async function POST(request: NextRequest) {
  const sessionOk = await isAdmin();
  const headerOk = isAdminHeader(
    request.headers.get("x-admin-password") ?? undefined,
  );
  if (!sessionOk && !headerOk) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { goal } = (await request.json().catch(() => ({}))) as { goal?: string };
  if (!goal || typeof goal !== "string" || goal.length < 3) {
    return NextResponse.json({ error: "goal required (min 3 chars)" }, { status: 400 });
  }
  try {
    const run = await runAgent(goal);
    return NextResponse.json(run);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 },
    );
  }
}
