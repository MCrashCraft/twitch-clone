#!/usr/bin/env python3
"""Weather radar server: static site + aggregating JSON API + SQLite history.

Endpoints (JSON, CORS enabled, cached briefly server-side):
  /api/status            uptime + endpoint list
  /api/alerts            active US watches/warnings/advisories (NOAA WWA, simplified geometry)
  /api/amber             active AMBER alerts (NWS Child Abduction Emergency feed)
  /api/quakes            earthquakes past 24h worldwide (USGS)
  /api/fires             confirmed active wildfire incidents (NIFC/WFIGS)
  /api/disasters         global disaster alerts (GDACS)
  /api/dispatch          recent public-safety dispatch calls (public CAD feeds)
  /api/point?lat=&lon=   current weather + air quality + 24h outlook (Open-Meteo)
  /api/history?hours=168&kind=warning|amber|dispatch|fire
                         everything seen in the last N hours (SQLite, kept 7 days)
  /api/bolo  GET         active BOLO vehicle entries (auto-extracted from AMBER + manual)
  /api/bolo  POST        add a manual BOLO: {"vehicle": "...", "plate": "...", "details": "..."}

A background thread ingests alerts/AMBER/dispatch/fires into weather-radar.sqlite
every 5 minutes; rows older than 7 days are purged.

Run:  python3 server.py [port]     (default 8777)
"""
import json
import re
import sqlite3
import sys
import threading
import time
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "weather-radar.sqlite"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
START = time.time()
RETENTION_S = 7 * 24 * 3600

WWA = ("https://mapservices.weather.noaa.gov/eventdriven/rest/services/WWA/watch_warn_adv/MapServer/{}/query"
       "?where=1%3D1&outFields=prod_type,expiration,onset,url&f=geojson&maxAllowableOffset={}")

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
_db_lock = threading.Lock()


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""CREATE TABLE IF NOT EXISTS alert_history (
        id TEXT PRIMARY KEY, kind TEXT, event TEXT, area TEXT, details TEXT,
        lat REAL, lon REAL, first_seen INTEGER, last_seen INTEGER)""")
    conn.execute("""CREATE TABLE IF NOT EXISTS bolo (
        id INTEGER PRIMARY KEY AUTOINCREMENT, created INTEGER, source TEXT,
        vehicle TEXT, plate TEXT, details TEXT)""")
    return conn


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
    if hit and now - hit[0] < TTL.get(name.split(":")[0].split("?")[0], 120):
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


VEHICLE_RE = re.compile(r"(?:vehicle(?: is)?(?: an?)?|driving(?: an?)?|traveling in(?: an?)?)[:\s]+([^.;\n]{4,90})", re.I)
PLATE_RE = re.compile(r"(?:license(?:\s+plate)?(?:\s+number)?|plate(?:\s+number)?|tag)[:#\s]+([A-Z0-9][A-Z0-9\- ]{2,9})", re.I)


def upsert(conn, row_id, kind, event, area, details, lat, lon):
    now = int(time.time())
    conn.execute(
        """INSERT INTO alert_history (id, kind, event, area, details, lat, lon, first_seen, last_seen)
           VALUES (?,?,?,?,?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen, details=excluded.details""",
        (row_id, kind, (event or "")[:120], (area or "")[:400], json.dumps(details)[:4000], lat, lon, now, now))


def ingest_once():
    with _db_lock:
        conn = db()
        try:
            try:  # storm-based warnings only (layer 0) — the interesting history
                warn = fetch_json(WWA.format(0, 0.05))
                for f in warn.get("features", []):
                    p = f.get("properties", {})
                    rid = (p.get("url") or "").strip() or (p.get("prod_type", "") + str(p.get("onset")))
                    upsert(conn, "warn|" + rid, "warning", p.get("prod_type", "").strip(),
                           "", {"onset": p.get("onset"), "expiration": p.get("expiration"), "url": p.get("url")},
                           None, None)
            except Exception:
                pass
            try:
                amber = fetch_json(UPSTREAM["amber"][0])
                for f in amber.get("features", []):
                    p = f.get("properties", {})
                    rid = p.get("id") or f.get("id") or str(p.get("sent"))
                    desc = (p.get("description") or "") + " " + (p.get("instruction") or "")
                    veh = (VEHICLE_RE.search(desc) or [None, None])[1]
                    plate = (PLATE_RE.search(desc) or [None, None])[1]
                    upsert(conn, "amber|" + rid, "amber", "Child Abduction Emergency",
                           p.get("areaDesc"), {"headline": p.get("headline"), "description": desc[:1500],
                                               "vehicle": veh, "plate": plate}, None, None)
                    if veh or plate:  # auto-BOLO from AMBER text
                        exists = conn.execute("SELECT 1 FROM bolo WHERE source=? AND details=?",
                                              ("amber:" + rid, desc[:200])).fetchone()
                        if not exists:
                            conn.execute("INSERT INTO bolo (created, source, vehicle, plate, details) VALUES (?,?,?,?,?)",
                                         (int(time.time()), "amber:" + rid, (veh or "")[:90],
                                          (plate or "")[:12], desc[:200]))
            except Exception:
                pass
            try:
                disp = build_simple("dispatch")
                for c in disp.get("calls", []):
                    upsert(conn, "disp|" + str(c.get("id")), "dispatch", c.get("type"),
                           c.get("address"), {"feed": c.get("feed"), "time": c.get("datetime_local")},
                           c.get("lat"), c.get("lon"))
            except Exception:
                pass
            try:
                fires = fetch_json(UPSTREAM["fires"][0])
                for f in fires.get("features", []):
                    p = f.get("properties", {})
                    g = (f.get("geometry") or {}).get("coordinates") or [None, None]
                    rid = (p.get("IncidentName") or "") + "|" + str(p.get("FireDiscoveryDateTime"))
                    upsert(conn, "fire|" + rid, "fire", p.get("IncidentName"),
                           "%s, %s" % (p.get("POOCounty") or "?", (p.get("POOState") or "").replace("US-", "")),
                           {"acres": p.get("IncidentSize"), "contained": p.get("PercentContained")},
                           g[1], g[0])
            except Exception:
                pass
            cutoff = int(time.time()) - RETENTION_S
            conn.execute("DELETE FROM alert_history WHERE last_seen < ?", (cutoff,))
            conn.execute("DELETE FROM bolo WHERE created < ?", (cutoff,))
            conn.commit()
        finally:
            conn.close()


def ingest_loop():
    while True:
        try:
            ingest_once()
        except Exception:
            pass
        time.sleep(300)


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
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "public, max-age=30")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_json({"ok": True})

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.rstrip("/") != "/api/bolo":
            return self.send_json({"ok": False, "error": "unknown endpoint"}, 404)
        try:
            length = min(int(self.headers.get("Content-Length", 0)), 8192)
            payload = json.loads(self.rfile.read(length).decode("utf-8", "replace") or "{}")
            vehicle = str(payload.get("vehicle", ""))[:90].strip()
            plate = str(payload.get("plate", ""))[:12].strip()
            details = str(payload.get("details", ""))[:200].strip()
            if not (vehicle or plate):
                return self.send_json({"ok": False, "error": "vehicle or plate required"}, 400)
            with _db_lock:
                conn = db()
                try:
                    count = conn.execute("SELECT COUNT(*) FROM bolo").fetchone()[0]
                    if count >= 500:
                        return self.send_json({"ok": False, "error": "bolo board full"}, 429)
                    conn.execute("INSERT INTO bolo (created, source, vehicle, plate, details) VALUES (?,?,?,?,?)",
                                 (int(time.time()), "manual", vehicle, plate, details))
                    conn.commit()
                finally:
                    conn.close()
            return self.send_json({"ok": True})
        except Exception as exc:
            return self.send_json({"ok": False, "error": str(exc)[:200]}, 400)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if not parsed.path.startswith("/api/"):
            return super().do_GET()
        name = parsed.path[len("/api/"):].strip("/")
        q = urllib.parse.parse_qs(parsed.query)
        try:
            if name == "status":
                return self.send_json({
                    "ok": True, "uptime_s": int(time.time() - START),
                    "db": DB_PATH.name, "retention_days": 7,
                    "endpoints": ["/api/" + k for k in list(UPSTREAM)] +
                                 ["/api/point?lat=&lon=", "/api/history?hours=168&kind=",
                                  "/api/bolo (GET, POST)", "/api/status"],
                })
            if name == "history":
                hours = min(int(q.get("hours", ["168"])[0]), 168)
                kind = (q.get("kind", [""])[0] or "").strip()
                cutoff = int(time.time()) - hours * 3600
                with _db_lock:
                    conn = db()
                    try:
                        sql = "SELECT id, kind, event, area, details, lat, lon, first_seen, last_seen FROM alert_history WHERE last_seen >= ?"
                        args = [cutoff]
                        if kind:
                            sql += " AND kind = ?"
                            args.append(kind)
                        rows = conn.execute(sql + " ORDER BY last_seen DESC LIMIT 2000", args).fetchall()
                    finally:
                        conn.close()
                return self.send_json({"count": len(rows), "hours": hours, "rows": [
                    {"id": r[0], "kind": r[1], "event": r[2], "area": r[3],
                     "details": json.loads(r[4] or "{}"), "lat": r[5], "lon": r[6],
                     "first_seen": r[7], "last_seen": r[8]} for r in rows]})
            if name == "bolo":
                with _db_lock:
                    conn = db()
                    try:
                        rows = conn.execute(
                            "SELECT id, created, source, vehicle, plate, details FROM bolo ORDER BY created DESC LIMIT 100"
                        ).fetchall()
                    finally:
                        conn.close()
                return self.send_json({"count": len(rows), "note": "hobby BOLO board: AMBER-derived + manual entries",
                                       "entries": [{"id": r[0], "created": r[1], "source": r[2],
                                                    "vehicle": r[3], "plate": r[4], "details": r[5]} for r in rows]})
            if name == "point":
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
    threading.Thread(target=ingest_loop, daemon=True).start()
    print("weather-radar server on http://0.0.0.0:%d (API at /api/status)" % PORT)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
