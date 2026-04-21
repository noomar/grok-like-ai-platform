# Aurora Sovereign Empire — Portable Brain

This bundle contains everything you need to run the full Aurora stack on any
Linux box you own. Zero cloud signup, zero credit card, no lock-in.

## What's inside

- `Dockerfile` + `docker-compose.yml` — Next.js app + FastAPI/ffmpeg render worker.
- `services/render-worker/` — the keyless rendering backend (ffmpeg inside Docker).
- `src/` — the full source tree of the Aurora app (agent, terminal, factory, nest).
- `start-empire.sh` — one-command idempotent bootstrap.
- `infra/` — IaC templates for Fly / Railway / Oracle / Terraform if you decide
  to graduate from a local box to a cloud host later.

## Quickstart (1 command)

```bash
tar xf aurora-sovereign-<sha>.zip   # or unzip
cd aurora-sovereign-<sha>
./start-empire.sh
```

On first run the script:

1. Verifies Docker + Docker Compose are installed and reachable.
2. Generates `.env` with a random `ADMIN_PASSWORD` and session secret
   (mode `600`; never committed anywhere).
3. Builds the `aurora:latest` and `aurora-render-worker:latest` images locally.
4. Launches the stack detached with a persistent `aurora-data` volume.
5. Waits for the brain to come online, then prints the admin password.

Subsequent runs are idempotent: they pull git (if this is a git checkout),
rebuild only what changed, restart the stack, and preserve your SQLite volume.

## What you get

Once `start-empire.sh` finishes, open:

| Surface          | URL                                      |
| ---------------- | ---------------------------------------- |
| App              | http://localhost:3000                    |
| Admin login      | http://localhost:3000/admin/login        |
| Agent executor   | http://localhost:3000/admin/agent        |
| Shell terminal   | http://localhost:3000/admin/terminal     |
| Nest control     | http://localhost:3000/admin/nest         |
| Provider health  | http://localhost:3000/api/providers/health |
| Render worker    | http://localhost:7860/health             |

Admin password is in `.env` (printed at the end of `start-empire.sh`).

## What works on the Nest that did not work on Vercel

- `ffmpeg`, `apt`, `npm install -g` — the full shell.
- Persistent SQLite at `/data/aurora.db` (Docker volume `aurora-data`).
- Agent jobs with **no Lambda timeout** — long tasks run to completion.
- File writes survive restarts.

## Management

```bash
# tail logs
docker compose logs -f app
docker compose logs -f render-worker

# stop the empire (volume survives)
docker compose down

# nuke everything including the SQLite volume (irreversible)
docker compose down -v

# restart (idempotent, safe any time)
./start-empire.sh
```

## Reverse proxy + TLS (optional)

Put Caddy or Nginx in front of `:3000` for HTTPS. Example Caddyfile:

```
empire.example.com {
    reverse_proxy localhost:3000
}
```

## Migration to cloud later

`scripts/migrate-nest.mjs --target=fly` (or `--target=railway` / `--target=docker`)
still works. Drop your token into `FLY_API_TOKEN`, run the script, done.

## Security notes

- `.env` is chmod 600. Treat it as a secret file.
- `/admin/terminal` is a root shell inside the `app` container. Anyone with
  `ADMIN_PASSWORD` can run arbitrary commands — don't expose this to the public
  without TLS + strong password + ideally IP allowlist.
- The render worker speaks HTTP. If you expose port 7860, set `WORKER_TOKEN` in
  `.env` to gate it.

## Support

This is self-hosted. You own the code, the data, the infra. If something
breaks:

1. `docker compose logs app` / `docker compose logs render-worker`
2. `docker exec -it $(docker compose ps -q app) sh` to poke around.
3. The SQLite file is at `/data/aurora.db` inside the app container (mounted
   from the `aurora-data` volume) — back it up with
   `docker compose exec app sqlite3 /data/aurora.db ".backup /data/backup.db"`.
