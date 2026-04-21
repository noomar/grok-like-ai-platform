// In-memory store for demo purposes. In production replace with a database.

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
