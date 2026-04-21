import { execShell, type ShellResult } from "./shell-exec";

/**
 * Plain-text plan-and-execute agent.
 *
 *   1. LLM call (keyless via text.pollinations.ai) decomposes a goal into an
 *      ordered list of shell commands, each with a one-line description.
 *   2. Each step is executed. Output is captured.
 *   3. Full transcript is returned so the operator can audit every command.
 *
 * Hard limits:
 *   - Max 8 steps per task.
 *   - Each command capped at 25s / 64kB output.
 *   - Destructive patterns (rm -rf /, shutdown, mkfs, dd of=/dev/…) are
 *     rejected before execution. Admin already has a raw shell at
 *     /admin/terminal; this is for orchestrated automation, not ops.
 */

export type AgentStep = {
  description: string;
  command: string;
  skipped?: boolean;
  reason?: string;
  result?: ShellResult;
};

export type AgentRun = {
  goal: string;
  plan: AgentStep[];
  summary: string;
  model: string;
  plannerMs: number;
  startedAt: string;
  finishedAt: string;
};

const POLLINATIONS_URL = "https://text.pollinations.ai/openai";

const SYSTEM_PROMPT = `You are Aurora Agent, a pragmatic Linux-shell planner running on a Next.js host.
Given a high-level goal, produce a JSON plan of at most 8 shell steps.
You have: node, npm, curl, sh, git, python3, ffmpeg. /tmp is writable. You have no sudo, no package manager, no root.
Return ONLY compact JSON of the form:
{"plan":[{"description":"…","command":"…"}, …], "summary":"one-line outcome expectation"}
Rules:
- Each "command" must be a single-line POSIX shell command.
- Prefer curl over pip/apt. Do not run interactive commands.
- Never output destructive commands (rm -rf /, mkfs, dd of=/dev/*, shutdown).
- If the goal is impossible in this sandbox, return a plan of 1 step that echoes a clear explanation.`;

const FORBIDDEN = [
  /\brm\s+-rf\s+\/(\s|$)/,
  /\brm\s+-rf\s+\/[^t]/, // allow /tmp/...
  /\bmkfs\b/,
  /\bdd\s+if=.*\bof=\/dev\//,
  /\bshutdown\b/,
  /\breboot\b/,
  /\bsudo\b/,
  /:\(\)\s*{\s*:\|\s*:/, // fork bomb
];

function isForbidden(cmd: string): string | null {
  for (const re of FORBIDDEN) {
    if (re.test(cmd)) return `blocked by policy: ${re.source}`;
  }
  return null;
}

export async function planGoal(goal: string): Promise<{ plan: AgentStep[]; summary: string; model: string; plannerMs: number; }> {
  const start = Date.now();
  const body = {
    model: "openai",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: goal },
    ],
    response_format: { type: "json_object" },
  };
  const res = await fetch(POLLINATIONS_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`planner HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  // Pollinations returns OpenAI-compatible shape.
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    model?: string;
  };
  const raw = data.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson(raw);
  if (!parsed || !Array.isArray(parsed.plan)) {
    throw new Error(`planner returned unparseable JSON: ${raw.slice(0, 300)}`);
  }
  const plan: AgentStep[] = parsed.plan
    .slice(0, 8)
    .map((s: { description?: string; command?: string }) => ({
      description: String(s.description ?? "").slice(0, 240),
      command: String(s.command ?? "").slice(0, 2000),
    }))
    .filter((s: AgentStep) => s.command.length > 0);
  return {
    plan,
    summary: String(parsed.summary ?? "").slice(0, 400),
    model: data.model ?? "pollinations:openai",
    plannerMs: Date.now() - start,
  };
}

function extractJson(raw: string): { plan?: unknown; summary?: unknown } | null {
  try {
    return JSON.parse(raw);
  } catch {
    // Models sometimes wrap JSON in ```json fences; pull the first { … } block.
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function runAgent(goal: string): Promise<AgentRun> {
  const startedAt = new Date().toISOString();
  const { plan, summary, model, plannerMs } = await planGoal(goal);
  const executed: AgentStep[] = [];
  for (const step of plan) {
    const reason = isForbidden(step.command);
    if (reason) {
      executed.push({ ...step, skipped: true, reason });
      continue;
    }
    const result = await execShell(step.command, {
      timeoutMs: 25_000,
      maxOutput: 16 * 1024,
    });
    executed.push({ ...step, result });
  }
  return {
    goal,
    plan: executed,
    summary,
    model,
    plannerMs,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

export type AgentProgress = {
  onPlan?: (info: { plan: AgentStep[]; summary: string; model: string; plannerMs: number }) => void;
  onStepStart?: (index: number, step: AgentStep) => void;
  onStepDone?: (index: number, step: AgentStep) => void;
};

/**
 * Streaming variant. Same behavior as runAgent but emits progress callbacks
 * after the plan is produced and after each step executes. Suitable for
 * backing an async job queue.
 */
export async function runAgentStreaming(
  goal: string,
  progress: AgentProgress,
): Promise<AgentRun> {
  const startedAt = new Date().toISOString();
  const { plan, summary, model, plannerMs } = await planGoal(goal);
  progress.onPlan?.({ plan, summary, model, plannerMs });
  const executed: AgentStep[] = [];
  for (let i = 0; i < plan.length; i += 1) {
    const step = plan[i];
    progress.onStepStart?.(i, step);
    const reason = isForbidden(step.command);
    let finished: AgentStep;
    if (reason) {
      finished = { ...step, skipped: true, reason };
    } else {
      const result = await execShell(step.command, {
        timeoutMs: 25_000,
        maxOutput: 16 * 1024,
      });
      finished = { ...step, result };
    }
    executed.push(finished);
    progress.onStepDone?.(i, finished);
  }
  return {
    goal,
    plan: executed,
    summary,
    model,
    plannerMs,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}
