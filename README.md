# Aurora AI — High-end AI platform with Production Factory

Next.js 16 + TypeScript + Tailwind v4 + Lucide. Grok-inspired UX with an
automated content production pipeline (TTS → Scene Assembly → Music Sync →
Render) and an admin console.

## Features

- **Entry Guard**: Landing page blocks access until verified via WhatsApp.
  Button opens `https://wa.me/996500904998` and sets a session cookie; a
  `proxy.ts` edge check guards `/dashboard/*` and `/factory/*`.
- **AI Dashboard**: Dark, futuristic UI with sidebar, metrics, recent jobs,
  module status, Aurora chat, and model catalog.
- **Production Factory**: Queue jobs from the UI; server pipeline runs script
  analysis → TTS → scene assembly → music sync → final render. Live status
  polled from the UI.
- **Standalone backend APIs**: `POST /api/factory/tts`, `POST /api/factory/video`,
  `POST /api/factory/music-sync` — stubs ready to wire into real providers.
- **Admin Panel**: Password-gated (`ADMIN_PASSWORD` env) console at `/admin`
  with job management, user request triage, and settings.

## Stack

- Next.js 16 (App Router, Route Handlers, `proxy.ts` edge middleware)
- React 19, TypeScript 5
- Tailwind CSS v4 (`@theme inline`, utility-first)
- Lucide icons

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

Create a `.env.local`:

```bash
ADMIN_PASSWORD=change-me
# Add provider keys as you wire up /api/factory/{tts,video,music-sync}
# TTS_API_KEY=...
# VIDEO_API_KEY=...
```

If `ADMIN_PASSWORD` is unset, the default is `aurora-admin` (dev only).

## Flow

1. User lands on `/` → sees gate → clicks **Verify via WhatsApp**.
2. `/api/verify` (POST) sets the `aurora_gate` cookie and redirects to `wa.me`.
3. `proxy.ts` allows `/dashboard`, `/factory` only when the cookie is present.
4. Admin signs in at `/admin/login` (password → `aurora_admin` cookie) and
   manages the production line + user requests.

## Routes

| Path | Purpose |
| --- | --- |
| `/` | Landing gate |
| `/dashboard` | Command center |
| `/dashboard/chat` | Aurora chat (demo) |
| `/dashboard/models` | Model catalog |
| `/factory` | Production factory console |
| `/admin/login` | Admin sign-in |
| `/admin` | Admin overview |
| `/admin/jobs` | Job management |
| `/admin/users` | User request triage |
| `/admin/settings` | Platform settings |

### API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/verify` | Start gate verification (set cookie + redirect to WhatsApp) |
| `POST` | `/api/verify/logout` | Clear gate cookie |
| `POST` | `/api/admin/login` | Admin sign-in |
| `POST` | `/api/admin/logout` | Admin sign-out |
| `GET/POST` | `/api/factory/jobs` | List / create production jobs |
| `GET` | `/api/factory/jobs/:id` | Get job |
| `POST` | `/api/factory/jobs/:id/cancel` | Cancel job |
| `POST` | `/api/factory/tts` | TTS stub — swap with real provider |
| `POST` | `/api/factory/video` | Scene assembly plan |
| `POST` | `/api/factory/music-sync` | Beat-aligned cut markers |
| `POST` | `/api/chat` | Demo chat responses |
| `PATCH/DELETE` | `/api/admin/requests/:id` | Triage user requests |

## Wiring real providers

The Production Factory runs an in-process pipeline (`src/lib/factory.ts`) that
simulates timing. To go to production:

- Replace the TTS step with a call into your TTS provider and store the
  resulting audio URL on the job.
- Replace the video step with a call into a renderer such as Remotion,
  Shotstack, or an FFmpeg worker.
- Replace the music step with a music-generation API or library lookup, then
  mix against the TTS audio using the beat markers from `/api/factory/music-sync`.
- Swap the in-memory `getStore()` with a real database (Postgres, etc.).

## License

MIT
