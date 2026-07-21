#!/usr/bin/env python3
"""Weather Emergency Platform API.

Location-aware endpoints, mounted by server.py on the same port as the site:

  /api/amber-alerts       ?state=OH | ?lat=&lon= | ?zip= | ?city=       (real: NWS CAE feed)
  /api/nws-alerts         ?lat=&lon= | ?zip= | ?city=&state= | ?state=  (real: api.weather.gov)
  /api/noaa-radio         ?lat=&lon= | ?zip= | ?city=                   (real alerts -> NWR-style script)
  /api/911-public-calls   ?lat=&lon= | ?zip= | ?city=  [&radius_km=30]  (real near Seattle; mock elsewhere)
  /api/power-outages      ?county=&state= | ?lat=&lon= | ?zip=          (mock: no keyless national feed)
  /api/gas-incidents      ?lat=&lon= | ?zip= | ?city=                   (real-derived near Seattle; mock elsewhere)
  /api/hrrr-summary       ?lat=&lon= | ?zip= | ?city=                   (real: Open-Meteo GFS/HRRR blend)

Every response is normalized:
  { "endpoint", "status": "ok", "generated": iso8601-utc, "mock": bool,
    "location": {...}|null, "count": int, "data": [ {id, ..., status}, ... ] }

Location parameters accepted everywhere: lat+lon, zip, city [+state], county [+state], state.
Real data is used whenever a free, keyless, legal feed exists; otherwise deterministic
mock data is returned with "mock": true and an explanatory "note".
"""
import hashlib
import json
import math
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

# ----------------------------------------------------------------------------
# Shared helpers
# ----------------------------------------------------------------------------

_cache = {}


def _cached(key, ttl, builder):
    now = time.time()
    hit = _cache.get(key)
    if hit and now - hit[0] < ttl:
        return hit[1]
    value = builder()
    _cache[key] = (now, value)
    return value


def _fetch_json(url, timeout=25):
    req = urllib.request.Request(url, headers={
        "User-Agent": "weather-emergency-platform (hobby; github.com/MCrashCraft/twitch-clone)",
        "Accept": "application/geo+json, application/json",
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8", "replace"))


def _now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _seed(*parts):
    """Deterministic pseudo-random source so mock data is stable per location+day."""
    day = datetime.now(timezone.utc).strftime("%Y%m%d")
    h = hashlib.sha256(("|".join(str(p) for p in parts) + day).encode()).digest()
    return list(h)


STATES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California",
    "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "FL": "Florida", "GA": "Georgia",
    "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa",
    "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
    "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire",
    "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York", "NC": "North Carolina",
    "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania",
    "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee",
    "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
    "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming", "DC": "District of Columbia",
    "PR": "Puerto Rico",
}
NAME_TO_CODE = {v.lower(): k for k, v in STATES.items()}


def _state_code(value):
    if not value:
        return None
    v = value.strip()
    if v.upper() in STATES:
        return v.upper()
    return NAME_TO_CODE.get(v.lower())


class LocationError(ValueError):
    pass


def resolve_location(q, required=True):
    """Resolve lat/lon | zip | city [+state] | county [+state] | state -> normalized location.

    Returns None when nothing was provided and required=False.
    """
    def one(name):
        return (q.get(name, [""])[0] or "").strip()

    lat, lon = one("lat"), one("lon")
    zip_code = one("zip")
    city, county = one("city"), one("county")
    state = _state_code(one("state"))

    if lat and lon:
        try:
            la, lo = float(lat), float(lon)
        except ValueError:
            raise LocationError("lat/lon must be numeric")
        if not (-90 <= la <= 90 and -180 <= lo <= 180):
            raise LocationError("lat/lon out of range")
        return {"lat": round(la, 4), "lon": round(lo, 4), "city": city or None,
                "county": county or None, "state": state, "label": "%.3f, %.3f" % (la, lo),
                "resolved_from": "latlon"}

    if zip_code:
        if not re.fullmatch(r"\d{5}", zip_code):
            raise LocationError("zip must be 5 digits")
        data = _cached("zip:" + zip_code, 86400,
                       lambda: _fetch_json("https://api.zippopotam.us/us/" + zip_code))
        place = (data.get("places") or [{}])[0]
        return {"lat": round(float(place["latitude"]), 4), "lon": round(float(place["longitude"]), 4),
                "city": place.get("place name"), "county": county or None,
                "state": _state_code(place.get("state abbreviation") or place.get("state")),
                "label": "%s, %s %s" % (place.get("place name"), place.get("state abbreviation"), zip_code),
                "resolved_from": "zip"}

    query = None
    if city:
        query = city
    elif county:
        query = county + " County"
    if query:
        url = ("https://geocoding-api.open-meteo.com/v1/search?count=5&language=en&format=json&name=" +
               urllib.parse.quote(query))
        data = _cached("geo:" + query + ":" + (state or ""), 86400, lambda: _fetch_json(url))
        results = data.get("results") or []
        if state:  # prefer a match inside the requested state
            named = [r for r in results if _state_code(r.get("admin1", "")) == state]
            results = named or results
        results = [r for r in results if r.get("country_code") == "US"] or results
        if not results:
            raise LocationError("could not geocode: " + query)
        r = results[0]
        return {"lat": round(r["latitude"], 4), "lon": round(r["longitude"], 4),
                "city": city or None, "county": county or (r.get("admin2") or None),
                "state": state or _state_code(r.get("admin1", "")),
                "label": ", ".join(x for x in [r.get("name"), r.get("admin1")] if x),
                "resolved_from": "city" if city else "county"}

    if state:
        r = _cached("geo:state:" + state, 86400, lambda: _fetch_json(
            "https://geocoding-api.open-meteo.com/v1/search?count=1&name=" +
            urllib.parse.quote(STATES[state])))
        res = (r.get("results") or [{}])[0]
        return {"lat": round(res.get("latitude", 0), 4), "lon": round(res.get("longitude", 0), 4),
                "city": None, "county": None, "state": state, "label": STATES[state],
                "resolved_from": "state"}

    if required:
        raise LocationError("provide lat+lon, zip, city, county or state")
    return None


def _envelope(endpoint, data, location=None, mock=False, note=None, extra=None):
    out = {"endpoint": "/api/" + endpoint, "status": "ok", "generated": _now_iso(),
           "mock": bool(mock), "location": location, "count": len(data), "data": data}
    if note:
        out["note"] = note
    if extra:
        out.update(extra)
    return out


# ----------------------------------------------------------------------------
# AMBER + NWS alerts (real: api.weather.gov)
# ----------------------------------------------------------------------------

_VEHICLE_RE = re.compile(r"(?:vehicle(?: is)?(?: an?)?|driving(?: an?)?|traveling in(?: an?)?)[:\s]+([^.;\n]{4,90})", re.I)
_PLATE_RE = re.compile(r"(?:license(?:\s+plate)?(?:\s+number)?|plate(?:\s+number)?|tag)[:#\s]+([A-Z0-9][A-Z0-9\- ]{2,9})", re.I)


def _norm_nws(f):
    p = f.get("properties", {})
    return {
        "id": p.get("id") or f.get("id"),
        "event": p.get("event"),
        "severity": p.get("severity"),
        "urgency": p.get("urgency"),
        "certainty": p.get("certainty"),
        "headline": p.get("headline"),
        "areas": p.get("areaDesc"),
        "sent": p.get("sent"),
        "onset": p.get("onset"),
        "expires": p.get("expires"),
        "description": (p.get("description") or "")[:900],
        "instruction": (p.get("instruction") or "")[:400],
        "sender": p.get("senderName"),
        "status": "active",
    }


def ep_nws_alerts(q):
    loc = resolve_location(q, required=True)
    if loc["resolved_from"] in ("latlon", "zip", "city", "county"):
        url = "https://api.weather.gov/alerts/active?status=actual&point=%s,%s" % (loc["lat"], loc["lon"])
    else:
        url = "https://api.weather.gov/alerts/active?status=actual&area=" + loc["state"]
    raw = _cached("nws:" + url, 90, lambda: _fetch_json(url))
    data = [_norm_nws(f) for f in raw.get("features", [])]
    county = (loc.get("county") or "").lower().replace(" county", "")
    if county and loc["resolved_from"] == "state":
        data = [a for a in data if county in (a["areas"] or "").lower()]
    return _envelope("nws-alerts", data, loc)


def ep_amber_alerts(q):
    loc = resolve_location(q, required=False)
    raw = _cached("amber", 90, lambda: _fetch_json(
        "https://api.weather.gov/alerts/active?event=Child%20Abduction%20Emergency"))
    data = []
    for f in raw.get("features", []):
        a = _norm_nws(f)
        text = (f.get("properties", {}).get("description") or "") + " " + \
               (f.get("properties", {}).get("instruction") or "")
        a["vehicle"] = ((_VEHICLE_RE.search(text) or [None, None])[1] or "").strip() or None
        a["plate"] = ((_PLATE_RE.search(text) or [None, None])[1] or "").strip() or None
        a["event"] = "AMBER Alert (Child Abduction Emergency)"
        data.append(a)
    if loc and loc.get("state"):
        name = STATES[loc["state"]].lower()
        data = [a for a in data
                if name in (a["areas"] or "").lower() or (" " + loc["state"]) in (a["areas"] or "")]
    return _envelope("amber-alerts", data, loc)


# ----------------------------------------------------------------------------
# NOAA-radio-style broadcast script (synthesized from real alerts)
# ----------------------------------------------------------------------------

def ep_noaa_radio(q):
    loc = resolve_location(q, required=True)
    alerts = ep_nws_alerts(q)["data"]
    lines = ["This is a synthesized weather radio broadcast for %s." % loc["label"]]
    if not alerts:
        lines.append("No active watches, warnings or advisories for this location. "
                     "Stay weather aware.")
    else:
        lines.append("There %s %d active alert%s." %
                     ("is" if len(alerts) == 1 else "are", len(alerts), "" if len(alerts) == 1 else "s"))
        for a in alerts[:6]:
            seg = "%s for %s." % (a["event"], (a["areas"] or "the area").split(";")[0])
            if a["expires"]:
                seg += " In effect until %s." % a["expires"][:16].replace("T", " at ")
            if a["instruction"]:
                seg += " " + a["instruction"].split(".")[0] + "."
            lines.append(seg)
        lines.append("Repeating: %d active alert%s for %s." %
                     (len(alerts), "" if len(alerts) == 1 else "s", loc["label"]))
    script = " ".join(lines)
    item = {"id": "nwr-%s-%d" % (hashlib.md5(script.encode()).hexdigest()[:10], len(alerts)),
            "script": script, "alerts_included": len(alerts),
            "word_count": len(script.split()), "est_read_seconds": round(len(script.split()) / 2.6),
            "attention_tone_hz": 1050, "status": "ready"}
    return _envelope("noaa-radio", [item], loc,
                     note="NWR-style script generated from real active alerts; "
                          "not an actual NOAA Weather Radio transmission")


# ----------------------------------------------------------------------------
# 911 public dispatch calls (real: Seattle open data; mock elsewhere)
# ----------------------------------------------------------------------------

DISPATCH_FEEDS = [
    {"id": "seattle-fire-911", "label": "Seattle Fire 911",
     "lat": 47.6062, "lon": -122.3321, "coverage_km": 80,
     "url": "https://data.seattle.gov/resource/kzjm-xkqj.json?%24limit=60&%24order=datetime%20DESC"},
]

_CALL_CATEGORIES = [
    (re.compile(r"wire|electric|power|pole|transformer", re.I), "wires-electrical"),
    (re.compile(r"gas|hazmat|spill|leak|odor|fuel", re.I), "gas-hazmat"),
    (re.compile(r"fire|smoke|brush|alarm", re.I), "fire"),
    (re.compile(r"mvi|mva|collision|crash|rescue|extric|pedestrian", re.I), "crash-rescue"),
    (re.compile(r"aid|medic|acuity", re.I), "medical"),
]


def _call_category(t):
    for rx, cat in _CALL_CATEGORIES:
        if rx.search(t or ""):
            return cat
    return "other"


def _real_calls_near(loc, radius_km):
    for feed in DISPATCH_FEEDS:
        if _haversine_km(loc["lat"], loc["lon"], feed["lat"], feed["lon"]) <= feed["coverage_km"]:
            rows = _cached("disp:" + feed["id"], 60, lambda: _fetch_json(feed["url"]))
            calls = []
            for rec in rows:
                try:
                    la, lo = float(rec["latitude"]), float(rec["longitude"])
                except (KeyError, TypeError, ValueError):
                    continue
                dist = _haversine_km(loc["lat"], loc["lon"], la, lo)
                if dist > radius_km:
                    continue
                calls.append({"id": rec.get("incident_number") or rec.get("datetime"),
                              "type": rec.get("type"), "category": _call_category(rec.get("type")),
                              "address": rec.get("address"), "lat": la, "lon": lo,
                              "time_local": rec.get("datetime"), "distance_km": round(dist, 1),
                              "feed": feed["id"], "status": "dispatched"})
            calls.sort(key=lambda c: c["time_local"] or "", reverse=True)
            return feed, calls
    return None, None


_MOCK_CALL_TYPES = [
    ("Wires Down", "wires-electrical"), ("Natural Gas Leak", "gas-hazmat"),
    ("Motor Vehicle Accident", "crash-rescue"), ("Aid Response", "medical"),
    ("Brush Fire", "fire"), ("Water Rescue", "crash-rescue"),
    ("Odor Investigation", "gas-hazmat"), ("Automatic Fire Alarm", "fire"),
]


def _mock_calls(loc, n, categories=None):
    seed = _seed("calls", loc["lat"], loc["lon"])
    out = []
    for i in range(n):
        t, cat = _MOCK_CALL_TYPES[(seed[i] + i) % len(_MOCK_CALL_TYPES)]
        if categories and cat not in categories:
            continue
        minutes_ago = (seed[(i * 3) % 32] % 170) + 3
        out.append({
            "id": "MOCK-%s-%03d" % (hashlib.md5(str((loc["lat"], loc["lon"], i)).encode()).hexdigest()[:6].upper(), i),
            "type": t, "category": cat,
            "address": "%d block, simulated street %d" % ((seed[i] % 90 + 1) * 100, i + 1),
            "lat": round(loc["lat"] + (seed[(i * 5) % 32] - 128) / 3200.0, 4),
            "lon": round(loc["lon"] + (seed[(i * 7 + 1) % 32] - 128) / 3200.0, 4),
            "time_local": datetime.now(timezone.utc).isoformat(timespec="minutes"),
            "minutes_ago": minutes_ago, "feed": "mock", "status": "dispatched"})
    return out


def ep_911_calls(q):
    loc = resolve_location(q, required=True)
    radius = min(float((q.get("radius_km", ["30"])[0]) or 30), 150)
    feed, calls = _real_calls_near(loc, radius)
    if calls is not None:
        return _envelope("911-public-calls", calls, loc,
                         note="official public CAD dispatch logs (%s), not call audio" % feed["label"])
    return _envelope("911-public-calls", _mock_calls(loc, 8), loc, mock=True,
                     note="no free public real-time CAD feed covers this area; deterministic mock data. "
                          "Real feeds configured: " + ", ".join(f["label"] for f in DISPATCH_FEEDS))


def ep_gas_incidents(q):
    loc = resolve_location(q, required=True)
    radius = min(float((q.get("radius_km", ["50"])[0]) or 50), 150)
    feed, calls = _real_calls_near(loc, radius)
    if calls is not None:
        gas = [c for c in calls if c["category"] == "gas-hazmat"]
        return _envelope("gas-incidents", gas, loc,
                         note="gas/hazmat dispatch calls from %s public CAD data" % feed["label"])
    return _envelope("gas-incidents", _mock_calls(loc, 10, categories={"gas-hazmat"}), loc, mock=True,
                     note="no free public feed covers this area; deterministic mock data")


# ----------------------------------------------------------------------------
# Power outages (mock: national feeds are paywalled/keyed)
# ----------------------------------------------------------------------------

def ep_power_outages(q):
    loc = resolve_location(q, required=True)
    seed = _seed("power", loc["lat"], loc["lon"])
    county = loc.get("county") or "Local"
    utilities = ["%s Power & Light" % (loc.get("state") or "Regional"),
                 "%s Electric Cooperative" % county.replace(" County", ""),
                 "Municipal Utilities"]
    causes = ["equipment failure", "vehicle vs. pole", "storm damage", "tree on line", "planned maintenance"]
    data = []
    for i in range(3 + seed[0] % 4):
        started_min = (seed[(i * 2) % 32] % 300) + 10
        data.append({
            "id": "OUT-%s-%02d" % (hashlib.md5(str((loc["lat"], loc["lon"], "o", i)).encode()).hexdigest()[:6].upper(), i),
            "utility": utilities[i % len(utilities)],
            "county": county, "state": loc.get("state"),
            "customers_out": (seed[(i * 3 + 2) % 32] + 1) * (7 + i * 11),
            "cause": causes[seed[(i * 5 + 1) % 32] % len(causes)],
            "started": datetime.now(timezone.utc).isoformat(timespec="minutes"),
            "minutes_elapsed": started_min,
            "est_restoration_minutes": started_min + 45 + seed[i] % 120,
            "lat": round(loc["lat"] + (seed[(i * 5) % 32] - 128) / 2000.0, 4),
            "lon": round(loc["lon"] + (seed[(i * 7 + 3) % 32] - 128) / 2000.0, 4),
            "status": "crews assigned" if seed[i] % 3 else "assessing"})
    return _envelope("power-outages", data, loc, mock=True,
                     note="mock data: US-wide outage APIs (PowerOutage.us etc.) require paid keys. "
                          "Shape matches a real integration; swap in a keyed source when available.")


# ----------------------------------------------------------------------------
# HRRR summary (real: Open-Meteo GFS endpoint blends HRRR for CONUS short-term)
# ----------------------------------------------------------------------------

def ep_hrrr_summary(q):
    loc = resolve_location(q, required=True)
    url = ("https://api.open-meteo.com/v1/gfs?latitude=%s&longitude=%s"
           "&hourly=temperature_2m,cape,precipitation,precipitation_probability,wind_gusts_10m"
           "&forecast_hours=18&timezone=UTC" % (loc["lat"], loc["lon"]))
    raw = _cached("hrrr:%s,%s" % (loc["lat"], loc["lon"]), 600, lambda: _fetch_json(url))
    h = raw.get("hourly", {})
    times = h.get("time", [])
    n = len(times)

    def series(name):
        return [v for v in (h.get(name) or [None] * n)]

    cape, precip = series("cape"), series("precipitation")
    gusts, pop = series("wind_gusts_10m"), series("precipitation_probability")

    def peak(vals):
        best_i, best_v = 0, -1
        for i, v in enumerate(vals):
            if v is not None and v > best_v:
                best_i, best_v = i, v
        return best_i, (best_v if best_v >= 0 else None)

    ci, cv = peak(cape)
    gi, gv = peak(gusts)
    total_precip = round(sum(v for v in precip if v), 2)
    risk = "none"
    if cv is not None:
        if cv >= 2500 or (gv or 0) >= 90:
            risk = "high"
        elif cv >= 1000 or (gv or 0) >= 65:
            risk = "moderate"
        elif cv >= 300 or total_precip >= 5:
            risk = "low"
    item = {
        "id": "hrrr-%s-%s" % (loc["lat"], loc["lon"]),
        "model": "HRRR/GFS blend (Open-Meteo /v1/gfs)",
        "horizon_hours": n,
        "storm_risk": risk,
        "max_cape_jkg": cv, "max_cape_at": times[ci] if n else None,
        "max_gust_kmh": gv, "max_gust_at": times[gi] if n else None,
        "total_precip_mm": total_precip,
        "max_precip_prob_pct": max((v for v in pop if v is not None), default=None),
        "hourly": [{"time": times[i], "cape": cape[i], "precip_mm": precip[i],
                    "precip_prob": pop[i], "gust_kmh": gusts[i]} for i in range(n)],
        "status": "ok",
    }
    return _envelope("hrrr-summary", [item], loc)


# ----------------------------------------------------------------------------
# Router (consumed by server.py)
# ----------------------------------------------------------------------------

ROUTES = {
    "amber-alerts": ep_amber_alerts,
    "nws-alerts": ep_nws_alerts,
    "noaa-radio": ep_noaa_radio,
    "911-public-calls": ep_911_calls,
    "power-outages": ep_power_outages,
    "gas-incidents": ep_gas_incidents,
    "hrrr-summary": ep_hrrr_summary,
}


def handle(name, q):
    """Dispatch one platform endpoint. Raises LocationError for bad input."""
    return ROUTES[name](q)
