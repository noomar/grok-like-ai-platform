import { randomUUID } from "node:crypto";
import type { AgentStep } from "./agent";

export type AgentRunStatus = "queued" | "planning" | "running" | "done" | "failed";

export type AgentRunRecord = {
  id: string;
  goal: string;
  status: AgentRunStatus;
  plan: AgentStep[];
  summary: string;
  model: string;
  plannerMs: number;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  progress: {
    currentStep: number;
    totalSteps: number;
  };
};

type Store = Map<string, AgentRunRecord>;

function getStore(): Store {
  const g = globalThis as unknown as { __auroraAgentRuns?: Store };
  if (!g.__auroraAgentRuns) g.__auroraAgentRuns = new Map();
  return g.__auroraAgentRuns;
}

export function createRun(goal: string): AgentRunRecord {
  const run: AgentRunRecord = {
    id: randomUUID(),
    goal,
    status: "queued",
    plan: [],
    summary: "",
    model: "",
    plannerMs: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    progress: { currentStep: 0, totalSteps: 0 },
  };
  getStore().set(run.id, run);
  return run;
}

export function getRun(id: string): AgentRunRecord | null {
  return getStore().get(id) ?? null;
}

export function updateRun(
  id: string,
  patch: Partial<AgentRunRecord>,
): AgentRunRecord | null {
  const store = getStore();
  const current = store.get(id);
  if (!current) return null;
  const next = { ...current, ...patch };
  store.set(id, next);
  return next;
}

export function listRuns(limit = 20): AgentRunRecord[] {
  return Array.from(getStore().values())
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
    .slice(0, limit);
}

/**
 * Prune records older than 6h to keep memory bounded on long-running hosts.
 */
export function pruneOld(maxAgeMs = 6 * 60 * 60 * 1000): number {
  const cutoff = Date.now() - maxAgeMs;
  const store = getStore();
  let removed = 0;
  for (const [id, run] of store) {
    if (Date.parse(run.startedAt) < cutoff) {
      store.delete(id);
      removed += 1;
    }
  }
  return removed;
}
