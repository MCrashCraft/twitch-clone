# 🌿 BudTube

A self-contained, YouTube-style video platform for **420-friendly gaming content**. Watch people play games; upload your own sessions. For adults 21+.

Built with Next.js 14 (App Router), TypeScript, Tailwind CSS, and **Prisma + SQLite** — no external services, API keys, or database servers required. Uploaded videos are stored on local disk.

> This app lives alongside (and is completely independent from) the Twitch-clone app at the repo root.

## Quick start

```bash
cd budtube
npm install
npm run db:push     # creates prisma/dev.db (SQLite)
npm run db:seed     # demo users (+ sample videos if ffmpeg is installed)
npm run dev         # http://localhost:3420
```

Demo accounts (all with password `password420`): `blazeitplays`, `couchlocked`, `sativa_speedruns`.

## Admin account

Copy `.env.example` to `.env` and fill in `ADMIN_PASSWORD` — the `.env`
file is gitignored so secrets stay out of the repo. Then create the admin:

```bash
npm run db:admin   # creates/updates the ADMIN_USERNAME account with role ADMIN
```

Admins (staff) can delete **any** video from its watch page; regular users
can delete their own videos from the watch page or their dashboard.

## Features

- **21+ age gate** — cookie-based interstitial before anything else loads
- **Accounts** — username/email + password (bcrypt), JWT session in an httpOnly cookie (`jose`), zero-config dev secret (set `SESSION_SECRET` in production)
- **Uploads** — MP4/WebM/Ogg/MOV/M4V/3GP up to 500 MB with optional JPEG/PNG/WebP thumbnail and a progress bar, saved to `uploads/` (gitignored)
- **Playback** — HTML5 player backed by a streaming route with full **HTTP Range** support, so seeking works
- **Social** — likes, comments, subscriptions, channel pages
- **Browse** — home feed with cannabis-gaming category pills (Stoner Shooters, Puff & Puzzle, Speedruns & Sesh, …), search, view counts
- **Creator dashboard** — your videos with stats and delete (removes files from disk too)

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 14 App Router, React 18, TypeScript |
| Styling | Tailwind CSS 3 (hand-rolled dark green/purple theme) |
| Database | SQLite via Prisma (`prisma/dev.db`) |
| Auth | bcryptjs + jose (HS256 JWT cookie) |
| File storage | Local disk (`uploads/videos`, `uploads/thumbnails`) |

## Known demo-scale simplifications

- Uploads buffer the whole file in memory before writing to disk
- No transcoding — only browser-playable files (H.264 MP4, WebM, Ogg) play back
- View counts increment per page load (no dedupe)
- JWT sessions can't be revoked server-side; no password reset flow

## Disclaimer

BudTube is a demo project themed for adults 21+ in places where cannabis is legal. Nothing here is medical or legal advice.
