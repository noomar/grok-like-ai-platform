// In-memory store for demo purposes. In production replace with a database.

export type JobStatus = "queued" | "running" | "completed" | "failed";

export type JobStep = {
  id: string;
  label: string;
  status: JobStatus;
  startedAt?: string;
  finishedAt?: string;
  output?: string;
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
    sceneCount?: number;
    durationSec?: number;
  };
  requestedBy?: string;
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
    seed(globalThis.__aurora_store);
  }
  return globalThis.__aurora_store;
}

function seed(store: Store) {
  const now = new Date().toISOString();
  const job: FactoryJob = {
    id: "job_demo_001",
    title: "Product teaser — launch v1",
    script:
      "Introducing Aurora — the AI production factory. Generate voice, scenes, and music in one pipeline.",
    voice: "aria-neural",
    musicMood: "cinematic-uplift",
    status: "completed",
    createdAt: now,
    updatedAt: now,
    steps: [
      { id: "s1", label: "Script analysis", status: "completed", output: "4 scenes detected" },
      { id: "s2", label: "TTS synthesis", status: "completed", output: "14.2s audio rendered" },
      { id: "s3", label: "Scene assembly", status: "completed", output: "4 scenes · 1080p" },
      { id: "s4", label: "Music sync", status: "completed", output: "BPM 112 matched to cuts" },
      { id: "s5", label: "Final render", status: "completed", output: "MP4 · 18.4 MB" },
    ],
    assets: {
      audioUrl: "/assets/demo/audio.mp3",
      videoUrl: "/assets/demo/video.mp4",
      thumbnailUrl: "/assets/demo/thumb.jpg",
      sceneCount: 4,
      durationSec: 14,
    },
    requestedBy: "demo@user",
  };
  store.jobs.set(job.id, job);

  const req: UserRequest = {
    id: "req_demo_001",
    userLabel: "guest · 996500904998",
    kind: "verification",
    message: "WhatsApp verification requested",
    createdAt: now,
    resolved: false,
  };
  store.userRequests.set(req.id, req);
}

export function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}
