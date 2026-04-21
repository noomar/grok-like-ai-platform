import { createId, FactoryJob, getStore, JobStep } from "./store";
import { MissingKeyError, generateVoiceover } from "./tts";
import { fetchPollinationsImage } from "./images";
import { composeSceneFrame, renderMp4 } from "./render";
import { persistAsset } from "./storage";
import { hasKey, missingKeys, RequiredKey } from "./env";
import {
  createShotstackRender,
  pollShotstackRender,
  pollinationsImageUrl,
} from "./shotstack";

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

/**
 * Submit a job synchronously to Shotstack and return the initial FactoryJob
 * with `engineRenderId` populated. The client is responsible for polling
 * `/api/factory/status?renderId=...` to track completion. This avoids relying
 * on any server-side state — important on serverless (Vercel Hobby) where the
 * in-memory store does not survive between invocations and async work started
 * by `enqueueJob` is killed when the function returns.
 */
export async function submitShotstackJob(input: FactoryInput): Promise<FactoryJob> {
  if (!hasKey("SHOTSTACK_API_KEY")) {
    throw new MissingKeyError("SHOTSTACK_API_KEY");
  }
  const now = new Date().toISOString();
  const id = createId("job");
  const title = input.title.trim() || "Untitled production";
  const script = input.script;
  const sceneTexts = splitScenes(script);
  const totalDurationSec = estimateDurationSec(script);
  const alignedDurations = sceneDurations(sceneTexts.length, totalDurationSec);
  const steps = buildSteps();
  const markDone = (idx: number, summary: string) => {
    steps[idx].status = "completed";
    steps[idx].startedAt = now;
    steps[idx].finishedAt = now;
    steps[idx].output = summary;
  };

  markDone(
    0,
    `${sceneTexts.length} scene${sceneTexts.length === 1 ? "" : "s"} detected · ~${totalDurationSec}s · engine=shotstack`,
  );
  markDone(1, `skipped (no OPENAI_API_KEY · Shotstack silent render)`);

  const scenes = sceneTexts.map((text, i) => ({
    imageUrl: pollinationsImageUrl(
      buildImagePrompt(title, text),
      (i + 1) * 97 + (Math.abs(hashCode(id)) % 1000),
    ),
    text,
    durationSec: alignedDurations[i],
  }));
  markDone(2, `${scenes.length} scenes prepared · Pollinations image URLs · Shotstack timeline`);
  markDone(3, `mood=${input.musicMood ?? DEFAULT_MOOD} · silent (no public audio URL)`);

  const renderId = await createShotstackRender(scenes, null);
  steps[4].status = "running";
  steps[4].startedAt = now;
  steps[4].output = `submitted to Shotstack · id=${renderId}`;

  return {
    id,
    title,
    script,
    voice: input.voice || DEFAULT_VOICE,
    musicMood: input.musicMood || DEFAULT_MOOD,
    status: "running",
    createdAt: now,
    updatedAt: now,
    steps,
    requestedBy: input.requestedBy,
    engine: "shotstack",
    engineRenderId: renderId,
    engineStatus: "queued",
    assets: {
      thumbnailUrl: scenes[0]?.imageUrl,
      sceneCount: scenes.length,
      durationSec: totalDurationSec,
      engineRenderId: renderId,
    },
  };
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

function pickEngine(): "shotstack" | "ffmpeg" {
  if (hasKey("SHOTSTACK_API_KEY")) return "shotstack";
  return "ffmpeg";
}

async function runPipeline(jobId: string) {
  const store = getStore();
  const job = store.jobs.get(jobId);
  if (!job) return;
  job.status = "running";
  job.updatedAt = new Date().toISOString();

  const engine = pickEngine();
  job.engine = engine;

  // Validate required keys per engine up front.
  // Shotstack can render with just images+text; OpenAI TTS is optional for voiceover.
  // ffmpeg path needs OpenAI TTS to produce the audio track.
  if (engine === "ffmpeg") {
    const ttsMissing = missingKeys(["OPENAI_API_KEY" as RequiredKey]);
    if (ttsMissing.length) {
      markFailure(
        job,
        `Missing Key: ${ttsMissing.join(", ")} (or set SHOTSTACK_API_KEY to use the hosted renderer)`,
        ttsMissing,
      );
      return;
    }
  }

  const scenes = splitScenes(job.script);
  const totalDurationSec = estimateDurationSec(job.script);
  const bpm = bpmForMood(job.musicMood);

  try {
    await runStep(job.steps[0], async () => ({
      summary: `${scenes.length} scene${scenes.length === 1 ? "" : "s"} detected · ~${totalDurationSec}s · engine=${engine}`,
      value: null,
    }));

    // TTS is optional when Shotstack engine is used.
    const ttsResult = await runStep(job.steps[1], async () => {
      if (engine === "shotstack" && !hasKey("OPENAI_API_KEY")) {
        return {
          summary: `skipped (no OPENAI_API_KEY · Shotstack silent render)`,
          value: null as null | { audioBuffer: Buffer; durationSec: number },
        };
      }
      const r = await generateVoiceover(job.script, job.voice);
      return {
        summary: `${r.durationSec}s MP3 (${(r.audioBuffer.length / 1024).toFixed(0)} KB) via OpenAI · voice=${job.voice}`,
        value: r as null | { audioBuffer: Buffer; durationSec: number },
      };
    });

    const audioDuration = Math.max(totalDurationSec, ttsResult?.durationSec ?? 0);
    const alignedDurations = sceneDurations(scenes.length, audioDuration);

    if (engine === "shotstack") {
      await runPipelineShotstack(job, scenes, alignedDurations, audioDuration, ttsResult, bpm);
    } else {
      await runPipelineFfmpeg(job, scenes, alignedDurations, audioDuration, ttsResult!, bpm);
    }
    job.status = "completed";
  } catch (err) {
    const message = err instanceof Error ? err.message : "Render failed";
    const missing = err instanceof MissingKeyError ? [err.keyName as RequiredKey] : undefined;
    markFailure(job, message, missing);
  } finally {
    job.updatedAt = new Date().toISOString();
  }
}

async function runPipelineFfmpeg(
  job: FactoryJob,
  scenes: string[],
  alignedDurations: number[],
  audioDuration: number,
  ttsResult: { audioBuffer: Buffer; durationSec: number },
  bpm: number,
) {
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
      summary: `MP4 · ${audioDuration}s · ${(mp4.length / (1024 * 1024)).toFixed(2)} MB · ffmpeg local`,
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
}

async function runPipelineShotstack(
  job: FactoryJob,
  scenes: string[],
  alignedDurations: number[],
  audioDuration: number,
  ttsResult: { audioBuffer: Buffer; durationSec: number } | null,
  bpm: number,
) {
  const sceneData = await runStep(job.steps[2], async () => {
    const shotScenes = scenes.map((text, i) => ({
      imageUrl: pollinationsImageUrl(buildImagePrompt(job.title, text), (i + 1) * 97 + (Math.abs(hashCode(job.id)) % 1000)),
      text,
      durationSec: alignedDurations[i],
    }));
    return {
      summary: `${shotScenes.length} scenes prepared · Pollinations image URLs · Shotstack timeline`,
      value: shotScenes,
    };
  });

  // Audio upload (when TTS present) — need a public URL for Shotstack to fetch.
  let audioAssetUrl: string | null = null;
  let audioStoredUrl: string | null = null;
  if (ttsResult) {
    const audioAsset = await persistAsset(job.id, "audio.mp3", ttsResult.audioBuffer, "audio/mpeg");
    audioStoredUrl = audioAsset.url;
    // Shotstack needs an absolute, publicly-reachable URL. Local /tmp URLs won't work.
    audioAssetUrl = audioAsset.kind === "blob" ? audioAsset.url : null;
  }

  await runStep(job.steps[3], async () => ({
    summary: `BPM ${bpm} target · mood=${job.musicMood}${
      audioAssetUrl ? " · voiceover mux via Shotstack" : " · silent (no public audio URL)"
    }`,
    value: null,
  }));

  const finalAsset = await runStep(job.steps[4], async () => {
    const renderId = await createShotstackRender(sceneData, audioAssetUrl);
    job.engineRenderId = renderId;
    job.updatedAt = new Date().toISOString();
    const mp4Url = await pollShotstackRender(renderId, {
      onTick: (s) => {
        job.engineStatus = s.status;
        job.updatedAt = new Date().toISOString();
      },
    });
    return {
      summary: `MP4 · ${audioDuration}s · hosted on Shotstack CDN · id=${renderId}`,
      value: { mp4Url, renderId },
    };
  });

  job.assets = {
    audioUrl: audioStoredUrl ?? undefined,
    videoUrl: finalAsset.mp4Url,
    thumbnailUrl: sceneData[0]?.imageUrl,
    downloadUrl: finalAsset.mp4Url,
    sceneCount: scenes.length,
    durationSec: audioDuration,
    engineRenderId: finalAsset.renderId,
  };
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
  const shotstackReady = hasKey("SHOTSTACK_API_KEY");
  const openaiReady = hasKey("OPENAI_API_KEY");
  const primaryEngine: "shotstack" | "ffmpeg" = shotstackReady ? "shotstack" : "ffmpeg";
  // Pipeline is "ready" if either engine has its required keys.
  // - shotstack: only needs SHOTSTACK_API_KEY (audio is optional)
  // - ffmpeg: needs OPENAI_API_KEY for the voiceover
  const pipelineReady = shotstackReady || openaiReady;
  return {
    pipelineReady,
    primaryEngine,
    tts: {
      provider: "openai",
      ready: openaiReady,
      keyName: "OPENAI_API_KEY",
      required: primaryEngine === "ffmpeg",
    },
    video: {
      provider: primaryEngine,
      ready: primaryEngine === "shotstack" ? shotstackReady : openaiReady,
      keyName: primaryEngine === "shotstack" ? "SHOTSTACK_API_KEY" : "OPENAI_API_KEY",
    },
    shotstack: { provider: "shotstack", ready: shotstackReady, keyName: "SHOTSTACK_API_KEY" },
    storage: {
      provider: hasKey("BLOB_READ_WRITE_TOKEN") ? "vercel-blob" : "local-tmp",
      ready: true,
      persistent: hasKey("BLOB_READ_WRITE_TOKEN"),
      keyName: "BLOB_READ_WRITE_TOKEN",
    },
    images: { provider: "pollinations", ready: true, keyName: null },
  };
}
