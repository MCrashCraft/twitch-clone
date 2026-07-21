# Maintenance & Improvement Schedule

## Uptime: how it actually works

The site currently runs in an **ephemeral cloud container** behind Tailscale
Funnel. Facts to know:

- **A visitor does NOT keep it alive.** Traffic to the funnel URL never reaches
  the container's lifecycle — only activity in the Claude session does. The
  container's background processes can be reaped between sessions, and the
  container itself is reclaimed after long idle.
- **Self-healing:** scheduled Routines wake the session and run
  `keepalive.sh`, which health-checks tailscaled via its localapi socket and
  the app via `/api/status` (never by process name — that false-matches),
  restarts whatever is dead with the current environment (the container's
  egress proxy port changes across restarts, so stale daemons must be killed,
  not trusted), and verifies the public URL returns 200. With keepalives at
  :07 and :37 the worst-case downtime after a reap is ~30 minutes.
- **The real fix for 24/7 uptime** is running on hardware you own:
  `git clone` the branch, then `weather-radar/serve.sh --funnel` on any
  always-on machine (old PC, Raspberry Pi, the PowerEdge). Everything —
  site, pages, API, SQLite history — is self-contained.

## Automated schedule (Routines)

| When (UTC) | Routine | What it does |
| --- | --- | --- |
| hourly at :41 | keepalive | runs `keepalive.sh` (socket/HTTP health checks, restart what's dead, verify public 200). While the site is OFFLINE it re-arms itself every 10 minutes (one-shot `send_later` wakeups) until the public URL is back to 200, then returns to the hourly cadence. |
| daily 09:30 | daily health check | curl every API endpoint (local + public), check upstream feeds (NWS, IEM, GIBS, Open-Meteo, Seattle CAD), DB size + 7-day purge sanity, disk usage, headless smoke-load of all 5 pages; fix + push what's broken |
| weekly Sun 16:00 | improvement pass | pick the top item from the backlog below, implement, test headlessly, push, report briefly |

Routines fire into the build session with full project context. They stay
silent unless something is broken and can't be auto-fixed.

## Improvement backlog (weekly routine works top-down)

1. Alert history charts page (`history.html`) — timeline of warnings per day
   from `/api/history`, using canvas sparklines.
3. Service-worker caching so pages load instantly and survive brief server
   restarts (stale-while-revalidate for API calls).
4. Push notifications (Web Push) for new warnings in the saved location.
5. Real power-outage integration behind an optional API key (PowerOutage.us),
   replacing the mock when a key is configured.
6. More real CAD feeds: Nashville active dispatch moved to an ArcGIS hub —
   find its new FeatureServer endpoint and add it; scan other cities' portals.
8. PWA manifest + install prompt so the site works as a phone app.
9. Per-page URL params (?loc=45320) so locations are shareable links.
10. Wire the WebGPU renderer into the main map behind a settings toggle.

## Done

- Tropical cyclone tracking (`/api/tropical` + map layer): NHC development
  outlook areas, active storm cones/tracks/forecast points/watch segments.
- River flood gauges (`/api/rivers` + map layer): NWPS water levels near the
  viewport, colored by flood stage.
- Wildfire perimeters: WFIGS mapped burn areas (>100 acres) drawn under the
  incident markers.

- Live lightning layer (Blitzortung websocket, strikes fade over 10 min,
  soft-fail when the socket is unreachable) — main map, Global section.
- Storm reports layer + `/api/storm-reports` (SPC today's tornado/hail/wind
  reports, radius filtering).
- Real CAD feeds expanded: Austin real-time incidents + Calgary traffic
  incidents added alongside Seattle Fire 911 (verified live, keyless,
  coordinates present; Cincinnati rejected as stale, Nashville moved to
  ArcGIS — future candidate).
- Real power outages for British Columbia via BC Hydro's public feed;
  other regions remain clearly-labeled simulation.

## Manual checklist (occasionally)

- `git pull` on any self-hosted copy.
- Check `/api/status` uptime and `weather-radar.sqlite` size.
- Revoke/rotate any Tailscale auth keys not in use.
- Review BOLO board for junk (public POST endpoint): `DELETE` via sqlite3 if needed.
