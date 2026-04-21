import type { FactoryJob, UserRequest } from "../store";
import { createMemoryAdapter } from "./memory";
import type { StorageAdapter, StorageSnapshot } from "./types";

export type { StorageAdapter, StorageSnapshot };

let adapterPromise: Promise<StorageAdapter> | null = null;

/**
 * Returns the configured storage adapter (memoised). The choice is driven by
 * `AURORA_STORAGE`:
 *   - unset / "memory" — pure in-memory (default; what Vercel uses).
 *   - "sqlite"          — `better-sqlite3`-backed; path from AURORA_SQLITE_PATH.
 *
 * If SQLite is requested but `better-sqlite3` isn't installed (e.g. the
 * optional dep failed to build on a given host), we warn and fall back to
 * memory so the app still comes up.
 */
export function getStorageAdapter(): Promise<StorageAdapter> {
  if (adapterPromise) return adapterPromise;
  const kind = (process.env.AURORA_STORAGE ?? "memory").toLowerCase();
  adapterPromise = (async () => {
    if (kind === "sqlite") {
      try {
        const { createSqliteAdapter } = await import("./sqlite");
        return await createSqliteAdapter();
      } catch (err) {
        console.warn(
          `[storage] sqlite adapter unavailable (${
            err instanceof Error ? err.message : err
          }); falling back to memory`,
        );
        return createMemoryAdapter();
      }
    }
    return createMemoryAdapter();
  })();
  return adapterPromise;
}

/** Convenience wrappers so callers don't have to await the adapter promise
 *  each time. These are fire-and-forget: writes hit memory immediately
 *  (via `store.ts`) and are durably persisted in the background. */

export function persistJob(job: FactoryJob): void {
  void getStorageAdapter().then((a) => a.putJob(job).catch(logError));
}

export function persistRequest(req: UserRequest): void {
  void getStorageAdapter().then((a) => a.putRequest(req).catch(logError));
}

export function persistVerificationIncrement(): void {
  void getStorageAdapter().then((a) =>
    a.incrementVerifications().catch(logError),
  );
}

function logError(err: unknown) {
  console.warn("[storage] persistence error", err);
}
