// Hermes skill handler: get_alerts (Node 18+, no dependencies).
//
// Register get_alerts.skill.json as a tool in your Hermes runtime and route
// its calls to getAlerts(endpoint). Returns parsed JSON for Hermes to use.

const BASE_URL = (process.env.WEATHER_API_BASE || "https://weather-radar.tail9775d.ts.net").replace(/\/$/, "");

const ALLOWED = ["/api/nws-alerts", "/api/amber-alerts", "/api/noaa-radio",
  "/api/911-public-calls", "/api/cad", "/api/power-outages", "/api/gas-incidents",
  "/api/hrrr-summary", "/api/storm-reports", "/api/tropical", "/api/rivers", "/api/early-warnings", "/api/safety-alerts"];

async function getAlerts(endpoint) {
  endpoint = String(endpoint || "").trim();
  const path = endpoint.split("?")[0];
  if (!ALLOWED.includes(path)) {
    return { status: "error", error: "endpoint not allowed; use one of: " + ALLOWED.join(", ") };
  }
  try {
    const resp = await fetch(BASE_URL + endpoint, {
      headers: { "User-Agent": "hermes-get-alerts", Accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });
    return await resp.json();
  } catch (err) {
    return { status: "error", error: String(err).slice(0, 200) };
  }
}

module.exports = { getAlerts };

// CLI test:  node handler.js "/api/nws-alerts?city=Eaton&state=OH"
if (require.main === module) {
  getAlerts(process.argv[2] || "/api/nws-alerts?city=Eaton&state=OH")
    .then(r => console.log(JSON.stringify(r, null, 2).slice(0, 2000)));
}
