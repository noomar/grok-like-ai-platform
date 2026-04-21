import { NextRequest, NextResponse, after } from "next/server";
import { isAdmin, isAdminHeader } from "@/lib/session";
import { runAgent, runAgentStreaming } from "@/lib/agent";
import {
  createRun,
  getRun,
  listRuns,
  updateRun,
  pruneOld,
} from "@/lib/agent-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Stretch the Lambda budget on Vercel. Capped at 60s on Hobby, 300s on Pro.
export const maxDuration = 60;

/**
 * POST:
 *   body: { goal: string, mode?: "async" | "sync" }
 *   async (default) returns { runId, status: "queued" } immediately and keeps
 *   processing via `after()`. Poll GET /api/admin/agent?runId=… for progress.
 *   sync returns the full AgentRun inline (old behavior; capped by maxDuration).
 *
 * GET:
 *   /api/admin/agent           → { runs: [...] } (recent runs)
 *   /api/admin/agent?runId=X   → AgentRunRecord
 */
async function checkAuth(request: NextRequest): Promise<boolean> {
  const sessionOk = await isAdmin();
  const headerOk = isAdminHeader(
    request.headers.get("x-admin-password") ?? undefined,
  );
  return sessionOk || headerOk;
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth(request))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { goal, mode } = (await request.json().catch(() => ({}))) as {
    goal?: string;
    mode?: "async" | "sync";
  };
  if (!goal || typeof goal !== "string" || goal.length < 3) {
    return NextResponse.json({ error: "goal required (min 3 chars)" }, { status: 400 });
  }

  if (mode === "sync") {
    try {
      const run = await runAgent(goal);
      return NextResponse.json(run);
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 502 });
    }
  }

  pruneOld();
  const record = createRun(goal);

  after(async () => {
    updateRun(record.id, { status: "planning" });
    try {
      await runAgentStreaming(goal, {
        onPlan: (info) =>
          updateRun(record.id, {
            status: "running",
            plan: info.plan,
            summary: info.summary,
            model: info.model,
            plannerMs: info.plannerMs,
            progress: { currentStep: 0, totalSteps: info.plan.length },
          }),
        onStepStart: (index) => {
          const current = getRun(record.id);
          if (!current) return;
          updateRun(record.id, {
            progress: { currentStep: index, totalSteps: current.progress.totalSteps },
          });
        },
        onStepDone: (index, step) => {
          const current = getRun(record.id);
          if (!current) return;
          const plan = [...current.plan];
          plan[index] = step;
          updateRun(record.id, {
            plan,
            progress: { currentStep: index + 1, totalSteps: plan.length },
          });
        },
      });
      updateRun(record.id, {
        status: "done",
        finishedAt: new Date().toISOString(),
      });
    } catch (err) {
      updateRun(record.id, {
        status: "failed",
        error: (err as Error).message,
        finishedAt: new Date().toISOString(),
      });
    }
  });

  return NextResponse.json({ runId: record.id, status: "queued" });
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth(request))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const runId = new URL(request.url).searchParams.get("runId");
  if (runId) {
    const run = getRun(runId);
    if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(run);
  }
  return NextResponse.json({ runs: listRuns() });
}
