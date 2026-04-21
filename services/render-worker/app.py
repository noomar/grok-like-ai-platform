"""
Aurora self-hosted render worker.

FastAPI + ffmpeg. Designed to run on any free tier (Hugging Face Spaces /
Railway / Koyeb / Fly) as a Docker container. Single always-on process so the
in-memory job map is authoritative — no external DB required.

Contract (matches src/lib/providers/video.ts):
  POST /render
    Body: { scenes: [{imageUrl, text?, durationSec}], audioUrl?: string,
            width?: int, height?: int }
    → 202 {renderId: string}

  GET /status/{render_id}
    → {status: queued|fetching|rendering|saving|done|failed, url: str|null,
       error: str|null}

  GET /file/{render_id}.mp4
    → the rendered MP4 (streamed)

  GET /health
    → {ok: true}

Authentication (optional): set WORKER_TOKEN env var; callers must pass
`Authorization: Bearer <token>`. Leave unset for open access.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

app = FastAPI(title="Aurora Render Worker", version="1.0.0")

# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #
WORK_DIR = Path(os.environ.get("WORK_DIR", "/tmp/aurora-worker"))
WORK_DIR.mkdir(parents=True, exist_ok=True)
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
WORKER_TOKEN = os.environ.get("WORKER_TOKEN", "").strip()
MAX_SCENES = int(os.environ.get("MAX_SCENES", "12"))
DEFAULT_WIDTH = 1280
DEFAULT_HEIGHT = 720
MAX_DURATION_SEC = int(os.environ.get("MAX_DURATION_SEC", "120"))

# --------------------------------------------------------------------------- #
# Models
# --------------------------------------------------------------------------- #
class Scene(BaseModel):
    imageUrl: str
    text: Optional[str] = None
    durationSec: float = Field(ge=1.0, le=30.0)


class RenderRequest(BaseModel):
    scenes: List[Scene]
    audioUrl: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None


@dataclass
class Job:
    id: str
    status: str = "queued"  # queued|fetching|rendering|saving|done|failed
    url: Optional[str] = None
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    output_path: Optional[Path] = None


JOBS: Dict[str, Job] = {}
JOBS_LOCK = threading.Lock()


def _public_url(request: Request, render_id: str) -> str:
    if PUBLIC_BASE_URL:
        return f"{PUBLIC_BASE_URL}/file/{render_id}.mp4"
    # Infer from the request (works on HF Spaces, Railway, etc.)
    scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    return f"{scheme}://{host}/file/{render_id}.mp4"


def _check_auth(request: Request) -> None:
    if not WORKER_TOKEN:
        return
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer ") or auth[7:].strip() != WORKER_TOKEN:
        raise HTTPException(status_code=401, detail="unauthorized")


# --------------------------------------------------------------------------- #
# Render pipeline (runs in a background thread)
# --------------------------------------------------------------------------- #
def _download(url: str, dest: Path, timeout: int = 60) -> None:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "aurora-render-worker/1.0"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp, open(dest, "wb") as fh:
        shutil.copyfileobj(resp, fh)


_SAFE_TEXT = re.compile(r"[^\w\s,.?!\-'\"]")


def _escape_drawtext(text: str) -> str:
    # ffmpeg drawtext needs colons/backslashes/single-quotes escaped.
    return (
        _SAFE_TEXT.sub(" ", text)
        .replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "\\'")
    )


def _run(cmd: List[str]) -> None:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            f"command failed ({proc.returncode}): {' '.join(cmd[:4])}… · stderr: {proc.stderr[-400:]}"
        )


def _build_scene_clip(
    scene: Scene,
    image_path: Path,
    out_path: Path,
    width: int,
    height: int,
) -> None:
    # Scale to cover + pad, then optionally overlay text at the bottom.
    filter_parts = [
        f"scale={width}:{height}:force_original_aspect_ratio=increase",
        f"crop={width}:{height}",
        f"zoompan=z='min(zoom+0.0015,1.1)':d={int(scene.durationSec*30)}:s={width}x{height}:fps=30",
    ]
    if scene.text:
        escaped = _escape_drawtext(scene.text[:180])
        filter_parts.append(
            f"drawtext=text='{escaped}':"
            f"fontcolor=white:fontsize=40:"
            f"box=1:boxcolor=black@0.55:boxborderw=14:"
            f"x=(w-text_w)/2:y=h-th-48"
        )
    vf = ",".join(filter_parts)
    _run(
        [
            "ffmpeg",
            "-y",
            "-loop",
            "1",
            "-t",
            str(scene.durationSec),
            "-i",
            str(image_path),
            "-vf",
            vf,
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-r",
            "30",
            "-preset",
            "veryfast",
            str(out_path),
        ]
    )


def _concat(clips: List[Path], out_path: Path) -> None:
    list_file = out_path.parent / "concat.txt"
    list_file.write_text("\n".join(f"file '{p}'" for p in clips))
    _run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(list_file),
            "-c",
            "copy",
            str(out_path),
        ]
    )


def _mux_audio(video: Path, audio: Path, out_path: Path) -> None:
    _run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(video),
            "-i",
            str(audio),
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-shortest",
            str(out_path),
        ]
    )


def _render_job(job_id: str, req: RenderRequest) -> None:
    scratch = WORK_DIR / job_id
    scratch.mkdir(parents=True, exist_ok=True)
    try:
        with JOBS_LOCK:
            JOBS[job_id].status = "fetching"

        width = req.width or DEFAULT_WIDTH
        height = req.height or DEFAULT_HEIGHT

        clip_paths: List[Path] = []
        for i, scene in enumerate(req.scenes[:MAX_SCENES]):
            img_path = scratch / f"scene-{i:02d}.img"
            _download(scene.imageUrl, img_path, timeout=45)
            clip_path = scratch / f"scene-{i:02d}.mp4"
            _build_scene_clip(scene, img_path, clip_path, width, height)
            clip_paths.append(clip_path)

        with JOBS_LOCK:
            JOBS[job_id].status = "rendering"
        merged = scratch / "merged.mp4"
        _concat(clip_paths, merged)

        final = scratch / "final.mp4"
        if req.audioUrl:
            audio_path = scratch / "audio.mp3"
            _download(req.audioUrl, audio_path, timeout=45)
            _mux_audio(merged, audio_path, final)
        else:
            shutil.copy2(merged, final)

        with JOBS_LOCK:
            JOBS[job_id].status = "done"
            JOBS[job_id].output_path = final
    except Exception as exc:  # noqa: BLE001
        with JOBS_LOCK:
            JOBS[job_id].status = "failed"
            JOBS[job_id].error = str(exc)[:400]


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #
@app.get("/")
def root():
    return {
        "service": "aurora-render-worker",
        "version": app.version,
        "ffmpeg": shutil.which("ffmpeg") is not None,
    }


@app.get("/health")
def health():
    return {"ok": True, "ffmpeg": shutil.which("ffmpeg") is not None, "jobs": len(JOBS)}


@app.post("/render")
def render(req: RenderRequest, request: Request):
    _check_auth(request)
    total = sum(s.durationSec for s in req.scenes)
    if total > MAX_DURATION_SEC:
        raise HTTPException(status_code=413, detail=f"total duration > {MAX_DURATION_SEC}s")
    if len(req.scenes) == 0:
        raise HTTPException(status_code=400, detail="scenes required")
    job_id = uuid.uuid4().hex
    with JOBS_LOCK:
        JOBS[job_id] = Job(id=job_id)
    threading.Thread(target=_render_job, args=(job_id, req), daemon=True).start()
    return JSONResponse(status_code=202, content={"renderId": job_id})


@app.get("/status/{render_id}")
def status(render_id: str, request: Request):
    _check_auth(request)
    with JOBS_LOCK:
        job = JOBS.get(render_id)
    if not job:
        raise HTTPException(status_code=404, detail="unknown renderId")
    url = _public_url(request, render_id) if job.status == "done" else None
    return {
        "status": job.status,
        "url": url,
        "error": job.error,
    }


@app.get("/file/{render_id}.mp4")
def serve_file(render_id: str):
    # No auth on /file — the URL itself is the capability, matching how Shotstack
    # publishes its renders. If you need private renders, terminate TLS + mTLS
    # at the platform edge (HF Spaces supports basic auth via Secrets).
    # Strip any path separators to avoid traversal.
    safe = urllib.parse.quote(render_id, safe="")
    with JOBS_LOCK:
        job = JOBS.get(safe)
    if not job or not job.output_path or not job.output_path.exists():
        raise HTTPException(status_code=404, detail="not ready")
    return FileResponse(job.output_path, media_type="video/mp4", filename=f"{safe}.mp4")
