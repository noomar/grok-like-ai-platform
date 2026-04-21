/**
 * Storage adapter contract. The in-memory Maps in `store.ts` remain the hot
 * path; an adapter subscribes to mutation events so state can be mirrored to
 * a durable backend (SQLite today, Postgres or object storage in the future).
 *
 * Design goals:
 * - Zero friction for existing callers: the `store` API does not change.
 * - Vercel-safe: if no adapter is configured, the app behaves exactly as
 *   before (pure in-memory, ephemeral across cold starts).
 * - Self-host-friendly: set `AURORA_STORAGE=sqlite` + a writable data dir
 *   and every write persists to a `.db` file. Restarts preserve state.
 */

import type { FactoryJob, UserRequest } from "../store";

export type StorageSnapshot = {
  jobs: FactoryJob[];
  userRequests: UserRequest[];
  verifications: number;
};

export type StorageAdapter = {
  kind: "memory" | "sqlite";
  /** Hydrate the in-memory maps from the durable store. Called once on
   *  startup. Returns null if nothing to load. */
  hydrate(): Promise<StorageSnapshot | null>;
  /** Persist a job (insert or upsert). */
  putJob(job: FactoryJob): Promise<void>;
  /** Persist a user request. */
  putRequest(req: UserRequest): Promise<void>;
  /** Bump the verifications counter. */
  incrementVerifications(): Promise<void>;
  /** Export the full state as a JSON-serialisable object. Used by the
   *  migration tool to package the Nest's data. */
  export(): Promise<StorageSnapshot>;
  /** Import a snapshot, overwriting existing state. */
  import(snapshot: StorageSnapshot): Promise<void>;
  /** Human-readable description (e.g. "sqlite:/data/aurora.db"). */
  describe(): string;
};
