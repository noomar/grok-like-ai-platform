/**
 * Provider / Pool core. Each pool races / falls back across N providers
 * ordered by priority and health score. Providers are stateless objects;
 * health state lives in the in-memory `poolState` map keyed by pool+provider.
 *
 * This module is deliberately pure TypeScript (no Next imports) so providers
 * can be unit-tested and reused from worker scripts.
 */

export type ProviderResult<T> = {
  ok: true;
  value: T;
  provider: string;
  latencyMs: number;
};

export type ProviderError = {
  ok: false;
  provider: string;
  error: string;
  latencyMs: number;
};

export interface Provider<I, O> {
  readonly name: string;
  /** Higher = tried first (before health adjustments). */
  readonly priority: number;
  /** Default per-provider timeout in ms. */
  readonly timeoutMs?: number;
  /** Returns whether this provider is available in the current env. */
  available(): boolean;
  /** Light ping used by /providers/health; should not consume quota. */
  ping?(): Promise<boolean>;
  execute(input: I, signal: AbortSignal): Promise<O>;
}

type Health = {
  lastOkAt?: number;
  lastFailAt?: number;
  lastError?: string;
  successes: number;
  failures: number;
  avgLatencyMs: number;
  /** epoch ms — provider is skipped until this time. */
  cooldownUntil: number;
};

const pools = new Map<string, Map<string, Health>>();

function getHealth(poolName: string, providerName: string): Health {
  let pool = pools.get(poolName);
  if (!pool) {
    pool = new Map();
    pools.set(poolName, pool);
  }
  let h = pool.get(providerName);
  if (!h) {
    h = { successes: 0, failures: 0, avgLatencyMs: 0, cooldownUntil: 0 };
    pool.set(providerName, h);
  }
  return h;
}

function recordSuccess(poolName: string, name: string, latencyMs: number) {
  const h = getHealth(poolName, name);
  h.lastOkAt = Date.now();
  h.successes += 1;
  h.avgLatencyMs = h.avgLatencyMs
    ? Math.round(h.avgLatencyMs * 0.7 + latencyMs * 0.3)
    : latencyMs;
  h.cooldownUntil = 0;
}

function recordFailure(poolName: string, name: string, err: string) {
  const h = getHealth(poolName, name);
  h.lastFailAt = Date.now();
  h.failures += 1;
  h.lastError = err.slice(0, 200);
  // Exponential-ish cooldown: 15s after 1 failure, 60s after repeated failures.
  const recentFailures = h.successes === 0 ? h.failures : 1;
  h.cooldownUntil = Date.now() + Math.min(60_000, 15_000 * recentFailures);
}

export function getPoolSnapshot(): Record<
  string,
  Record<string, Health & { available?: boolean }>
> {
  const out: Record<string, Record<string, Health & { available?: boolean }>> = {};
  for (const [poolName, members] of pools.entries()) {
    out[poolName] = {};
    for (const [name, h] of members.entries()) {
      out[poolName][name] = { ...h };
    }
  }
  return out;
}

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortController {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(new Error(`timeout after ${ms}ms`)), ms);
  const done = () => clearTimeout(t);
  if (signal) {
    if (signal.aborted) c.abort(signal.reason);
    else signal.addEventListener("abort", () => c.abort(signal.reason), { once: true });
  }
  c.signal.addEventListener("abort", done, { once: true });
  return c;
}

function sortProviders<I, O>(poolName: string, providers: Provider<I, O>[]): Provider<I, O>[] {
  const now = Date.now();
  return [...providers]
    .filter((p) => p.available())
    .sort((a, b) => {
      const ha = getHealth(poolName, a.name);
      const hb = getHealth(poolName, b.name);
      const aPenalty = ha.cooldownUntil > now ? 1_000_000 : 0;
      const bPenalty = hb.cooldownUntil > now ? 1_000_000 : 0;
      return b.priority - a.priority + aPenalty - bPenalty;
    });
}

/**
 * Execute providers sequentially in priority order, returning the first
 * success. Providers in cooldown are deprioritised but still attempted if
 * every non-cooldown provider fails.
 */
export async function executeSequential<I, O>(
  poolName: string,
  providers: Provider<I, O>[],
  input: I,
  parentSignal?: AbortSignal,
): Promise<ProviderResult<O>> {
  const sorted = sortProviders(poolName, providers);
  if (sorted.length === 0) {
    throw new Error(`[${poolName}] no providers available`);
  }
  const errors: ProviderError[] = [];
  for (const p of sorted) {
    const controller = withTimeout(parentSignal, p.timeoutMs ?? 120_000);
    const start = Date.now();
    try {
      const value = await p.execute(input, controller.signal);
      const latencyMs = Date.now() - start;
      recordSuccess(poolName, p.name, latencyMs);
      return { ok: true, value, provider: p.name, latencyMs };
    } catch (err) {
      const latencyMs = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      recordFailure(poolName, p.name, message);
      errors.push({ ok: false, provider: p.name, error: message, latencyMs });
    } finally {
      controller.abort();
    }
  }
  const summary = errors
    .map((e) => `${e.provider}: ${e.error} (${e.latencyMs}ms)`)
    .join(" | ");
  throw new Error(`[${poolName}] all providers failed — ${summary}`);
}

/**
 * Fire the top `concurrency` providers in parallel; resolve as soon as any
 * returns. Cancels the losing requests.
 */
export async function executeRace<I, O>(
  poolName: string,
  providers: Provider<I, O>[],
  input: I,
  opts: { concurrency?: number; parentSignal?: AbortSignal } = {},
): Promise<ProviderResult<O>> {
  const { concurrency = 2, parentSignal } = opts;
  const sorted = sortProviders(poolName, providers);
  if (sorted.length === 0) {
    throw new Error(`[${poolName}] no providers available`);
  }
  const head = sorted.slice(0, Math.max(1, concurrency));
  const tail = sorted.slice(head.length);
  const losers: AbortController[] = [];

  try {
    const winner = await new Promise<ProviderResult<O>>((resolve, reject) => {
      let remaining = head.length;
      const errors: ProviderError[] = [];
      for (const p of head) {
        const controller = withTimeout(parentSignal, p.timeoutMs ?? 120_000);
        losers.push(controller);
        const start = Date.now();
        p.execute(input, controller.signal)
          .then((value) => {
            const latencyMs = Date.now() - start;
            recordSuccess(poolName, p.name, latencyMs);
            resolve({ ok: true, value, provider: p.name, latencyMs });
          })
          .catch((err: unknown) => {
            const latencyMs = Date.now() - start;
            const message = err instanceof Error ? err.message : String(err);
            recordFailure(poolName, p.name, message);
            errors.push({ ok: false, provider: p.name, error: message, latencyMs });
            remaining -= 1;
            if (remaining === 0) {
              reject(
                new Error(
                  `[${poolName}] head providers failed — ${errors
                    .map((e) => `${e.provider}: ${e.error}`)
                    .join(" | ")}`,
                ),
              );
            }
          });
      }
    });
    return winner;
  } catch (headErr) {
    // Fall back to sequential across the tail.
    if (tail.length === 0) throw headErr;
    return executeSequential(poolName, tail, input, parentSignal);
  } finally {
    for (const c of losers) c.abort();
  }
}
