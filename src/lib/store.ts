/**
 * In-memory state with optional write-through persistence to a sovereign
 * adapter (see `storage/index.ts`). The Maps are the hot path; the adapter
 * (SQLite today) is the durable log. On cold start — whether on Vercel or a
 * self-hosted VM — `ensureHydrated()` rehydrates the Maps from the adapter
 * exactly once. Use `putJob` / `putRequest` / `incrementVerifications`
 * instead of touching the Maps directly so the adapter stays in sync.
 */

export type JobStatus = "queued" | "running" | "completed" | "failed";

export type JobStep = {
  id: string;
  label: string;
  status: JobStatus;
  startedAt?: string;
  finishedAt?: string;
  output?: string;
  error?: string;
};

export type FactoryJob = {
  id: string;
  title: string;
  script: string;
  voice: string;
  musicMood: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  steps: JobStep[];
  assets?: {
    audioUrl?: string;
    videoUrl?: string;
    thumbnailUrl?: string;
    downloadUrl?: string;
    sceneCount?: number;
    durationSec?: number;
    fileSizeBytes?: number;
    engineRenderId?: string;
  };
  requestedBy?: string;
  missingKeys?: string[];
  errorMessage?: string;
  engine?: "shotstack" | "ffmpeg" | "hf-space";
  engineRenderId?: string;
  engineStatus?: string;
  /** Health of each provider pool at submit time (best-effort snapshot). */
  providerTrace?: {
    images?: string;
    tts?: string;
    video?: string;
  };
};

export type UserRequest = {
  id: string;
  userLabel: string;
  kind: "verification" | "support" | "factory";
  message: string;
  createdAt: string;
  resolved: boolean;
};

type Store = {
  jobs: Map<string, FactoryJob>;
  userRequests: Map<string, UserRequest>;
  verifications: number;
};

declare global {
  var __aurora_store: Store | undefined;
}

function createStore(): Store {
  return {
    jobs: new Map(),
    userRequests: new Map(),
    verifications: 0,
  };
}

export function getStore(): Store {
  if (!globalThis.__aurora_store) {
    globalThis.__aurora_store = createStore();
  }
  return globalThis.__aurora_store;
}

export function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Persistence wrappers. Callers should prefer these over direct Map access
// so state stays mirrored to the configured storage adapter.
// ---------------------------------------------------------------------------

let hydratePromise: Promise<void> | null = null;

export function ensureHydrated(): Promise<void> {
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      const { getStorageAdapter } = await import("./persistence");
      const adapter = await getStorageAdapter();
      if (adapter.kind === "memory") return;
      const snap = await adapter.hydrate();
      if (!snap) return;
      const store = getStore();
      for (const j of snap.jobs) store.jobs.set(j.id, j);
      for (const r of snap.userRequests) store.userRequests.set(r.id, r);
      store.verifications = snap.verifications;
    } catch (err) {
      console.warn("[store] hydrate failed", err);
    }
  })();
  return hydratePromise;
}

export function putJob(job: FactoryJob): void {
  getStore().jobs.set(job.id, job);
  void import("./persistence").then(({ persistJob }) => persistJob(job));
}

export function putRequest(req: UserRequest): void {
  getStore().userRequests.set(req.id, req);
  void import("./persistence").then(({ persistRequest }) => persistRequest(req));
}

export function incrementVerifications(): void {
  getStore().verifications += 1;
  void import("./persistence").then(({ persistVerificationIncrement }) =>
    persistVerificationIncrement(),
  );
}
