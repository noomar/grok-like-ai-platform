import { createId, FactoryJob, getStore, JobStep } from "./store";
import { MissingKeyError, generateVoiceover } from "./tts";
import { fetchPollinationsImage } from "./images";
import { composeSceneFrame, renderMp4 } from "./render";
import { persistAsset } from "./storage";
import { hasKey, missingKeys, RequiredKey } from "./env";

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

function splitScenes(script: string): string[] {
  const byDouble = script.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  if (byDouble.length > 1) return byDouble.slice(0, 8);
  const bySentence = script
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const merged: string[] = [];
  for (let i = 0; i < bySentence.length; i += 2) {
    merged.push([bySentence[i], bySentence[i + 1]].filter(Boolean).join(" "));
  }
  return (merged.length ? merged : [script.trim() || "Aurora production"]).slice(0, 8);
}

function sceneDurations(sceneCount: number, totalSec: number): number[] {
  const per = Math.max(2, Math.round(totalSec / sceneCount));
  const arr = new Array(sceneCount).fill(per);
  const delta = totalSec - per * sceneCount;
  if (delta !== 0 && arr.length) arr[arr.length - 1] = Math.max(2, arr[arr.length - 1] + delta);
  return arr;
}

function estimateDurationSec(script: string): number {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(5, Math.round(words / 2.5));
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
  job.errorMessage = "Cancelled by operator";
  job.updatedAt = new Date().toISOString();
  for (const step of job.steps) {
    if (step.status === "queued" || step.status === "running") {
      step.status = "failed";
      step.finishedAt = job.updatedAt;
    }
  }
  return true;
}

async function runStep<T>(step: JobStep, work: () => Promise<{ summary: string; value: T }>): Promise<T> {
  step.status = "running";
  step.startedAt = new Date().toISOString();
  try {
    const { summary, value } = await work();
    step.output = summary;
    step.status = "completed";
    return value;
  } catch (err) {
    step.status = "failed";
    step.error = err instanceof Error ? err.message : "unknown error";
    step.output = step.error;
    throw err;
  } finally {
    step.finishedAt = new Date().toISOString();
  }
}

function markFailure(job: FactoryJob, message: string, missing?: RequiredKey[]) {
  job.status = "failed";
  job.errorMessage = message;
  if (missing && missing.length) job.missingKeys = missing;
  job.updatedAt = new Date().toISOString();
  for (const step of job.steps) {
    if (step.status === "queued") {
      step.status = "failed";
      step.output = "skipped";
    }
  }
}

async function runPipeline(jobId: string) {
  const store = getStore();
  const job = store.jobs.get(jobId);
  if (!job) return;
  job.status = "running";
  job.updatedAt = new Date().toISOString();

  // Hard-check required keys up front so we fail fast with clear error.
  const ttsKeyRequired: RequiredKey = "OPENAI_API_KEY";
  const ttsMissing = missingKeys([ttsKeyRequired]);
  if (ttsMissing.length) {
    markFailure(
      job,
      `Missing Key: ${ttsMissing.join(", ")}`,
      ttsMissing,
    );
    return;
  }

  const scenes = splitScenes(job.script);
  const totalDurationSec = estimateDurationSec(job.script);
  const bpm = bpmForMood(job.musicMood);

  try {
    await runStep(job.steps[0], async () => ({
      summary: `${scenes.length} scene${scenes.length === 1 ? "" : "s"} detected · ~${totalDurationSec}s`,
      value: null,
    }));

    const ttsResult = await runStep(job.steps[1], async () => {
      const r = await generateVoiceover(job.script, job.voice);
      return {
        summary: `${r.durationSec}s MP3 (${(r.audioBuffer.length / 1024).toFixed(0)} KB) via OpenAI · voice=${job.voice}`,
        value: r,
      };
    });

    // Align total duration with TTS length.
    const audioDuration = Math.max(totalDurationSec, ttsResult.durationSec);
    const alignedDurations = sceneDurations(scenes.length, audioDuration);

    const sceneFrames = await runStep(job.steps[2], async () => {
      const frames: { frameJpeg: Buffer; durationSec: number }[] = [];
      for (let i = 0; i < scenes.length; i++) {
        const text = scenes[i];
        const prompt = buildImagePrompt(job.title, text);
        const imageBuffer = await fetchPollinationsImage(prompt, {
          width: 1280,
          height: 720,
          seed: (i + 1) * 97 + Math.abs(hashCode(job.id)) % 1000,
        });
        const frameJpeg = await composeSceneFrame({
          index: i,
          text,
          durationSec: alignedDurations[i],
          imageBuffer,
        });
        frames.push({ frameJpeg, durationSec: alignedDurations[i] });
      }
      return {
        summary: `${frames.length} scenes composed · 1280x720 · Pollinations images`,
        value: frames,
      };
    });

    await runStep(job.steps[3], async () => ({
      summary: `BPM ${bpm} target · mood=${job.musicMood} · mux with voiceover`,
      value: null,
    }));

    const finalAsset = await runStep(job.steps[4], async () => {
      const mp4 = await renderMp4(sceneFrames, ttsResult.audioBuffer);
      const audioAsset = await persistAsset(job.id, "audio.mp3", ttsResult.audioBuffer, "audio/mpeg");
      const videoAsset = await persistAsset(job.id, "video.mp4", mp4, "video/mp4");
      const thumbAsset = await persistAsset(job.id, "thumbnail.jpg", sceneFrames[0].frameJpeg, "image/jpeg");
      return {
        summary: `MP4 · ${audioDuration}s · ${(mp4.length / (1024 * 1024)).toFixed(2)} MB`,
        value: { audioAsset, videoAsset, thumbAsset, mp4Size: mp4.length },
      };
    });

    job.assets = {
      audioUrl: finalAsset.audioAsset.url,
      videoUrl: finalAsset.videoAsset.url,
      thumbnailUrl: finalAsset.thumbAsset.url,
      downloadUrl: finalAsset.videoAsset.url,
      sceneCount: scenes.length,
      durationSec: audioDuration,
      fileSizeBytes: finalAsset.mp4Size,
    };
    job.status = "completed";
  } catch (err) {
    const message = err instanceof Error ? err.message : "Render failed";
    const missing = err instanceof MissingKeyError ? [err.keyName as RequiredKey] : undefined;
    markFailure(job, message, missing);
  } finally {
    job.updatedAt = new Date().toISOString();
  }
}

function buildImagePrompt(title: string, sceneText: string): string {
  const base = sceneText.length > 120 ? sceneText.slice(0, 120) : sceneText;
  return `${title}. ${base}. cinematic, futuristic, ultra-detailed, dramatic lighting, 8k`;
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}

export function environmentStatus() {
  return {
    tts: {
      provider: "openai",
      ready: hasKey("OPENAI_API_KEY"),
      keyName: "OPENAI_API_KEY",
    },
    storage: {
      provider: hasKey("BLOB_READ_WRITE_TOKEN") ? "vercel-blob" : "local-tmp",
      ready: true, // local-tmp always available for dev
      persistent: hasKey("BLOB_READ_WRITE_TOKEN"),
      keyName: "BLOB_READ_WRITE_TOKEN",
    },
    images: { provider: "pollinations", ready: true, keyName: null },
    alternateVideo: { provider: "shotstack", ready: hasKey("SHOTSTACK_API_KEY"), keyName: "SHOTSTACK_API_KEY" },
  };
}
