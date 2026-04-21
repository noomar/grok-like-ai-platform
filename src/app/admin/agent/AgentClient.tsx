"use client";

import { useState } from "react";

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
type AgentRun = {
  goal: string;
  plan: AgentStep[];
  summary: string;
  model: string;
  plannerMs: number;
  startedAt: string;
  finishedAt: string;
};

const EXAMPLES = [
  "Fetch the top 3 headlines from BBC RSS and save them to /tmp/headlines.txt",
  "Check Node version, ffmpeg version, and disk usage on /tmp",
  "Curl the /api/providers/health endpoint on localhost and count which pools have at least one available provider",
  "List files in the current working directory sorted by size",
  "Print the current git commit SHA if present",
];

export default function AgentClient() {
  const [goal, setGoal] = useState(EXAMPLES[0]);
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function execute() {
    if (!goal.trim() || running) return;
    setRunning(true);
    setRun(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal: goal.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setRun(data as AgentRun);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <label className="mb-2 block text-xs uppercase tracking-widest text-white/60">Goal</label>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          rows={3}
          disabled={running}
          className="w-full resize-y rounded-lg border border-white/10 bg-black/60 p-3 text-sm text-white focus:border-violet-400 focus:outline-none"
          placeholder="Describe the task in plain English…"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={execute}
            disabled={running || !goal.trim()}
            className="rounded-lg bg-gradient-to-r from-violet-400 to-fuchsia-400 px-4 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? "Planning + running…" : "Execute"}
          </button>
          <span className="text-xs text-white/50">Examples:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setGoal(ex)}
              disabled={running}
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
            <div className="text-xs uppercase tracking-widest text-white/60">Planner summary</div>
            <p className="mt-2 text-sm text-white/90">{run.summary || "—"}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-[10px] uppercase tracking-widest text-white/40">
              <span>model: {run.model}</span>
              <span>planner: {run.plannerMs}ms</span>
              <span>steps: {run.plan.length}</span>
              <span>{run.startedAt} → {run.finishedAt}</span>
            </div>
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
                ) : null}
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
