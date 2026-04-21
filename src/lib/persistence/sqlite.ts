import type { FactoryJob, UserRequest } from "../store";
import type { StorageAdapter, StorageSnapshot } from "./types";

/**
 * SQLite adapter backed by `better-sqlite3`. Loaded dynamically so Vercel's
 * build doesn't require native compilation — if the module isn't installed,
 * this file throws at construct time and `storage/index.ts` falls back to
 * memory.
 *
 * Schema is three tables with JSON bodies: cheap to read, zero schema
 * migrations to maintain, and the migration tool can diff whole snapshots.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BetterSqlite3Db = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BetterSqlite3Stmt = any;

type SqliteModule = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (path: string, opts?: any): BetterSqlite3Db;
};

function resolveDbPath(): string {
  return process.env.AURORA_SQLITE_PATH ?? "/data/aurora.db";
}

async function loadSqliteModule(): Promise<SqliteModule> {
  // Dynamic import — errors are caught by the factory in `./index.ts`.
  const mod = (await import("better-sqlite3")) as unknown as SqliteModule & {
    default?: SqliteModule;
  };
  return (mod.default ?? mod) as SqliteModule;
}

export async function createSqliteAdapter(): Promise<StorageAdapter> {
  const Database = await loadSqliteModule();
  const path = resolveDbPath();
  const db: BetterSqlite3Db = Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      body TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      body TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests(created_at);
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const upsertJob: BetterSqlite3Stmt = db.prepare(
    "INSERT INTO jobs(id, created_at, updated_at, body) VALUES (?,?,?,?) " +
      "ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at, body=excluded.body",
  );
  const upsertRequest: BetterSqlite3Stmt = db.prepare(
    "INSERT INTO requests(id, created_at, body) VALUES (?,?,?) " +
      "ON CONFLICT(id) DO UPDATE SET body=excluded.body",
  );
  const selectJobs: BetterSqlite3Stmt = db.prepare(
    "SELECT body FROM jobs ORDER BY created_at DESC LIMIT 500",
  );
  const selectRequests: BetterSqlite3Stmt = db.prepare(
    "SELECT body FROM requests ORDER BY created_at DESC LIMIT 500",
  );
  const getMeta: BetterSqlite3Stmt = db.prepare("SELECT value FROM meta WHERE key=?");
  const setMeta: BetterSqlite3Stmt = db.prepare(
    "INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  );
  const clearAll: BetterSqlite3Stmt = db.transaction(() => {
    db.exec("DELETE FROM jobs; DELETE FROM requests; DELETE FROM meta;");
  });

  function readVerifications(): number {
    const row = getMeta.get("verifications") as { value?: string } | undefined;
    return row?.value ? parseInt(row.value, 10) || 0 : 0;
  }

  async function snapshot(): Promise<StorageSnapshot> {
    const jobs = (selectJobs.all() as Array<{ body: string }>).map(
      (r) => JSON.parse(r.body) as FactoryJob,
    );
    const userRequests = (selectRequests.all() as Array<{ body: string }>).map(
      (r) => JSON.parse(r.body) as UserRequest,
    );
    return { jobs, userRequests, verifications: readVerifications() };
  }

  const adapter: StorageAdapter = {
    kind: "sqlite",
    hydrate: snapshot,
    async putJob(job) {
      upsertJob.run(job.id, job.createdAt, job.updatedAt, JSON.stringify(job));
    },
    async putRequest(req) {
      upsertRequest.run(req.id, req.createdAt, JSON.stringify(req));
    },
    async incrementVerifications() {
      const current = readVerifications();
      setMeta.run("verifications", String(current + 1));
    },
    export: snapshot,
    async import(snap) {
      const tx = db.transaction((s: StorageSnapshot) => {
        clearAll();
        for (const j of s.jobs) {
          upsertJob.run(j.id, j.createdAt, j.updatedAt, JSON.stringify(j));
        }
        for (const r of s.userRequests) {
          upsertRequest.run(r.id, r.createdAt, JSON.stringify(r));
        }
        setMeta.run("verifications", String(s.verifications));
      });
      tx(snap);
    },
    describe() {
      return `sqlite:${path}`;
    },
  };
  return adapter;
}
