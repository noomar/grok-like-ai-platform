# Aurora Render Worker

Self-hosted FastAPI + ffmpeg worker for the Aurora platform's `video` provider
pool. Once deployed, set `HF_RENDER_URL` on the Aurora app to the worker's
public URL and it becomes the second-priority video provider (after Shotstack).

## API

```
POST /render
  Body: { scenes: [{ imageUrl, text?, durationSec }], audioUrl?, width?, height? }
  → 202 { renderId }

GET /status/{renderId}
  → { status: queued|fetching|rendering|done|failed, url: string|null, error: string|null }

GET /file/{renderId}.mp4
  → streamed MP4
```

Optional bearer auth: set `WORKER_TOKEN=<secret>` and the Aurora app's
`HF_RENDER_TOKEN` to the same value.

## Hugging Face Spaces (recommended)

1. Create a Space: https://huggingface.co/new-space
   - SDK: **Docker**
   - Hardware: CPU basic is fine (ffmpeg doesn't need GPU)
2. In the Space files, upload `Dockerfile`, `app.py`, `requirements.txt`
   (everything in this folder).
3. Wait for the Space to build (~3 min).
4. Copy the public URL (e.g. `https://<user>-aurora-render.hf.space`) and set
   it as `HF_RENDER_URL` in Vercel env vars, then redeploy Aurora.

Optional: set a Space secret `WORKER_TOKEN=...` and add it to Aurora as
`HF_RENDER_TOKEN`.

## Railway / Koyeb / Fly.io

Any Docker-capable host works:

```bash
# Railway
railway up            # uses Dockerfile automatically

# Koyeb
koyeb app init aurora-render --docker aurora-render --ports 7860:http

# Fly.io
fly launch            # when prompted, accept the Dockerfile
fly secrets set WORKER_TOKEN=...   # optional
fly deploy
```

Copy the resulting URL into `HF_RENDER_URL`.

## Local test

```bash
docker build -t aurora-render .
docker run --rm -p 7860:7860 aurora-render

# in another shell
curl -X POST http://localhost:7860/render \
  -H "content-type: application/json" \
  -d '{"scenes":[{"imageUrl":"https://picsum.photos/seed/1/1280/720","text":"Hello","durationSec":3}]}'
# → { "renderId": "..." }

curl http://localhost:7860/status/<id>
# → { "status": "done", "url": "http://localhost:7860/file/<id>.mp4", "error": null }
```

## Limits

- `MAX_DURATION_SEC` (default 120): rejects renders longer than this.
- `MAX_SCENES` (default 12): trims extra scenes silently.
- Rendered files live in `/tmp/aurora-worker/<renderId>/final.mp4` and are
  wiped on container restart. For multi-render persistence mount a volume at
  `WORK_DIR`.
