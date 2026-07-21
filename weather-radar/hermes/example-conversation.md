# Hermes `get_alerts` — example conversations

## 1. Alerts by city

**User:** Hermes, get NWS alerts for Eaton, Ohio.

**Hermes (tool call):**
```json
{ "name": "get_alerts", "arguments": { "endpoint": "/api/nws-alerts?city=Eaton&state=OH" } }
```

**Tool result (abridged):**
```json
{ "endpoint": "/api/nws-alerts", "status": "ok", "count": 5,
  "location": { "lat": 39.7439, "lon": -84.6366, "label": "Eaton, Ohio", "state": "OH" },
  "data": [ { "event": "Air Quality Alert", "areas": "Preble, OH; ...", "expires": "..." } ] }
```

**Hermes:** Eaton, Ohio has 5 active alerts right now. The most notable is an
Air Quality Alert for Preble County in effect until this evening; there are
also heat-related advisories. Do you want the full radio-style readout?

## 2. Storm outlook by coordinates

**User:** What's the storm risk at 39.75, -84.65 tonight?

**Hermes (tool call):**
```json
{ "name": "get_alerts", "arguments": { "endpoint": "/api/hrrr-summary?lat=39.75&lon=-84.65" } }
```

**Hermes:** The HRRR blend puts storm risk at **moderate** — peak storm energy
near 2,100 J/kg around 4 PM, gusts to ~47 km/h, about 3 mm of rain expected.

## 3. AMBER alerts by state

**User:** Any AMBER alerts in Ohio?

**Hermes (tool call):**
```json
{ "name": "get_alerts", "arguments": { "endpoint": "/api/amber-alerts?state=OH" } }
```

**Hermes:** No active AMBER alerts for Ohio right now.
