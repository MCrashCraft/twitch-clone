# Weather Emergency Platform

Backend API + Discord bot + Hermes skill + optional WebGPU renderer for
https://weather-radar.tail9775d.ts.net

## File structure

```
weather-radar/
├── server.py              # HTTP server: static site + all /api/* endpoints
├── platform_api.py        # Part 1 — the 7 location-aware platform endpoints
├── index.html             # existing map site (Leaflet)
├── serve.sh               # run server (+ tailscale serve/funnel)
├── weather-radar.sqlite   # history DB (auto-created, gitignored)
├── bot/
│   ├── discord_bot.py     # Part 2 — Discord bot (slash commands + poller + TTS)
│   └── requirements.txt
├── hermes/
│   ├── get_alerts.skill.json   # Part 3 — skill definition
│   ├── handler.py              # Python handler
│   ├── handler.js              # Node handler (18+, no deps)
│   └── example-conversation.md
└── webgpu/
    └── radar-webgpu.js    # Part 4 — WebGPU renderer + Leaflet layer + WGSL
```

## Part 1 — API

Runs inside the existing server (no extra process):

```bash
cd weather-radar
python3 server.py 8777          # or ./serve.sh --funnel for the public URL
```

Endpoints (all accept `lat=&lon=`, `zip=`, `city=[&state=]`, `county=[&state=]`, `state=`):

| Endpoint | Data | Real/Mock |
| --- | --- | --- |
| `/api/nws-alerts` | active NWS alerts, point-filtered | real (api.weather.gov) |
| `/api/amber-alerts` | AMBER alerts + extracted vehicle/plate | real (NWS CAE feed) |
| `/api/noaa-radio` | NWR-style broadcast script for the location | real alerts → synthesized script |
| `/api/911-public-calls` | public CAD dispatch calls near the chosen point | real where a public feed covers the location; otherwise location-specific simulated data (`"mock": true`) |
| `/api/cad` | alias of 911-public-calls (`?lat=&lon=`, `?city=`, `?county=`, `?zip=`) | same location-based logic |
| `/api/power-outages` | outage list for county/point | **real in British Columbia** (BC Hydro public feed); simulated elsewhere (US national feeds are paywalled) |
| `/api/gas-incidents` | gas/hazmat dispatch calls | real where a feed covers the location; otherwise simulated for it |
| `/api/hrrr-summary` | HRRR/GFS blend: storm risk, CAPE, gusts, precip, hourly | real (Open-Meteo) |
| `/api/storm-reports` | today's SPC tornado/hail/wind reports, optional `radius_km` filter | real (SPC CSVs, proxied) |
| `/api/tropical` | NHC 7-day development areas + active storm cones/tracks/points/watches | real (NHC ArcGIS) |
| `/api/rivers` | NOAA river gauges near the location, flood categories + forecasts | real (NWPS API) |

Real CAD coverage: **Seattle** (Fire 911), **Austin** (real-time police/fire
incident CAD), **Calgary** (city traffic-incident CAD). Everywhere else gets
clearly-flagged simulated data for the chosen location only.

Every response: `{endpoint, status, generated, mock, location, count, data[]}` —
each `data` item has an `id` and `status`. Errors return HTTP 400 with
`{status:"error", error, hint}`. Location resolution uses Zippopotam (ZIP) and
Open-Meteo geocoding (city/county/state), both keyless.

Examples:
```
/api/nws-alerts?lat=39.75&lon=-84.65
/api/nws-alerts?city=Eaton&state=OH
/api/amber-alerts?state=OH
/api/power-outages?county=Montgomery&state=OH
/api/hrrr-summary?zip=45320
```

## Part 2 — Discord bot

```bash
cd weather-radar/bot
python3 -m pip install -r requirements.txt
export DISCORD_BOT_TOKEN="your-bot-token"
export WEATHER_API_BASE="https://weather-radar.tail9775d.ts.net"   # default
python3 discord_bot.py
```

Flow: `/setlocation 45320` (or `Eaton, OH`, or `39.75,-84.65`) → `/watch on`
→ the bot polls every 2 minutes, diffs alert IDs against `bot_state.sqlite`,
and posts embeds for anything new. `/tts on` attaches spoken MP3s (edge-tts)
for AMBER alerts, NWS alerts, 911 calls and HRRR summaries. On-demand:
`/alerts`, `/amber`, `/calls911`, `/hrrr`.

## Part 3 — Hermes skill

Register `hermes/get_alerts.skill.json` as a tool in your Hermes runtime and
route calls to `handler.py:get_alerts(endpoint)` (or `handler.js:getAlerts`).
The handler allowlists the 7 endpoints, calls the API, returns JSON.

```bash
python3 hermes/handler.py "/api/nws-alerts?city=Eaton&state=OH"   # CLI test
node   hermes/handler.js  "/api/hrrr-summary?zip=45320"           # CLI test
```

See `hermes/example-conversation.md` for the tool-call transcript.

## Part 4 — WebGPU renderer (optional)

`webgpu/radar-webgpu.js` exports:

- `RadarWebGPU` — device/context init, texture upload
  (`copyExternalImageToTexture`), WGSL fullscreen pipeline with an NWS-style
  reflectivity colormap, premultiplied-alpha compositing, `render({opacity,
  useColormap})`.
- `LeafletWebGPULayer` — drop-in Leaflet overlay for a geo-bounded frame with
  automatic fallback to `L.imageOverlay` when `navigator.gpu` is absent.

Integration with the existing site:

```html
<script src="webgpu/radar-webgpu.js"></script>
<script>
  // Render one composited HRRR/radar frame through WebGPU over CONUS:
  const layer = new LeafletWebGPULayer(frameUrl, [[24, -125], [50, -66]],
                                       { opacity: 0.8, useColormap: true });
  layer.addToMap(map);            // falls back automatically without WebGPU
  // Animation: call layer.setFrameUrl(nextFrameUrl) per timeline tick.
</script>
```

Set `useColormap: true` for grayscale intensity sources (the WGSL ramp maps
luminance → dBZ colors); `false` for pre-colored tiles (RainViewer, IEM).
The site's existing tile pipeline remains the default — WebGPU is opt-in.
