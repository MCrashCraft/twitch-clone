# Maintenance & Improvement Schedule

## Uptime: how it actually works

The site currently runs in an **ephemeral cloud container** behind Tailscale
Funnel. Facts to know:

- **A visitor does NOT keep it alive.** Traffic to the funnel URL never reaches
  the container's lifecycle — only activity in the Claude session does. The
  container's background processes can be reaped between sessions, and the
  container itself is reclaimed after long idle.
- **Self-healing:** scheduled Routines wake the session, restart `tailscaled`
  and `server.py` if dead, and verify the public URL returns 200. With two
  staggered keepalives the worst-case downtime after a process reap is ~30
  minutes; typical recovery is faster.
- **The real fix for 24/7 uptime** is running on hardware you own:
  `git clone` the branch, then `weather-radar/serve.sh --funnel` on any
  always-on machine (old PC, Raspberry Pi, the PowerEdge). Everything —
  site, pages, API, SQLite history — is self-contained.

## Automated schedule (Routines)

| When (UTC) | Routine | What it does |
| --- | --- | --- |
| hourly at :42 | keepalive A | restart tailscaled/server if dead; verify public 200 |
| hourly at :31 | keepalive B | same check, second chance each hour (worst-case gap ~49 min) |
| daily 09:30 | daily health check | curl every API endpoint (local + public), check upstream feeds (NWS, IEM, GIBS, Open-Meteo, Seattle CAD), DB size + 7-day purge sanity, disk usage, headless smoke-load of all 5 pages; fix + push what's broken |
| weekly Sun 16:00 | improvement pass | pick the top item from the backlog below, implement, test headlessly, push, report briefly |

Routines fire into the build session with full project context. They stay
silent unless something is broken and can't be auto-fixed.

## Improvement backlog (weekly routine works top-down)

1. Add more real-time public CAD dispatch feeds (candidate cities with open
   Socrata feeds + coordinates) to `DISPATCH_FEEDS` in both `platform_api.py`
   and `index.html`.
2. Alert history charts page (`history.html`) — timeline of warnings per day
   from `/api/history`, using canvas sparklines.
3. Service-worker caching so pages load instantly and survive brief server
   restarts (stale-while-revalidate for API calls).
4. Push notifications (Web Push) for new warnings in the saved location.
5. Real power-outage integration behind an optional API key (PowerOutage.us),
   replacing the mock when a key is configured.
6. Lightning strikes layer (Blitzortung public websocket) on the main map.
7. Storm reports layer (SPC storm reports CSV — tornado/hail/wind reports).
8. PWA manifest + install prompt so the site works as a phone app.
9. Per-page URL params (?loc=45320) so locations are shareable links.
10. Wire the WebGPU renderer into the main map behind a settings toggle.

## Manual checklist (occasionally)

- `git pull` on any self-hosted copy.
- Check `/api/status` uptime and `weather-radar.sqlite` size.
- Revoke/rotate any Tailscale auth keys not in use.
- Review BOLO board for junk (public POST endpoint): `DELETE` via sqlite3 if needed.
