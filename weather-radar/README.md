# Live Weather Radar over Tailscale

A self-contained, single-file web app that shows an **animated live weather
radar** (precipitation, past 2 hours + short-term forecast) in any browser,
designed to be shared privately across your devices with **Tailscale**.

- **No API keys** — radar data comes from the free
  [RainViewer](https://www.rainviewer.com/api.html) public API, basemap from
  OpenStreetMap/CARTO, rendered with [Leaflet](https://leafletjs.com/).
- **No build step** — it's one `index.html`. Any static file server works.
- **Live** — radar frames auto-refresh every 5 minutes; animation includes a
  nowcast (forecast) tail you can toggle off.

## Features

- Animated radar loop with play/pause, frame stepping, scrubber, and speed
  control
- Satellite infrared layer as an alternative to precipitation radar
- **Future simulation mode** (&#128302; Future button) — swaps the observed
  loop for a 24-hour model simulation on the same timeline slider:
  - **Future radar** — NOAA HRRR simulated reflectivity, the weather model's
    own hour-by-hour prediction of what the radar will show (US, tiles via
    [Iowa Environmental Mesonet](https://mesonet.agron.iastate.edu/))
  - **Simulated satellite** — forecast cloud cover rendered as a smooth
    cloud field in the browser from an Open-Meteo model grid (global)
  - **Precipitation** and **storm energy (CAPE)** overlays from the same
    grid (global); the grid re-samples automatically as you pan/zoom
  - Press &#128225; Live to return to observed radar
- **Hazard layers** (toggleable panel, top right):
  - **Weather alerts** — live NWS active alerts as color-coded polygons:
    tornado warnings (pulsing red), severe thunderstorms, floods, red flag /
    fire weather, dense smoke, air quality alerts, heat, winter, wind, marine
    and more. Click a polygon for the full alert text. Auto-refreshes every
    2.5 minutes. (US only — [api.weather.gov](https://api.weather.gov), no key)
  - **Active fires** — satellite thermal hotspot detections from the past day
    (NASA VIIRS via [GIBS](https://nasa-gibs.github.io/gibs-api-docs/), global)
  - **Smoke / aerosol** — daily aerosol optical depth, a good wildfire-smoke
    proxy (NASA MODIS via GIBS, global)
  - **Click-for-conditions** — click anywhere on the map for live US AQI,
    PM2.5, PM10 and ozone plus a next-24-hour outlook: peak AQI, storm energy
    (CAPE), max rain chance and max wind gusts
    ([Open-Meteo](https://open-meteo.com/en/docs/air-quality-api), global, no key)
- **Prediction layers** (Hazards panel &rarr; Predictions, with a Day 1/2/3
  selector) — official NOAA Storm Prediction Center forecast polygons with
  SPC's own risk colors, refreshed half-hourly:
  - **Severe storm outlook** — categorical risk (TSTM &rarr; MRGL &rarr; SLGT
    &rarr; ENH &rarr; MDT &rarr; HIGH), Days 1&ndash;3
  - **Tornado probability** — SPC probabilistic tornado risk, Days 1&ndash;2
  - **Fire weather outlook** — elevated/critical fire risk, Days 1&ndash;2
- **Global hazard layers** (worldwide):
  - **Earthquakes** — every quake of the past 24 h, sized and colored by
    magnitude (USGS live feed, refreshes every 5 min)
  - **Disaster alerts** — GDACS tropical cyclones with forecast tracks,
    floods, volcanoes, wildfires and droughts, colored by green/orange/red
    alert severity
- **"Earth from space" view** — switch the basemap to NASA's daily VIIRS
  true-color satellite mosaic of the whole planet (real clouds, smoke plumes
  and snow cover as seen from orbit; occasional dark stripes are orbit-swath
  gaps that fill in as NASA processes the day). Zoom all the way out for the
  full globe.
- **Point report** — click anywhere on Earth for current temperature, feels
  like, wind/gusts, humidity and sky condition; air quality now and its 24 h
  peak; the 24 h storm outlook (CAPE, rain chance, gusts, UV); and today's
  temperature range and precipitation total
- Opacity slider and precipitation-intensity legend
- "My location" button (works over Tailscale HTTPS — geolocation requires a
  secure context, which `tailscale serve` gives you for free)
- Dark UI that matches the rest of this repo's Twitch-style theme

Weather alert polygons are fetched from NOAA's map service with server-side
geometry simplification and rendered on canvas, so even ~2,500 simultaneous
alerts stay smooth on phones.

## Quick start (local only)

```bash
cd weather-radar
./serve.sh
# open http://localhost:8777
```

## Share it over your Tailscale network

[Tailscale](https://tailscale.com/) creates a private WireGuard mesh ("tailnet")
between your devices. `tailscale serve` proxies a local port onto your tailnet
with automatic HTTPS.

1. **Install Tailscale** on the machine that will host the radar
   ([download](https://tailscale.com/download)) and log in:

   ```bash
   sudo tailscale up
   ```

2. **Start the radar and expose it** in one step:

   ```bash
   cd weather-radar
   ./serve.sh --tailnet
   ```

   This runs a static server on port `8777` and calls
   `tailscale serve --bg 8777`, which prints an HTTPS URL like:

   ```
   https://your-machine.your-tailnet.ts.net/
   ```

3. **Open that URL from any device on your tailnet** — phone, laptop, TV
   browser. Nothing is exposed to the public internet, no port forwarding, and
   TLS certificates are handled automatically by Tailscale (make sure
   [MagicDNS and HTTPS](https://tailscale.com/kb/1153/enabling-https) are
   enabled in your tailnet's admin console → DNS settings).

To stop sharing: `tailscale serve --https=443 off` (the script also cleans up
on exit).

### Optional: share with people *outside* your tailnet

Tailscale **Funnel** publishes the same URL to the public internet:

```bash
./serve.sh --funnel
```

Funnel must be allowed for your node in the Tailscale admin console
([docs](https://tailscale.com/kb/1223/funnel)). Use with care — the page is
harmless, but the URL becomes publicly reachable.

## Manual setup (without the script)

Any static server + `tailscale serve` works:

```bash
cd weather-radar
python3 -m http.server 8777 &        # or: npx serve -l 8777
tailscale serve --bg 8777
tailscale serve status               # shows the HTTPS URL
```

## Notes

- The page fetches radar tiles directly from `tilecache.rainviewer.com` in the
  *viewer's* browser, so the host machine uses almost no bandwidth or CPU.
- Radar coverage is worldwide where weather radars exist (US, Europe, AU, JP,
  and more). The satellite infrared layer is global.
- Default view is the continental US; use **My location** or just pan/zoom.
