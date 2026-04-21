import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

const FFMPEG = ffmpegInstaller.path;

export type SceneInput = {
  index: number;
  text: string;
  durationSec: number;
  imageBuffer: Buffer;
};

const WIDTH = 1280;
const HEIGHT = 720;

/**
 * Compose a single scene frame: background image (darkened) + text overlay.
 */
export async function composeSceneFrame(scene: SceneInput): Promise<Buffer> {
  const bg = await sharp(scene.imageBuffer)
    .resize(WIDTH, HEIGHT, { fit: "cover", position: "center" })
    .modulate({ brightness: 0.55 })
    .jpeg({ quality: 82 })
    .toBuffer();

  const safe = escapeXml(scene.text).slice(0, 220);
  const lines = wrapText(safe, 32);
  const lineSpacing = 72;
  const startY = HEIGHT / 2 - (lines.length - 1) * (lineSpacing / 2);

  const tspans = lines
    .map((line, i) => `<tspan x="50%" y="${startY + i * lineSpacing}" text-anchor="middle">${line}</tspan>`)
    .join("");

  const badge = `SCENE ${scene.index + 1}`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="rgba(124,58,237,0.45)" />
      <stop offset="60%" stop-color="rgba(34,211,238,0.25)" />
      <stop offset="100%" stop-color="rgba(236,72,153,0.35)" />
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="6"/>
      <feOffset dx="0" dy="4" result="offsetblur"/>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <text x="60" y="80" font-family="Inter, Helvetica, Arial, sans-serif" font-size="22" fill="rgba(255,255,255,0.75)" letter-spacing="4">${badge}</text>
  <g font-family="Inter, Helvetica, Arial, sans-serif" font-size="52" font-weight="700" fill="#ffffff" filter="url(#shadow)">
    ${tspans}
  </g>
  <rect x="60" y="${HEIGHT - 60}" width="${WIDTH - 120}" height="3" fill="rgba(255,255,255,0.35)"/>
</svg>`;

  return sharp(bg)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length > maxChars) {
      if (current) lines.push(current);
      current = w;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4);
}

/**
 * Run ffmpeg to concatenate still images (one per scene) into an MP4 sized to the
 * given durations, optionally muxing an audio track. Returns the MP4 buffer.
 */
export async function renderMp4(
  scenes: { frameJpeg: Buffer; durationSec: number }[],
  audioMp3: Buffer | null,
): Promise<Buffer> {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "aurora-ffmpeg-"));
  try {
    const listPath = path.join(workDir, "scenes.txt");
    const lines: string[] = [];
    for (let i = 0; i < scenes.length; i++) {
      const frame = path.join(workDir, `scene_${String(i).padStart(3, "0")}.jpg`);
      await fs.writeFile(frame, scenes[i].frameJpeg);
      lines.push(`file '${frame.replace(/'/g, "'\\''")}'`);
      lines.push(`duration ${scenes[i].durationSec.toFixed(3)}`);
    }
    // concat demuxer requires the last file to be listed again without a duration.
    const lastFrame = path.join(workDir, `scene_${String(scenes.length - 1).padStart(3, "0")}.jpg`);
    lines.push(`file '${lastFrame.replace(/'/g, "'\\''")}'`);
    await fs.writeFile(listPath, lines.join("\n"));

    const outPath = path.join(workDir, "video.mp4");
    const audioPath = audioMp3 ? path.join(workDir, "audio.mp3") : null;
    if (audioPath && audioMp3) await fs.writeFile(audioPath, audioMp3);

    const args: string[] = [
      "-y",
      "-hide_banner",
      "-loglevel", "error",
      "-f", "concat",
      "-safe", "0",
      "-i", listPath,
    ];
    if (audioPath) {
      args.push("-i", audioPath);
    }
    args.push(
      "-vsync", "vfr",
      "-pix_fmt", "yuv420p",
      "-vf", `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,fps=30`,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "22",
      "-movflags", "+faststart",
    );
    if (audioPath) {
      args.push("-c:a", "aac", "-b:a", "160k", "-shortest");
    } else {
      args.push("-an");
    }
    args.push(outPath);

    await runCommand(FFMPEG, args);
    return fs.readFile(outPath);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

function runCommand(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${bin} exited ${code}: ${stderr.slice(0, 500)}`));
    });
  });
}
