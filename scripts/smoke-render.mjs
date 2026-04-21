// Smoke test for the render pipeline — no OPENAI_API_KEY required.
// Produces a real MP4 at /tmp/aurora-smoke/video.mp4 using Pollinations + ffmpeg + sharp.
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const { fetchPollinationsImage } = await import("../src/lib/images.ts");
const { composeSceneFrame, renderMp4 } = await import("../src/lib/render.ts");

async function main() {
  const outDir = path.join(os.tmpdir(), "aurora-smoke");
  await fs.mkdir(outDir, { recursive: true });
  console.log(`[smoke] output dir: ${outDir}`);

  const scenes = [
    { text: "Aurora — AI production factory online.", prompt: "futuristic neon control room, holographic interface, deep blue and magenta" },
    { text: "Real TTS. Real renders. Real MP4 downloads.", prompt: "abstract cinematic render pipeline, particles, light trails, dark palette" },
    { text: "No more mocks.", prompt: "bold typography, minimalist black background, purple glow" },
  ];

  const frames = [];
  for (let i = 0; i < scenes.length; i++) {
    console.log(`[smoke] fetching image ${i + 1}/${scenes.length}…`);
    const img = await fetchPollinationsImage(scenes[i].prompt, { width: 1280, height: 720, seed: i * 97 });
    console.log(`[smoke] image ${i + 1}: ${(img.length / 1024).toFixed(0)} KB`);
    const frame = await composeSceneFrame({ index: i, text: scenes[i].text, durationSec: 2, imageBuffer: img });
    frames.push({ frameJpeg: frame, durationSec: 2 });
  }

  console.log(`[smoke] running ffmpeg…`);
  const mp4 = await renderMp4(frames, null);
  const outPath = path.join(outDir, "video.mp4");
  await fs.writeFile(outPath, mp4);
  console.log(`[smoke] wrote ${outPath} (${(mp4.length / (1024 * 1024)).toFixed(2)} MB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
