#!/usr/bin/env python3
"""Hermes skill handler: get_alerts (Python).

Register `get_alerts` from get_alerts.skill.json as a tool/function in your
Hermes agent runtime, and route its calls to `get_alerts(endpoint)` below.
The handler validates the path against an allowlist, calls the platform API,
and returns the parsed JSON for Hermes to summarize.
"""
import json
import os
import urllib.parse
import urllib.request

BASE_URL = os.environ.get("WEATHER_API_BASE", "https://weather-radar.tail9775d.ts.net").rstrip("/")

ALLOWED = ("/api/nws-alerts", "/api/amber-alerts", "/api/noaa-radio",
           "/api/911-public-calls", "/api/cad", "/api/power-outages",
           "/api/gas-incidents", "/api/hrrr-summary", "/api/storm-reports", "/api/tropical", "/api/rivers")


def get_alerts(endpoint: str) -> dict:
    """Fetch one platform endpoint and return its JSON.

    endpoint: e.g. "/api/nws-alerts?city=Eaton&state=OH"
    """
    endpoint = (endpoint or "").strip()
    path = urllib.parse.urlparse(endpoint).path
    if not any(path == p for p in ALLOWED):
        return {"status": "error",
                "error": "endpoint not allowed; use one of: " + ", ".join(ALLOWED)}
    req = urllib.request.Request(BASE_URL + endpoint,
                                 headers={"User-Agent": "hermes-get-alerts", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8", "replace"))
    except Exception as exc:
        return {"status": "error", "error": str(exc)[:200]}


if __name__ == "__main__":
    import sys
    print(json.dumps(get_alerts(sys.argv[1] if len(sys.argv) > 1
                                else "/api/nws-alerts?city=Eaton&state=OH"), indent=2)[:2000])
