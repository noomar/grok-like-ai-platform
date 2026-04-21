# Aurora render worker — deploy to HF Spaces (Docker SDK), Railway, Koyeb, Fly.
# Ships ffmpeg + FastAPI. See app.py for the API contract.

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    WORK_DIR=/tmp/aurora-worker \
    PORT=7860

# ffmpeg for rendering, curl for container healthchecks.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py ./

# HF Spaces expects 7860; Railway/Koyeb/Fly inject $PORT.
EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
