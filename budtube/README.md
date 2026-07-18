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

## Admin & owner accounts

Copy `.env.example` to `.env` and fill in `ADMIN_PASSWORD` — the `.env`
file is gitignored so secrets stay out of the repo. Then create the admin:

```bash
npm run db:admin   # creates/updates the ADMIN_USERNAME account with role OWNER
```

The owner is the main admin: it has all staff powers, can never be
demoted, and gets the **/admin** panel to promote or demote other users
to Admin. Staff (Admin or Owner) can delete **any** video from its watch
page; regular users can delete their own videos from the watch page or
their dashboard.

## ID verification (Didit)

The 21+ age gate supports real ID-document verification through
[Didit](https://docs.didit.me) (free tier: 500 checks/month). Set
`DIDIT_API_KEY` and `DIDIT_WORKFLOW_ID` in `.env` to enable it; visitors
then verify with an ID scan (extracted age must be 21+), with
date-of-birth entry as fallback. `DIDIT_MONTHLY_CAP` (default 450) hard-caps
API usage below the free tier — past the cap the gate falls back to DOB
entry until the month resets. Signed-in users who complete an ID check
get an "ID verified" badge; usage is shown on the /admin panel.

## Docker & Unraid

A published image is built by GitHub Actions on every push:
`ghcr.io/mcrashcraft/budtube:latest`. Everything persistent (SQLite
database + uploaded videos) lives on the `/data` volume.

**Unraid:** Docker tab → Add Container → set Repository to
`ghcr.io/mcrashcraft/budtube:latest`, map port `3420`, map a path from
`/mnt/user/appdata/budtube` to `/data`, and set the `ADMIN_PASSWORD` and
`SESSION_SECRET` variables. A ready-made template is in
[`unraid/budtube-template.xml`](unraid/budtube-template.xml) — drop it in
`/boot/config/plugins/dockerMan/templates-user/` on your flash drive and
it appears in Unraid's template list.

**docker-compose:** see [`docker-compose.yml`](docker-compose.yml) —
`docker compose up -d` and open port 3420.

**Build locally:** `docker build -t budtube .` (behind a TLS-intercepting
proxy, add `--secret id=extra_ca,src=/path/to/proxy-ca.pem`).

On every start the container runs `prisma db push` (creates/updates the
schema) and ensures the owner account from `ADMIN_USERNAME`/`ADMIN_PASSWORD`.
Environment variables: `ADMIN_PASSWORD` (required), `SESSION_SECRET`
(recommended), `ADMIN_USERNAME`, `ADMIN_EMAIL`, `DIDIT_API_KEY`,
`DIDIT_WORKFLOW_ID`, `DIDIT_MONTHLY_CAP`, `PORT`.

## User settings

Signed-in users can change their email, channel bio, and password at
**/settings**.

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
