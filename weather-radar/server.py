#!/usr/bin/env python3
"""Weather radar server: static site + small aggregating JSON API.

Endpoints (all return JSON with CORS enabled, cached briefly server-side):
  /api/status            uptime + endpoint list
  /api/alerts            active US watches/warnings/advisories (NOAA WWA, simplified geometry)
  /api/amber             active AMBER alerts (NWS Child Abduction Emergency feed)
  /api/quakes            earthquakes past 24h worldwide (USGS)
  /api/fires             confirmed active wildfire incidents (NIFC/WFIGS)
  /api/disasters         global disaster alerts (GDACS)
  /api/dispatch          recent public-safety dispatch calls (public CAD feeds)
  /api/point?lat=&lon=   current weather + air quality + 24h outlook for a point (Open-Meteo)

Run:  python3 server.py [port]     (default 8777)
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
START = time.time()

WWA = "https://mapservices.weather.noaa.gov/eventdriven/rest/services/WWA/watch_warn_adv/MapServer/{}/query?where=1%3D1&outFields=prod_type,expiration,onset,url&f=geojson&maxAllowableOffset={}"

UPSTREAM = {
    "alerts": [WWA.format(1, 0.05), WWA.format(0, 0.01)],
    "amber": ["https://api.weather.gov/alerts/active?event=Child%20Abduction%20Emergency"],
    "quakes": ["https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson"],
    "fires": ["https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/"
              "WFIGS_Incident_Locations_Current/FeatureServer/0/query?where=IncidentTypeCategory%3D%27WF%27"
              "&outFields=IncidentName,IncidentSize,PercentContained,FireDiscoveryDateTime,POOState,POOCounty,"
              "FireBehaviorGeneral,TotalIncidentPersonnel&f=geojson"],
    "disasters": ["https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP"],
    "dispatch": ["https://data.seattle.gov/resource/kzjm-xkqj.json?%24limit=40&%24order=datetime%20DESC"],
}
TTL = {"alerts": 120, "amber": 120, "quakes": 300, "fires": 600, "disasters": 900, "dispatch": 60, "point": 300}

_cache = {}


def fetch_json(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "weather-radar-hobby (github.com/MCrashCraft/twitch-clone)",
        "Accept": "application/geo+json, application/json",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8", "replace"))


def cached(name, builder):
    now = time.time()
    hit = _cache.get(name)
    if hit and now - hit[0] < TTL.get(name.split("?")[0].split(":")[0], 120):
        return hit[1]
    data = builder()
    _cache[name] = (now, data)
    return data


def build_simple(kind):
    results = [fetch_json(u) for u in UPSTREAM[kind]]
    if kind == "alerts":
        feats = []
        for r in results:
            feats.extend(r.get("features", []))
        return {"type": "FeatureCollection", "count": len(feats), "features": feats}
    if kind == "dispatch":
        calls = []
        for rec in results[0]:
            try:
                calls.append({
                    "feed": "seattle-fire-911", "id": rec.get("incident_number"),
                    "type": rec.get("type"), "address": rec.get("address"),
                    "datetime_local": rec.get("datetime"),
                    "lat": float(rec["latitude"]), "lon": float(rec["longitude"]),
                })
            except (KeyError, TypeError, ValueError):
                continue
        return {"count": len(calls), "note": "public CAD dispatch logs, not call audio", "calls": calls}
    return results[0]


def build_point(lat, lon):
    wx = fetch_json(
        "https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s"
        "&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,weather_code"
        "&hourly=cape,wind_gusts_10m,precipitation_probability,uv_index"
        "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=1&timezone=auto" % (lat, lon))
    aq = fetch_json(
        "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=%s&longitude=%s"
        "&current=us_aqi,pm2_5,pm10,ozone&hourly=us_aqi&forecast_days=1" % (lat, lon))
    return {"weather": wx, "air_quality": aq}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def log_message(self, *a):
        pass

    def send_json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "public, max-age=60")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if not parsed.path.startswith("/api/"):
            return super().do_GET()
        name = parsed.path[len("/api/"):].strip("/")
        try:
            if name == "status":
                return self.send_json({
                    "ok": True, "uptime_s": int(time.time() - START),
                    "endpoints": ["/api/" + k for k in list(UPSTREAM) + ["point?lat=&lon=", "status"]],
                })
            if name == "point":
                q = urllib.parse.parse_qs(parsed.query)
                lat = round(float(q["lat"][0]), 3)
                lon = round(float(q["lon"][0]), 3)
                if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                    raise ValueError("out of range")
                return self.send_json(cached("point:%s,%s" % (lat, lon), lambda: build_point(lat, lon)))
            if name in UPSTREAM:
                return self.send_json(cached(name, lambda: build_simple(name)))
            return self.send_json({"ok": False, "error": "unknown endpoint"}, 404)
        except (KeyError, ValueError, IndexError):
            return self.send_json({"ok": False, "error": "bad request"}, 400)
        except Exception as exc:  # upstream failure — report, don't crash
            return self.send_json({"ok": False, "error": str(exc)[:200]}, 502)


if __name__ == "__main__":
    print("weather-radar server on http://0.0.0.0:%d (API at /api/status)" % PORT)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
