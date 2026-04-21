import { createId, FactoryJob, getStore, JobStep } from "./store";

export type FactoryInput = {
  title: string;
  script: string;
  voice?: string;
  musicMood?: string;
  requestedBy?: string;
};

const DEFAULT_VOICE = "aria-neural";
const DEFAULT_MOOD = "cinematic-uplift";

function buildSteps(): JobStep[] {
  return [
    { id: createId("s"), label: "Script analysis", status: "queued" },
    { id: createId("s"), label: "TTS synthesis", status: "queued" },
    { id: createId("s"), label: "Scene assembly", status: "queued" },
    { id: createId("s"), label: "Music sync", status: "queued" },
    { id: createId("s"), label: "Final render", status: "queued" },
  ];
}

function countScenes(script: string): number {
  const byDouble = script.split(/\n\s*\n/).filter((s) => s.trim().length > 0).length;
  if (byDouble > 1) return byDouble;
  const bySentence = script.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0).length;
  return Math.max(1, Math.min(12, bySentence));
}

function estimateDurationSec(script: string): number {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  // ~150 wpm → 2.5 wps
  return Math.max(3, Math.round(words / 2.5));
}

function bpmForMood(mood: string): number {
  const map: Record<string, number> = {
    "cinematic-uplift": 112,
    "lofi-chill": 78,
    "trailer-epic": 140,
    "corporate-clean": 98,
    "dark-tension": 90,
    "pop-energetic": 124,
  };
  return map[mood] ?? 110;
}

export function enqueueJob(input: FactoryInput): FactoryJob {
  const store = getStore();
  const now = new Date().toISOString();
  const job: FactoryJob = {
    id: createId("job"),
    title: input.title.trim() || "Untitled production",
    script: input.script,
    voice: input.voice || DEFAULT_VOICE,
    musicMood: input.musicMood || DEFAULT_MOOD,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    steps: buildSteps(),
    requestedBy: input.requestedBy,
  };
  store.jobs.set(job.id, job);
  // Kick off async pipeline. Non-blocking for the request.
  void runPipeline(job.id);
  return job;
}

export function listJobs(): FactoryJob[] {
  return Array.from(getStore().jobs.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export function getJob(id: string): FactoryJob | undefined {
  return getStore().jobs.get(id);
}

export function cancelJob(id: string): boolean {
  const job = getStore().jobs.get(id);
  if (!job) return false;
  if (job.status === "completed" || job.status === "failed") return false;
  job.status = "failed";
  job.updatedAt = new Date().toISOString();
  for (const step of job.steps) {
    if (step.status === "queued" || step.status === "running") {
      step.status = "failed";
      step.finishedAt = job.updatedAt;
    }
  }
  return true;
}

async function runStep(step: JobStep, work: () => Promise<string>) {
  step.status = "running";
  step.startedAt = new Date().toISOString();
  try {
    step.output = await work();
    step.status = "completed";
  } catch (err) {
    step.status = "failed";
    step.output = err instanceof Error ? err.message : "unknown error";
  } finally {
    step.finishedAt = new Date().toISOString();
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPipeline(jobId: string) {
  const store = getStore();
  const job = store.jobs.get(jobId);
  if (!job) return;
  job.status = "running";
  job.updatedAt = new Date().toISOString();

  const scenes = countScenes(job.script);
  const durationSec = estimateDurationSec(job.script);
  const bpm = bpmForMood(job.musicMood);

  try {
    await runStep(job.steps[0], async () => {
      await delay(600);
      return `${scenes} scene${scenes === 1 ? "" : "s"} detected`;
    });
    if (job.status !== "running") return;

    await runStep(job.steps[1], async () => {
      await delay(900);
      return `${durationSec}s audio rendered (voice: ${job.voice})`;
    });
    if (job.status !== "running") return;

    await runStep(job.steps[2], async () => {
      await delay(1100);
      return `${scenes} scenes composed · 1080p`;
    });
    if (job.status !== "running") return;

    await runStep(job.steps[3], async () => {
      await delay(700);
      return `BPM ${bpm} matched (mood: ${job.musicMood})`;
    });
    if (job.status !== "running") return;

    await runStep(job.steps[4], async () => {
      await delay(1000);
      return `MP4 · ${durationSec}s · ${Math.round(durationSec * 1.3)} MB`;
    });

    job.assets = {
      audioUrl: `/assets/${job.id}/audio.mp3`,
      videoUrl: `/assets/${job.id}/video.mp4`,
      thumbnailUrl: `/assets/${job.id}/thumb.jpg`,
      sceneCount: scenes,
      durationSec,
    };
    job.status = job.steps.every((s) => s.status === "completed") ? "completed" : "failed";
  } catch {
    job.status = "failed";
  } finally {
    job.updatedAt = new Date().toISOString();
  }
}
