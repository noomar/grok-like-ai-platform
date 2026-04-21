"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ShellResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
};
type AgentStep = {
  description: string;
  command: string;
  skipped?: boolean;
  reason?: string;
  result?: ShellResult;
};
type AgentRunRecord = {
  id: string;
  goal: string;
  status: "queued" | "planning" | "running" | "done" | "failed";
  plan: AgentStep[];
  summary: string;
  model: string;
  plannerMs: number;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  progress: { currentStep: number; totalSteps: number };
};

const EXAMPLES = [
  "Fetch the top 3 headlines from BBC RSS and save them to /tmp/headlines.txt",
  "Check Node version, ffmpeg version, and disk usage on /tmp",
  "Curl /api/providers/health on localhost and count which pools have providers available",
  "List files in the working directory sorted by size",
  "Print the git commit SHA if present",
];

export default function AgentClient() {
  const [goal, setGoal] = useState(EXAMPLES[0]);
  const [run, setRun] = useState<AgentRunRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPoll(), [stopPoll]);

  async function poll(runId: string) {
    try {
      const res = await fetch(`/api/admin/agent?runId=${encodeURIComponent(runId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as AgentRunRecord;
      setRun(data);
      if (data.status === "done" || data.status === "failed") stopPoll();
    } catch (err) {
      setError((err as Error).message);
      stopPoll();
    }
  }

  async function execute() {
    if (!goal.trim() || submitting) return;
    setSubmitting(true);
    setRun(null);
    setError(null);
    stopPoll();
    try {
      const res = await fetch("/api/admin/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal: goal.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const runId: string = data.runId;
      pollRef.current = setInterval(() => poll(runId), 2000);
      poll(runId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const statusLabel = (() => {
    if (!run) return null;
    if (run.status === "queued") return "Queued";
    if (run.status === "planning") return "Planning (LLM)";
    if (run.status === "running")
      return `Running step ${run.progress.currentStep + 1}/${run.progress.totalSteps}`;
    if (run.status === "done") return "Done";
    if (run.status === "failed") return "Failed";
    return run.status;
  })();

  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <label className="mb-2 block text-xs uppercase tracking-widest text-white/60">Goal</label>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          rows={3}
          disabled={submitting}
          className="w-full resize-y rounded-lg border border-white/10 bg-black/60 p-3 text-sm text-white focus:border-violet-400 focus:outline-none"
          placeholder="Describe the task in plain English…"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={execute}
            disabled={submitting || !goal.trim()}
            className="rounded-lg bg-gradient-to-r from-violet-400 to-fuchsia-400 px-4 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Queueing…" : "Execute"}
          </button>
          <span className="text-xs text-white/50">Examples:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setGoal(ex)}
              disabled={submitting}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 disabled:opacity-40"
            >
              {ex.slice(0, 48)}…
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="panel border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-200">
          {error}
        </div>
      )}

      {run && (
        <div className="space-y-4">
          <div className="panel p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest text-white/60">Status</div>
                <div className="mt-1 text-lg font-semibold text-white">{statusLabel}</div>
              </div>
              <div className="text-right text-[10px] uppercase tracking-widest text-white/40">
                <div>runId: <span className="text-emerald-300">{run.id.slice(0, 8)}</span></div>
                {run.model && <div>model: {run.model}</div>}
                {run.plannerMs > 0 && <div>planner: {run.plannerMs}ms</div>}
              </div>
            </div>
            {run.summary && (
              <p className="mt-3 text-sm text-white/80">{run.summary}</p>
            )}
            {run.error && (
              <pre className="mt-3 whitespace-pre-wrap break-words rounded bg-rose-500/10 p-3 text-xs text-rose-200">{run.error}</pre>
            )}
          </div>

          {run.plan.map((step, i) => (
            <div key={i} className="panel p-4">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <div className="text-sm font-semibold text-white">{i + 1}. {step.description}</div>
                {step.skipped ? (
                  <span className="text-[10px] uppercase tracking-widest text-rose-300">skipped</span>
                ) : step.result ? (
                  <span className="text-[10px] uppercase tracking-widest text-emerald-300">
                    exit={String(step.result.exitCode)} · {step.result.durationMs}ms
                  </span>
                ) : (
                  <span className="text-[10px] uppercase tracking-widest text-amber-300">running…</span>
                )}
              </div>
              <pre className="overflow-x-auto rounded bg-black/60 p-3 font-mono text-xs text-emerald-200">$ {step.command}</pre>
              {step.skipped && step.reason && (
                <p className="mt-2 text-xs text-rose-300">{step.reason}</p>
              )}
              {step.result?.stdout && (
                <pre className="mt-2 whitespace-pre-wrap break-words rounded bg-black/40 p-3 font-mono text-xs text-emerald-100">{step.result.stdout}</pre>
              )}
              {step.result?.stderr && (
                <pre className="mt-2 whitespace-pre-wrap break-words rounded bg-black/40 p-3 font-mono text-xs text-rose-300">{step.result.stderr}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
