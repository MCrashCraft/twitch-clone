#!/usr/bin/env python3
"""Weather Emergency Platform — Discord bot.

Polls the platform API (https://weather-radar.tail9775d.ts.net) per-user and
posts embeds when NEW alerts appear, with optional TTS audio attachments.

Slash commands
--------------
  /setlocation value:<"45320" | "Eaton, OH" | "39.75,-84.65">   set your location
  /mylocation                                                    show stored location
  /watch on|off          start/stop background alert monitoring in this channel
  /tts on|off            attach spoken MP3s (AMBER, NWS, 911, HRRR) to your alerts
  /alerts                on-demand NWS alerts for your location
  /amber                 on-demand AMBER alerts for your state
  /calls911              recent public 911 dispatch calls near you
  /hrrr                  HRRR storm summary for your location

Setup
-----
  1. python3 -m pip install -r requirements.txt
  2. Create a bot at https://discord.com/developers/applications
     - enable the "applications.commands" + "bot" scopes, invite it to your server
  3. export DISCORD_BOT_TOKEN="..."          (required)
     export WEATHER_API_BASE="https://weather-radar.tail9775d.ts.net"  (default shown)
  4. python3 discord_bot.py

TTS is optional: `pip install edge-tts`. Without it the bot simply skips audio.
State (user locations + seen alert IDs) persists in bot_state.sqlite.
"""
import asyncio
import io
import json
import os
import re
import sqlite3
import time
import urllib.parse

import aiohttp
import discord
from discord import app_commands

# Optional TTS backend (Microsoft Edge neural voices, free). Missing = no audio.
try:
    import edge_tts
    HAS_TTS = True
except ImportError:
    HAS_TTS = False

API_BASE = os.environ.get("WEATHER_API_BASE", "https://weather-radar.tail9775d.ts.net").rstrip("/")
TOKEN = os.environ.get("DISCORD_BOT_TOKEN")
POLL_SECONDS = 120
TTS_VOICE = "en-US-GuyNeural"
DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bot_state.sqlite")

# ---------------------------------------------------------------------------
# Persistence: user locations + which alert IDs each user has already seen
# ---------------------------------------------------------------------------


def db():
    conn = sqlite3.connect(DB)
    conn.execute("""CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY, query TEXT, label TEXT,
        channel_id INTEGER, watching INTEGER DEFAULT 0, tts INTEGER DEFAULT 0)""")
    conn.execute("""CREATE TABLE IF NOT EXISTS seen (
        user_id INTEGER, alert_id TEXT, ts INTEGER,
        PRIMARY KEY (user_id, alert_id))""")
    return conn


def parse_location(value):
    """Turn free-form user input into API query params.

    "39.75,-84.65" -> lat/lon;  "45320" -> zip;  "Eaton, OH" / "Eaton" -> city[+state]
    Returns (query_string, human_label).
    """
    v = value.strip()
    m = re.fullmatch(r"(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)", v)
    if m:
        return "lat=%s&lon=%s" % (m.group(1), m.group(2)), v
    if re.fullmatch(r"\d{5}", v):
        return "zip=" + v, "ZIP " + v
    m = re.fullmatch(r"(.+?),\s*([A-Za-z]{2}|[A-Za-z ]+)", v)
    if m:
        return ("city=%s&state=%s" % (urllib.parse.quote(m.group(1).strip()),
                                      urllib.parse.quote(m.group(2).strip()))), v
    return "city=" + urllib.parse.quote(v), v


async def api_get(session, path, query):
    """GET an API endpoint; returns parsed JSON or an {"status": "error"} dict."""
    url = "%s%s?%s" % (API_BASE, path, query)
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            return await resp.json(content_type=None)
    except Exception as exc:  # network/JSON failure — never crash the loop
        return {"status": "error", "error": str(exc)[:150], "data": []}


async def make_tts(text):
    """Render `text` to an in-memory MP3 via edge-tts; None if TTS unavailable."""
    if not HAS_TTS or not text:
        return None
    try:
        buf = io.BytesIO()
        communicate = edge_tts.Communicate(text[:1500], TTS_VOICE)
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buf.write(chunk["data"])
        buf.seek(0)
        return buf
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Embed builders — one small function per alert family
# ---------------------------------------------------------------------------

SEVERITY_COLORS = {"Extreme": 0xE91916, "Severe": 0xFF8C00, "Moderate": 0xFFD000, "Minor": 0x2EA8FF}


def embed_nws(alert, label):
    e = discord.Embed(
        title="⚠️ " + (alert.get("event") or "Weather alert"),
        description=(alert.get("headline") or "")[:250] or (alert.get("description") or "")[:250],
        color=SEVERITY_COLORS.get(alert.get("severity"), 0xB06BFF))
    e.add_field(name="Areas", value=(alert.get("areas") or "?")[:1000], inline=False)
    if alert.get("expires"):
        e.add_field(name="Expires", value=alert["expires"][:16].replace("T", " "), inline=True)
    if alert.get("severity"):
        e.add_field(name="Severity", value=alert["severity"], inline=True)
    if alert.get("instruction"):
        e.add_field(name="Instructions", value=alert["instruction"][:400], inline=False)
    e.set_footer(text="For %s · %s" % (label, alert.get("sender") or "NWS"))
    return e


def embed_amber(alert, label):
    e = discord.Embed(title="🚨 AMBER ALERT", description=(alert.get("headline") or "")[:250],
                      color=0xFF2D95)
    e.add_field(name="Areas", value=(alert.get("areas") or "?")[:1000], inline=False)
    if alert.get("vehicle"):
        e.add_field(name="Suspect vehicle", value=alert["vehicle"], inline=True)
    if alert.get("plate"):
        e.add_field(name="Plate", value=alert["plate"], inline=True)
    if alert.get("description"):
        e.add_field(name="Details", value=alert["description"][:600], inline=False)
    e.set_footer(text="For %s · NWS Child Abduction Emergency feed" % label)
    return e


def embed_call(call, label):
    e = discord.Embed(title="🚒 911 dispatch: " + (call.get("type") or "call"),
                      color=0x2EA8FF if not call.get("mock") else 0x9E9E9E)
    e.add_field(name="Address", value=call.get("address") or "?", inline=False)
    e.add_field(name="Category", value=call.get("category") or "?", inline=True)
    if call.get("distance_km") is not None:
        e.add_field(name="Distance", value="%s km" % call["distance_km"], inline=True)
    e.set_footer(text="For %s · public CAD log (not call audio)" % label)
    return e


def embed_hrrr(s, label):
    risk_color = {"none": 0x4CAF50, "low": 0xFFD000, "moderate": 0xFF8C00, "high": 0xE91916}
    e = discord.Embed(title="🌩 HRRR storm summary",
                      description="Storm risk next %sh: **%s**" % (s.get("horizon_hours"), s.get("storm_risk")),
                      color=risk_color.get(s.get("storm_risk"), 0xB06BFF))
    e.add_field(name="Max CAPE", value="%s J/kg @ %s" % (s.get("max_cape_jkg"), s.get("max_cape_at")), inline=True)
    e.add_field(name="Max gusts", value="%s km/h" % s.get("max_gust_kmh"), inline=True)
    e.add_field(name="Total precip", value="%s mm" % s.get("total_precip_mm"), inline=True)
    e.set_footer(text="For %s · %s" % (label, s.get("model")))
    return e


# ---------------------------------------------------------------------------
# Bot
# ---------------------------------------------------------------------------

intents = discord.Intents.default()
client = discord.Client(intents=intents)
tree = app_commands.CommandTree(client)


def get_user(user_id):
    conn = db()
    try:
        row = conn.execute("SELECT query, label, channel_id, watching, tts FROM users WHERE user_id=?",
                           (user_id,)).fetchone()
    finally:
        conn.close()
    if not row:
        return None
    return {"query": row[0], "label": row[1], "channel_id": row[2],
            "watching": bool(row[3]), "tts": bool(row[4])}


def upsert_user(user_id, **fields):
    conn = db()
    try:
        conn.execute("INSERT OR IGNORE INTO users (user_id) VALUES (?)", (user_id,))
        for k, v in fields.items():
            conn.execute("UPDATE users SET %s=? WHERE user_id=?" % k, (v, user_id))
        conn.commit()
    finally:
        conn.close()


def unseen(user_id, alert_ids):
    """Return the subset of alert_ids this user has NOT been notified about, and mark them."""
    conn = db()
    try:
        fresh = []
        for aid in alert_ids:
            if not aid:
                continue
            cur = conn.execute("INSERT OR IGNORE INTO seen (user_id, alert_id, ts) VALUES (?,?,?)",
                               (user_id, str(aid), int(time.time())))
            if cur.rowcount:
                fresh.append(aid)
        conn.execute("DELETE FROM seen WHERE ts < ?", (int(time.time()) - 7 * 86400,))
        conn.commit()
        return set(fresh)
    finally:
        conn.close()


def require_location(inter):
    u = get_user(inter.user.id)
    if not u or not u["query"]:
        return None
    return u


@tree.command(name="setlocation", description="Set your alert location: ZIP, 'City, ST', or 'lat,lon'")
async def setlocation(inter: discord.Interaction, value: str):
    query, label = parse_location(value)
    # Validate by asking the API to resolve it
    async with aiohttp.ClientSession() as session:
        res = await api_get(session, "/api/nws-alerts", query)
    if res.get("status") != "ok":
        await inter.response.send_message("❌ Could not resolve that location: %s" % res.get("error"), ephemeral=True)
        return
    label = (res.get("location") or {}).get("label") or label
    upsert_user(inter.user.id, query=query, label=label, channel_id=inter.channel_id)
    await inter.response.send_message("📍 Location set to **%s** (%d active alerts right now). "
                                      "Use `/watch on` to get notified here." % (label, res.get("count", 0)))


@tree.command(name="mylocation", description="Show your stored alert location")
async def mylocation(inter: discord.Interaction):
    u = get_user(inter.user.id)
    if not u:
        await inter.response.send_message("No location stored. Use `/setlocation`.", ephemeral=True)
        return
    await inter.response.send_message("📍 **%s** · watching: %s · TTS: %s" %
                                      (u["label"], u["watching"], u["tts"]), ephemeral=True)


@tree.command(name="watch", description="Turn background alert monitoring on/off in this channel")
async def watch(inter: discord.Interaction, mode: str):
    if not require_location(inter):
        await inter.response.send_message("Set a location first with `/setlocation`.", ephemeral=True)
        return
    on = mode.strip().lower() in ("on", "true", "yes", "1")
    upsert_user(inter.user.id, watching=1 if on else 0, channel_id=inter.channel_id)
    await inter.response.send_message("🔔 Watching **%s**" % ("ON — alerts will post here" if on else "OFF"))


@tree.command(name="tts", description="Attach spoken MP3 audio to your alert notifications (on/off)")
async def tts(inter: discord.Interaction, mode: str):
    on = mode.strip().lower() in ("on", "true", "yes", "1")
    if on and not HAS_TTS:
        await inter.response.send_message("TTS backend missing — run `pip install edge-tts` on the bot host.",
                                          ephemeral=True)
        return
    upsert_user(inter.user.id, tts=1 if on else 0)
    await inter.response.send_message("🔊 TTS **%s**" % ("ON" if on else "OFF"))


async def send_with_optional_tts(target, embed, tts_enabled, tts_text, filename):
    """Send an embed; attach an MP3 rendition when the user enabled TTS."""
    audio = await make_tts(tts_text) if tts_enabled else None
    if audio:
        await target.send(embed=embed, file=discord.File(audio, filename=filename))
    else:
        await target.send(embed=embed)


@tree.command(name="alerts", description="NWS alerts for your saved location")
async def alerts_cmd(inter: discord.Interaction):
    u = require_location(inter)
    if not u:
        await inter.response.send_message("Set a location first with `/setlocation`.", ephemeral=True)
        return
    await inter.response.defer()
    async with aiohttp.ClientSession() as session:
        res = await api_get(session, "/api/nws-alerts", u["query"])
        radio = await api_get(session, "/api/noaa-radio", u["query"])
    if not res.get("data"):
        await inter.followup.send("✅ No active NWS alerts for **%s**." % u["label"])
        return
    script = (radio.get("data") or [{}])[0].get("script", "")
    for a in res["data"][:4]:
        await send_with_optional_tts(inter.followup, embed_nws(a, u["label"]),
                                     u["tts"], script, "nws-alerts.mp3")
        script = None  # only attach the broadcast once


@tree.command(name="amber", description="AMBER alerts for your state")
async def amber_cmd(inter: discord.Interaction):
    u = require_location(inter)
    if not u:
        await inter.response.send_message("Set a location first with `/setlocation`.", ephemeral=True)
        return
    await inter.response.defer()
    async with aiohttp.ClientSession() as session:
        res = await api_get(session, "/api/amber-alerts", u["query"])
    if not res.get("data"):
        await inter.followup.send("✅ No active AMBER alerts for **%s**." % u["label"])
        return
    for a in res["data"][:3]:
        text = "Amber alert. %s. Suspect vehicle: %s. Plate: %s." % (
            a.get("areas"), a.get("vehicle") or "unknown", a.get("plate") or "unknown")
        await send_with_optional_tts(inter.followup, embed_amber(a, u["label"]), u["tts"], text, "amber.mp3")


@tree.command(name="calls911", description="Recent public 911 dispatch calls near your location")
async def calls_cmd(inter: discord.Interaction):
    u = require_location(inter)
    if not u:
        await inter.response.send_message("Set a location first with `/setlocation`.", ephemeral=True)
        return
    await inter.response.defer()
    async with aiohttp.ClientSession() as session:
        res = await api_get(session, "/api/911-public-calls", u["query"])
    calls = res.get("data") or []
    if not calls:
        await inter.followup.send("No recent public dispatch calls near **%s**." % u["label"])
        return
    note = " *(mock — no public feed here)*" if res.get("mock") else ""
    text = "Recent dispatch near %s. " % u["label"] + " ".join(
        "%s at %s." % (c.get("type"), c.get("address")) for c in calls[:3])
    await inter.followup.send("🚒 %d recent calls near **%s**%s" % (len(calls), u["label"], note))
    for c in calls[:3]:
        c["mock"] = res.get("mock")
        await send_with_optional_tts(inter.followup, embed_call(c, u["label"]),
                                     u["tts"], text, "calls911.mp3")
        text = None


@tree.command(name="hrrr", description="HRRR model storm summary for your location")
async def hrrr_cmd(inter: discord.Interaction):
    u = require_location(inter)
    if not u:
        await inter.response.send_message("Set a location first with `/setlocation`.", ephemeral=True)
        return
    await inter.response.defer()
    async with aiohttp.ClientSession() as session:
        res = await api_get(session, "/api/hrrr-summary", u["query"])
    if not res.get("data"):
        await inter.followup.send("HRRR summary unavailable: %s" % res.get("error"))
        return
    s = res["data"][0]
    text = ("HRRR summary for %s. Storm risk %s. Peak storm energy %s joules per kilogram. "
            "Gusts to %s kilometers per hour." %
            (u["label"], s.get("storm_risk"), s.get("max_cape_jkg"), s.get("max_gust_kmh")))
    await send_with_optional_tts(inter.followup, embed_hrrr(s, u["label"]), u["tts"], text, "hrrr.mp3")


# ---------------------------------------------------------------------------
# Background poller: new-alert detection per watching user
# ---------------------------------------------------------------------------

async def poll_loop():
    await client.wait_until_ready()
    async with aiohttp.ClientSession() as session:
        while not client.is_closed():
            conn = db()
            try:
                rows = conn.execute(
                    "SELECT user_id, query, label, channel_id, tts FROM users WHERE watching=1").fetchall()
            finally:
                conn.close()
            for user_id, query, label, channel_id, tts_on in rows:
                try:
                    channel = client.get_channel(channel_id) or await client.fetch_channel(channel_id)
                    nws = await api_get(session, "/api/nws-alerts", query)
                    amber = await api_get(session, "/api/amber-alerts", query)
                    fresh_nws = unseen(user_id, [a["id"] for a in nws.get("data", [])])
                    fresh_amber = unseen(user_id, [a["id"] for a in amber.get("data", [])])
                    for a in nws.get("data", []):
                        if a["id"] in fresh_nws:
                            text = "%s for %s, until %s." % (a.get("event"), a.get("areas"),
                                                             (a.get("expires") or "")[:16])
                            await send_with_optional_tts(channel, embed_nws(a, label),
                                                         tts_on, text, "nws-alert.mp3")
                    for a in amber.get("data", []):
                        if a["id"] in fresh_amber:
                            text = "Amber alert for %s. Vehicle %s, plate %s." % (
                                a.get("areas"), a.get("vehicle") or "unknown", a.get("plate") or "unknown")
                            await send_with_optional_tts(channel, embed_amber(a, label),
                                                         tts_on, text, "amber.mp3")
                except Exception:
                    continue  # one bad user/channel must not stop the loop
            await asyncio.sleep(POLL_SECONDS)


@client.event
async def on_ready():
    await tree.sync()
    print("Logged in as %s — API: %s — TTS: %s" % (client.user, API_BASE, HAS_TTS))


if __name__ == "__main__":
    if not TOKEN:
        raise SystemExit("Set DISCORD_BOT_TOKEN (and optionally WEATHER_API_BASE).")
    client.setup_hook = lambda: asyncio.ensure_future(poll_loop())
    client.run(TOKEN)
