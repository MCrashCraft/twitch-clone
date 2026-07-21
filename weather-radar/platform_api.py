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
        elif results and results[0].get("country_code") != "US":
            # Bias toward US matches, but never override a clearly-major
            # non-US city (e.g. "Calgary" must not become Calgary Place, GA).
            if (results[0].get("population") or 0) < 100000:
                us = [r for r in results if r.get("country_code") == "US"]
                results = us or results
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

_WMO_TEXT = {
    0: "clear skies", 1: "mostly clear skies", 2: "partly cloudy skies", 3: "overcast skies",
    45: "fog", 48: "freezing fog", 51: "light drizzle", 53: "drizzle", 55: "heavy drizzle",
    56: "freezing drizzle", 57: "freezing drizzle", 61: "light rain", 63: "rain", 65: "heavy rain",
    66: "freezing rain", 67: "freezing rain", 71: "light snow", 73: "snow", 75: "heavy snow",
    77: "snow grains", 80: "rain showers", 81: "rain showers", 82: "heavy rain showers",
    85: "snow showers", 86: "snow showers", 95: "thunderstorms", 96: "thunderstorms with hail",
    99: "thunderstorms with heavy hail",
}

_COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"]

MWES_INTRO = "This is the Official MCrashCraft Weather Emergency Service."

# Universal dual formats: US first, metric/24-hour in parentheses — used in
# every spoken segment and API text so the output works for everyone.


def _fmt_time_iso(iso, offset_s=0):
    """ISO time -> '8:00 PM (20:00)'. Naive strings are treated as UTC and
    shifted by offset_s (the location's UTC offset) when provided."""
    try:
        d = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        if d.tzinfo is None:
            d = d + __import__("datetime").timedelta(seconds=offset_s)
    except Exception:
        return str(iso)
    return "%s (%s)" % (d.strftime("%I:%M %p").lstrip("0"), d.strftime("%H:%M"))


def _fmt_speed_kmh(kmh):
    return "%d miles per hour (%d kilometers per hour)" % (round(kmh * 0.621371), round(kmh))


def _fmt_temp_c(c):
    return "%d degrees Fahrenheit (%d Celsius)" % (round(c * 9 / 5 + 32), round(c))


def _radio_current(loc):
    """Cached Open-Meteo current-conditions payload (metric base, tz offset included)."""
    return _cached("radiocond:%s,%s" % (loc["lat"], loc["lon"]), 600, lambda: _fetch_json(
        "https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s"
        "&current=temperature_2m,apparent_temperature,relative_humidity_2m,"
        "wind_speed_10m,wind_gusts_10m,wind_direction_10m,weather_code&timezone=auto"
        % (loc["lat"], loc["lon"])))


def _radio_conditions_text(loc):
    """Current-conditions segment — dual units for every listener."""
    try:
        c = _radio_current(loc).get("current", {})
        t = c.get("temperature_2m")
        if t is None:
            return None
        feels = c.get("apparent_temperature")
        feels = t if feels is None else feels  # explicit: 0 degrees is a real value
        parts = ["Current conditions: %s." % _WMO_TEXT.get(c.get("weather_code"), "variable skies"),
                 "Temperature %s, feels like %s." % (_fmt_temp_c(t), _fmt_temp_c(feels))]
        ws, wg, wd = c.get("wind_speed_10m"), c.get("wind_gusts_10m"), c.get("wind_direction_10m")
        if ws is not None:
            sent = "Winds"
            if wd is not None:
                sent += " from the %s" % _COMPASS[int((wd + 22.5) // 45) % 8]
            sent += " at %s" % _fmt_speed_kmh(ws)
            if wg is not None:
                sent += ", gusting to %s" % _fmt_speed_kmh(wg)
            parts.append(sent + ".")
        rh = c.get("relative_humidity_2m")
        if rh is not None:
            parts.append("Relative humidity %d percent." % round(rh))
        return " ".join(parts)
    except Exception:
        return None


def _nws_forecast_text(loc):
    """Official NWS forecast periods, in the NWS's own wording (US only)."""
    try:
        pt = _cached("nwspt:%.2f,%.2f" % (loc["lat"], loc["lon"]), 6 * 3600, lambda: _fetch_json(
            "https://api.weather.gov/points/%.4f,%.4f" % (loc["lat"], loc["lon"])))
        furl = pt["properties"]["forecast"]
        fc = _cached("nwsfc:" + furl, 1800, lambda: _fetch_json(furl))
        periods = fc["properties"]["periods"][:4]
        if not periods:
            return None
        parts = ["Now the official National Weather Service forecast."]
        for p in periods:
            parts.append("%s. %s" % (p.get("name"), p.get("detailedForecast") or p.get("shortForecast") or ""))
        return " ".join(parts)
    except Exception:
        return None


def _radio_outlook_text(q, loc):
    """Short-term storm outlook from the HRRR summary (units match the listener)."""
    try:
        s = ep_hrrr_summary(q)["data"][0]
        if s["storm_risk"] in (None, "none"):
            return ("The short term outlook: no significant storm activity is expected "
                    "over the next %s hours." % s.get("horizon_hours", 18))
        return ("The short term outlook: storm risk is %s. Peak storm energy near %s joules "
                "per kilogram, with wind gusts to %s and up to a %s percent "
                "chance of precipitation." %
                (s["storm_risk"], round(s.get("max_cape_jkg") or 0),
                 _fmt_speed_kmh(s.get("max_gust_kmh") or 0), s.get("max_precip_prob_pct") or 0))
    except Exception:
        return None


def ep_noaa_radio(q):
    """A full continuous-broadcast cycle, NWR style: station ID, current
    conditions, alerts (tone-flagged when warnings are active), the official
    NWS forecast, short-term outlook, sign-off. The radio page loops these
    segments 24/7, refetching between cycles."""
    loc = resolve_location(q, required=True)
    # Alerts must degrade, not fail: outside NWS coverage (or during an
    # api.weather.gov outage) the rest of the broadcast still airs.
    try:
        alerts = ep_nws_alerts(q)["data"]
        alerts_ok = True
    except Exception:
        alerts, alerts_ok = [], False

    def _alert_rank(a):
        ev = (a.get("event") or "").lower()
        return 0 if "warning" in ev else (1 if "watch" in ev else 2)
    alerts.sort(key=_alert_rank)  # warnings first, so they are always spoken
    has_warning = any("warning" in (a.get("event") or "").lower() for a in alerts)

    try:
        offset_s = _radio_current(loc).get("utc_offset_seconds") or 0
    except Exception:
        offset_s = 0
    now_txt = _fmt_time_iso(datetime.now(timezone.utc).isoformat(), offset_s)
    segments = [{"name": "station", "text":
                 "%s M W E S, broadcasting continuously for %s. "
                 "The time is %s. Data refreshes every cycle." %
                 (MWES_INTRO, loc["label"], now_txt)}]

    cond = _radio_conditions_text(loc)
    if cond:
        segments.append({"name": "conditions", "text": cond})

    # Hazards: one segment per alert (never mixed), each in the fixed MWES
    # template: intro -> type -> location -> time -> details -> End of message.
    if not alerts_ok:
        segments.append({"name": "alerts", "tone": False, "text":
                         "%s Official alert information is not available for this location. "
                         "Alert coverage is provided by the U.S. National Weather Service. "
                         "The broadcast will keep retrying each cycle. End of message." % MWES_INTRO})
    elif not alerts:
        segments.append({"name": "alerts", "tone": False, "text":
                         "%s There are no active watches, warnings or advisories for %s "
                         "at this time. End of message." % (MWES_INTRO, loc["label"])})
    else:
        segments.append({"name": "alerts", "tone": False, "text":
                         "Hazard summary for %s: %d active alert%s. Each alert follows." %
                         (loc["label"], len(alerts), "" if len(alerts) == 1 else "s")})
        for a in alerts[:6]:
            ev = (a.get("event") or "Alert").strip()
            lines = [MWES_INTRO, "%s." % ev, "Location: %s." % loc["label"]]
            if a.get("expires"):
                lines.append("In effect until %s." % _fmt_time_iso(a["expires"]))
            detail = (a.get("instruction") or a.get("description") or "").split(".")[0].strip()
            if detail:
                lines.append(detail + ".")
            lines.append("End of message.")
            segments.append({"name": "alert", "alert_id": a.get("id"),
                             "tone": "warning" in ev.lower(), "text": " ".join(lines)})
        if len(alerts) > 6:
            segments.append({"name": "alerts", "tone": False, "text":
                             "Plus %d additional alert%s also in effect for this area. "
                             "End of message." % (len(alerts) - 6, "" if len(alerts) - 6 == 1 else "s")})

    fc = _nws_forecast_text(loc)
    if fc:
        segments.append({"name": "forecast", "text": fc})

    # MWES early warnings: forecast events, always labeled as forecasts.
    try:
        for w in _early_warnings(loc, offset_s)[:3]:
            segments.append({"name": "early-warning", "tone": False, "text":
                             "%s Forecast event. This is a forecast, not a current event. "
                             "%s expected around %s, in about %s. Confidence: %s. End of message." %
                             (MWES_INTRO, w["event"], w["expected_at_text"],
                              w["lead_text"], w["confidence"])})
    except Exception:
        pass

    outlook = _radio_outlook_text(q, loc)
    if outlook:
        segments.append({"name": "outlook", "text": outlook})

    segments.append({"name": "signoff", "text":
                     "That completes this broadcast cycle for %s. The broadcast repeats "
                     "continuously with fresh data. Stay weather aware." % loc["label"]})

    script = " ".join(s["text"] for s in segments)
    words = len(script.split())
    item = {"id": "nwr-%s-%d" % (hashlib.md5(script.encode()).hexdigest()[:10], len(alerts)),
            "script": script, "segments": segments, "has_warning": has_warning,
            "alerts_included": len(alerts), "alerts_spoken": min(6, len(alerts)),
            "alerts_available": alerts_ok, "word_count": words,
            "est_read_seconds": round(words / 2.6),
            "attention_tone_hz": 1050, "status": "ready"}
    return _envelope("noaa-radio", [item], loc,
                     note="NWR-style continuous broadcast cycle generated from real data "
                          "(alerts, conditions, official NWS forecast); not an actual NOAA transmission")


# ----------------------------------------------------------------------------
# 911 public dispatch calls (real: Seattle open data; mock elsewhere)
# ----------------------------------------------------------------------------

def _map_seattle(rec):
    return {"id": rec.get("incident_number") or rec.get("datetime"), "type": rec.get("type"),
            "address": rec.get("address"), "time_local": rec.get("datetime"),
            "lat": rec.get("latitude"), "lon": rec.get("longitude")}


def _map_austin(rec):
    return {"id": (rec.get("traffic_report_id") or "")[:24], "type": rec.get("issue_reported"),
            "address": rec.get("address"), "time_local": rec.get("published_date"),
            "lat": rec.get("latitude"), "lon": rec.get("longitude")}


def _map_calgary(rec):
    return {"id": (rec.get("id") or "")[:32], "type": (rec.get("description") or "Traffic incident").strip(),
            "address": (rec.get("incident_info") or "").strip(), "time_local": rec.get("start_dt"),
            "lat": rec.get("latitude"), "lon": rec.get("longitude")}


DISPATCH_FEEDS = [
    {"id": "seattle-fire-911", "label": "Seattle Fire 911",
     "lat": 47.6062, "lon": -122.3321, "coverage_km": 80, "map": _map_seattle,
     "url": "https://data.seattle.gov/resource/kzjm-xkqj.json?%24limit=60&%24order=datetime%20DESC"},
    {"id": "austin-incidents", "label": "Austin real-time incidents (police/fire CAD)",
     "lat": 30.2672, "lon": -97.7431, "coverage_km": 80, "map": _map_austin,
     "url": "https://data.austintexas.gov/resource/dx9v-zd7x.json?%24limit=60"
            "&%24order=traffic_report_status_date_time%20DESC"},
    {"id": "calgary-incidents", "label": "Calgary traffic incidents (city CAD)",
     "lat": 51.0447, "lon": -114.0719, "coverage_km": 60, "map": _map_calgary,
     "url": "https://data.calgary.ca/resource/35ra-9556.json?%24limit=60&%24order=start_dt%20DESC"},
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
            rows = _cached("disp:" + feed["id"], 60,
                           lambda url=feed["url"]: _fetch_json(url))
            calls = []
            for rec in rows:
                call = feed["map"](rec)
                try:
                    la, lo = float(call["lat"]), float(call["lon"])
                except (KeyError, TypeError, ValueError):
                    continue
                dist = _haversine_km(loc["lat"], loc["lon"], la, lo)
                if dist > radius_km:
                    continue
                calls.append({"id": call["id"], "type": call["type"],
                              "category": _call_category(call["type"]),
                              "address": call["address"], "lat": la, "lon": lo,
                              "time_local": call["time_local"], "distance_km": round(dist, 1),
                              "feed": feed["id"], "status": "dispatched"})
            calls.sort(key=lambda c: c["time_local"] or "", reverse=True)
            return feed, calls
    return None, None


_MOCK_CALL_TYPES = [
    ("Wires Down", "wires-electrical"), ("Natural Gas Leak", "gas-hazmat"),
    ("Motor Vehicle Accident", "crash-rescue"), ("Aid Response", "medical"),
    ("Brush Fire", "fire"), ("Water Rescue", "crash-rescue"),
    ("Odor Investigation", "gas-hazmat"), ("Automatic Fire Alarm", "fire"),
    ("Transformer Fire", "wires-electrical"), ("Fuel Spill", "gas-hazmat"),
]

_MOCK_STREETS = ["Main St", "Maple Ave", "Church St", "Park Rd", "Washington St",
                 "High St", "Oak Dr", "Mill Rd", "2nd St", "Franklin Ave",
                 "Cherry Ln", "State Route 122", "Union Blvd", "Water St"]


def _place_name(loc):
    """Best local name for the chosen location, never a default city.
    Empty string when only raw coordinates are known."""
    name = (loc.get("city") or (loc.get("county") or "").replace(" County", "") or "")
    if not name and loc.get("resolved_from") != "latlon":
        name = loc.get("label") or ""
    return name.split(",")[0].strip()


def _sim_calls(loc, n, categories=None):
    """Deterministic simulated CAD calls tailored to THIS location only.

    Seeded by the resolved coordinates + day, so the same place always gets the
    same data and different places always get different data.
    """
    seed = _seed("calls", loc["lat"], loc["lon"])
    place = _place_name(loc)
    now = time.time()
    out = []
    for i in range(n):
        t, cat = _MOCK_CALL_TYPES[(seed[i] + i) % len(_MOCK_CALL_TYPES)]
        if categories and cat not in categories:
            continue
        minutes_ago = (seed[(i * 3) % 32] % 170) + 3
        street = _MOCK_STREETS[(seed[(i * 2 + 1) % 32] + i) % len(_MOCK_STREETS)]
        out.append({
            "id": "SIM-%s-%03d" % (hashlib.md5(str((loc["lat"], loc["lon"], i)).encode()).hexdigest()[:6].upper(), i),
            "type": t, "category": cat,
            "address": ("%d block %s" % ((seed[i] % 90 + 1) * 100, street)) + (", " + place if place else ""),
            "lat": round(loc["lat"] + (seed[(i * 5) % 32] - 128) / 3200.0, 4),
            "lon": round(loc["lon"] + (seed[(i * 7 + 1) % 32] - 128) / 3200.0, 4),
            "time_local": datetime.fromtimestamp(now - minutes_ago * 60, timezone.utc).isoformat(timespec="minutes"),
            "minutes_ago": minutes_ago,
            "feed": "simulated-" + re.sub(r"[^a-z0-9]+", "-", place.lower()).strip("-"),
            "status": "dispatched"})
    return out


def _cad_response(endpoint, q, gas_only=False):
    """Shared CAD logic: real feed if one covers the chosen location, else
    simulated data for that location only. Never falls back to another city."""
    loc = resolve_location(q, required=True)
    radius = min(float((q.get("radius_km", ["50" if gas_only else "30"])[0]) or 30), 150)
    feed, calls = _real_calls_near(loc, radius)
    if calls is not None:  # a real public feed covers the user's chosen location
        if gas_only:
            calls = [c for c in calls if c["category"] == "gas-hazmat"]
        return _envelope(endpoint, calls, loc,
                         note="official public CAD dispatch logs (%s), not call audio" % feed["label"])
    place = _place_name(loc) or loc["label"]
    data = _sim_calls(loc, 10 if gas_only else 8, categories={"gas-hazmat"} if gas_only else None)
    return _envelope(endpoint, data, loc, mock=True,
                     note="no public real-time CAD feed exists for %s; deterministic "
                          "simulated data generated for this location only" % place)


def ep_911_calls(q):
    return _cad_response("911-public-calls", q)


def ep_cad(q):
    return _cad_response("cad", q)


def ep_gas_incidents(q):
    return _cad_response("gas-incidents", q, gas_only=True)


# ----------------------------------------------------------------------------
# Power outages (mock: national feeds are paywalled/keyed)
# ----------------------------------------------------------------------------

# British Columbia: BC Hydro publishes a real, keyless outage feed.
BC_BBOX = (48.2, 60.0, -139.5, -114.0)  # south, north, west, east


def _bc_outages(loc):
    rows = _cached("bchydro", 300, lambda: _fetch_json(
        "https://www.bchydro.com/power-outages/app/outages-map-data.json"))
    out = []
    for r in rows:
        try:
            la, lo = float(r["latitude"]), float(r["longitude"])
        except (KeyError, TypeError, ValueError):
            continue
        started = r.get("dateOff")
        out.append({
            "id": "BCH-%s" % r.get("id"),
            "utility": "BC Hydro",
            "county": r.get("municipality"), "state": "BC",
            "region": r.get("regionName"),
            "customers_out": r.get("numCustomersOut") or 0,
            "cause": r.get("cause") or "under investigation",
            "started": datetime.fromtimestamp(started / 1000, timezone.utc).isoformat(timespec="minutes") if started else None,
            "area": (r.get("area") or "")[:200],
            "lat": la, "lon": lo,
            "distance_km": round(_haversine_km(loc["lat"], loc["lon"], la, lo), 1),
            "status": r.get("crewStatusDescription") or r.get("crewStatus") or "reported"})
    out.sort(key=lambda o: o["distance_km"])
    return out


def ep_power_outages(q):
    loc = resolve_location(q, required=True)
    if BC_BBOX[0] <= loc["lat"] <= BC_BBOX[1] and BC_BBOX[2] <= loc["lon"] <= BC_BBOX[3]:
        try:
            return _envelope("power-outages", _bc_outages(loc), loc,
                             note="real outage data from BC Hydro's public feed (province-wide, "
                                  "sorted by distance to your location)")
        except Exception:
            pass  # feed down — fall through to simulated
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
                     note="simulated data: US-wide outage APIs (PowerOutage.us etc.) require paid keys. "
                          "Real data is served automatically for British Columbia (BC Hydro public feed).")


# ----------------------------------------------------------------------------
# SPC storm reports (real: today's tornado/hail/wind reports, CSV)
# ----------------------------------------------------------------------------

def _fetch_text(url, timeout=25):
    req = urllib.request.Request(url, headers={
        "User-Agent": "weather-emergency-platform (hobby)", "Accept": "text/csv, text/plain"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


_SPC_FILES = [
    ("tornado", "https://www.spc.noaa.gov/climo/reports/today_torn.csv", "F_Scale"),
    ("hail", "https://www.spc.noaa.gov/climo/reports/today_hail.csv", "Size"),
    ("wind", "https://www.spc.noaa.gov/climo/reports/today_wind.csv", "Speed"),
]


def ep_storm_reports(q):
    loc = resolve_location(q, required=False)
    radius = float((q.get("radius_km", ["0"])[0]) or 0)
    data = []
    for kind, url, mag_col in _SPC_FILES:
        try:
            text = _cached("spc:" + kind, 600, lambda u=url: _fetch_text(u))
        except Exception:
            continue
        import csv as _csv
        import io as _io
        for i, row in enumerate(_csv.DictReader(_io.StringIO(text))):
            try:
                la, lo = float(row["Lat"]), float(row["Lon"])
            except (KeyError, TypeError, ValueError):
                continue
            mag = (row.get(mag_col) or "").strip()
            if kind == "hail" and mag.isdigit():
                mag = "%.2f in" % (int(mag) / 100.0)
            elif kind == "wind" and mag.isdigit():
                mag = mag + " mph"
            elif kind == "tornado":
                mag = ("EF" + mag) if mag.isdigit() else mag  # often UNK until surveyed
            item = {"id": "spc-%s-%03d-%s" % (kind, i, hashlib.md5((str(la) + str(lo)).encode()).hexdigest()[:6]),
                    "type": kind, "magnitude": mag or "UNK",
                    "location": row.get("Location"), "county": row.get("County"),
                    "state": row.get("State"), "lat": la, "lon": lo,
                    "time_utc": (row.get("Time") or "").zfill(4) + " UTC",
                    "comments": (row.get("Comments") or "")[:300], "status": "reported"}
            if loc and radius > 0:
                d = _haversine_km(loc["lat"], loc["lon"], la, lo)
                if d > radius:
                    continue
                item["distance_km"] = round(d, 1)
            data.append(item)
    return _envelope("storm-reports", data, loc,
                     note="storm reports received by the Storm Prediction Center today "
                          "(preliminary, US; tornado ratings often UNK until surveyed)")


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
# MWES early warnings: forecast events from model data, labeled as forecasts
# ----------------------------------------------------------------------------

def _lead_text(minutes):
    if minutes < 90:
        return "%d minutes" % minutes
    return "%d hours" % round(minutes / 60)


def _early_warnings(loc, offset_s=0):
    q = {"lat": [str(loc["lat"])], "lon": [str(loc["lon"])]}
    hourly = ep_hrrr_summary(q)["data"][0].get("hourly", [])
    now = datetime.now(timezone.utc)
    out = []

    def first(cond, event, conf):
        for h in hourly:
            try:
                when = datetime.fromisoformat(h["time"]).replace(tzinfo=timezone.utc)
            except Exception:
                continue
            lead = (when - now).total_seconds() / 60
            if lead < 5 or not cond(h):
                continue
            out.append({"event": event, "kind": "forecast",
                        "expected_at": h["time"],
                        "expected_at_text": _fmt_time_iso(h["time"], offset_s),
                        "lead_minutes": round(lead), "lead_text": _lead_text(round(lead)),
                        "confidence": conf(h)})
            return

    first(lambda h: (h.get("cape") or 0) >= 1500 and (h.get("precip_prob") or 0) >= 50,
          "Thunderstorms are",
          lambda h: "high" if (h.get("cape") or 0) >= 2500 else "moderate")
    first(lambda h: (h.get("precip_mm") or 0) >= 5,
          "Heavy rain is", lambda h: "moderate")
    first(lambda h: (h.get("gust_kmh") or 0) >= 60,
          "Damaging wind gusts are", lambda h: "moderate")
    out.sort(key=lambda w: w["lead_minutes"])
    return out


def ep_early_warnings(q):
    loc = resolve_location(q, required=True)
    try:
        offset_s = _radio_current(loc).get("utc_offset_seconds") or 0
    except Exception:
        offset_s = 0
    data = _early_warnings(loc, offset_s)
    return _envelope("early-warnings", data, loc,
                     note="MWES forecast events from HRRR/GFS model data — these are "
                          "predictions with lead time, not current events")


# ----------------------------------------------------------------------------
# Safety alerts: AMBER + Blue Alert (real NWS feeds), person/vehicle extracted
# ----------------------------------------------------------------------------

_NAME_RE = re.compile(r"(?:abduct(?:ion|ed)(?: of)?|missing (?:child|person|adult)[:,]?|victim[:,]?|child(?: is)?[:,]?)\s+"
                      r"([A-Z][a-z]+(?: [A-Z][a-z]+){1,2})")


def ep_safety_alerts(q):
    loc = resolve_location(q, required=False)
    data = []
    for event, typ in (("Child Abduction Emergency", "amber"), ("Blue Alert", "blue")):
        try:
            raw = _cached("safety:" + typ, 55, lambda e=event: _fetch_json(
                "https://api.weather.gov/alerts/active?event=" + urllib.parse.quote(e)))
        except Exception:
            continue
        for f in raw.get("features", []):
            a = _norm_nws(f)
            text = (a.get("description") or "") + " " + (a.get("instruction") or "")
            a["type"] = typ
            a["person_name"] = ((_NAME_RE.search(text) or [None, None])[1] or "").strip() or None
            a["child_name"] = a["person_name"] if typ == "amber" else None
            a["vehicle"] = ((_VEHICLE_RE.search(text) or [None, None])[1] or "").strip() or None
            a["plate"] = ((_PLATE_RE.search(text) or [None, None])[1] or "").strip() or None
            first_area = (a.get("areas") or "").split(";")[0].strip()
            a["city"] = first_area or None
            a["state"] = None
            m = re.search(r",\s*([A-Z]{2})\b", a.get("areas") or "")
            if m:
                a["state"] = m.group(1)
            a["country"] = "United States"
            a["continent"] = "North America"
            data.append(a)
    if loc and loc.get("state"):
        name = STATES[loc["state"]].lower()
        data = [a for a in data
                if name in (a.get("areas") or "").lower() or (" " + loc["state"]) in (a.get("areas") or "")]
    return _envelope("safety-alerts", data, loc,
                     note="AMBER (Child Abduction Emergency) and Blue Alerts from the official "
                          "NWS dissemination feeds, with person/vehicle details extracted")


# ----------------------------------------------------------------------------
# Tropical cyclones (real: NHC via NOAA ArcGIS — outlook areas + active storms)
# ----------------------------------------------------------------------------

NHC_BASE = "https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer"

_NHC_KINDS = [
    ("Seven-Day: Potential Development Region", "outlook"),
    ("Forecast Cone", "cone"),
    ("Forecast Track", "track"),
    ("Forecast Points", "point"),
    ("Watch-Warning", "watchwarn"),
]


def ep_tropical(q):
    layers = _cached("nhc:layers", 6 * 3600, lambda: _fetch_json(NHC_BASE + "?f=json")).get("layers", [])
    data = []
    for layer in layers:
        name = layer.get("name", "")
        kind = next((k for suffix, k in _NHC_KINDS if name.endswith(suffix) or name == suffix), None)
        if not kind:
            continue
        try:
            gj = _cached("nhc:%s" % layer["id"], 900, lambda lid=layer["id"]: _fetch_json(
                NHC_BASE + "/%s/query?where=1%%3D1&outFields=*&f=geojson&maxAllowableOffset=0.02" % lid))
        except Exception:
            continue
        for f in gj.get("features", []):
            p = f.get("properties", {})
            data.append({
                "id": "nhc-%s-%s" % (layer["id"], p.get("objectid")),
                "kind": kind,
                "storm": (name.split(" ")[0] if kind != "outlook" else None),
                "name": p.get("stormname") or p.get("STORMNAME") or name,
                "basin": p.get("basin"),
                "risk_2day": p.get("risk2day"), "prob_2day": p.get("prob2day"),
                "risk_7day": p.get("risk7day"), "prob_7day": p.get("prob7day"),
                "storm_type": p.get("stormtype") or p.get("TCDVLP"),
                "max_wind_kt": p.get("maxwind") or p.get("MAXWIND"),
                "advisory_time": p.get("advdate") or p.get("ADVDATE"),
                "geometry": f.get("geometry"),
                "status": "active",
            })
    return _envelope("tropical", data, resolve_location(q, required=False),
                     note="NHC tropical weather: 7-day development outlook areas plus active "
                          "storm cones/tracks/points; empty outside of active tropical activity")


# ----------------------------------------------------------------------------
# River flood gauges (real: NOAA NWPS)
# ----------------------------------------------------------------------------

def ep_rivers(q):
    loc = resolve_location(q, required=True)
    radius = min(float((q.get("radius_km", ["120"])[0]) or 120), 400)
    dlat = radius / 111.0
    dlon = radius / max(20.0, 111.0 * math.cos(math.radians(loc["lat"])))
    url = ("https://api.water.noaa.gov/nwps/v1/gauges?bbox.xmin=%.3f&bbox.ymin=%.3f"
           "&bbox.xmax=%.3f&bbox.ymax=%.3f&srid=EPSG_4326" %
           (loc["lon"] - dlon, loc["lat"] - dlat, loc["lon"] + dlon, loc["lat"] + dlat))
    raw = _cached("nwps:%s" % url, 600, lambda: _fetch_json(url))
    data = []
    for g in raw.get("gauges", []):
        try:
            la, lo = float(g["latitude"]), float(g["longitude"])
        except (KeyError, TypeError, ValueError):
            continue
        obs = (g.get("status") or {}).get("observed") or {}
        fcst = (g.get("status") or {}).get("forecast") or {}
        data.append({
            "id": g.get("lid"), "name": g.get("name"),
            "state": (g.get("state") or {}).get("abbreviation"),
            "lat": la, "lon": lo,
            "distance_km": round(_haversine_km(loc["lat"], loc["lon"], la, lo), 1),
            "observed_ft": obs.get("primary") if obs.get("primary", -999) != -999 else None,
            "observed_category": obs.get("floodCategory"),
            "observed_time": obs.get("validTime"),
            "forecast_ft": fcst.get("primary") if fcst.get("primary", -999) != -999 else None,
            "forecast_category": fcst.get("floodCategory"),
            "status": obs.get("floodCategory") or "unknown",
        })
    data.sort(key=lambda r: r["distance_km"])
    flooding = [r for r in data if r["observed_category"] in ("action", "minor", "moderate", "major")]
    return _envelope("rivers", data, loc, extra={"flooding_now": len(flooding)},
                     note="NOAA National Water Prediction Service gauges near the location; "
                          "flood categories: action < minor < moderate < major")


# ----------------------------------------------------------------------------
# Router (consumed by server.py)
# ----------------------------------------------------------------------------

ROUTES = {
    "amber-alerts": ep_amber_alerts,
    "nws-alerts": ep_nws_alerts,
    "noaa-radio": ep_noaa_radio,
    "911-public-calls": ep_911_calls,
    "cad": ep_cad,
    "power-outages": ep_power_outages,
    "gas-incidents": ep_gas_incidents,
    "hrrr-summary": ep_hrrr_summary,
    "storm-reports": ep_storm_reports,
    "tropical": ep_tropical,
    "rivers": ep_rivers,
    "early-warnings": ep_early_warnings,
    "safety-alerts": ep_safety_alerts,
}


def handle(name, q):
    """Dispatch one platform endpoint. Raises LocationError for bad input."""
    return ROUTES[name](q)
