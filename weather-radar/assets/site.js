/* Shared helpers for Weather Emergency Platform feature pages. */
"use strict";
var WX = (function () {
  function parseLocation(value) {
    var v = (value || "").trim();
    var m = v.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (m) return "lat=" + m[1] + "&lon=" + m[2];
    if (/^\d{5}$/.test(v)) return "zip=" + v;
    m = v.match(/^(.+?),\s*([A-Za-z]{2}|[A-Za-z ]+)$/);
    if (m) return "city=" + encodeURIComponent(m[1].trim()) + "&state=" + encodeURIComponent(m[2].trim());
    return v ? "city=" + encodeURIComponent(v) : "";
  }

  function getLocation() {
    try { return JSON.parse(localStorage.getItem("wx-location") || "null"); }
    catch (e) { return null; }
  }

  function setLocation(query, label) {
    localStorage.setItem("wx-location", JSON.stringify({ query: query, label: label }));
  }

  function api(path, extra) {
    var loc = getLocation();
    var qs = (loc ? loc.query : "") + (extra ? (loc ? "&" : "") + extra : "");
    return fetch(path + (qs ? "?" + qs : ""), { headers: { Accept: "application/json" } })
      .then(function (r) { return r.json(); });
  }

  // Wire the standard location bar. onChange(label) fires after validation.
  function initLocBar(onChange) {
    var input = document.getElementById("loc-input");
    var btn = document.getElementById("loc-set");
    var mine = document.getElementById("loc-mine");
    var lbl = document.getElementById("loc-label");
    var loc = getLocation();
    if (loc) { lbl.textContent = "📍 " + loc.label; input.value = ""; input.placeholder = loc.label; }

    function apply(query) {
      lbl.textContent = "resolving…";
      fetch("/api/nws-alerts?" + query, { headers: { Accept: "application/json" } })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.status !== "ok") { lbl.textContent = "❌ " + (d.error || "could not resolve"); return; }
          var label = (d.location || {}).label || "location";
          setLocation(query, label);
          lbl.textContent = "📍 " + label;
          input.value = ""; input.placeholder = label;
          onChange(label);
        })
        .catch(function () { lbl.textContent = "❌ lookup failed"; });
    }

    btn.addEventListener("click", function () {
      var q = parseLocation(input.value);
      if (q) apply(q);
    });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") btn.click(); });
    if (mine) mine.addEventListener("click", function () {
      if (!navigator.geolocation) return;
      lbl.textContent = "locating…";
      navigator.geolocation.getCurrentPosition(function (pos) {
        apply("lat=" + pos.coords.latitude.toFixed(4) + "&lon=" + pos.coords.longitude.toFixed(4));
      }, function () { lbl.textContent = "❌ location denied"; });
    });
    return loc;
  }

  // NOAA-style attention tone then speech
  function tone() {
    return new Promise(function (resolve) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        var ctx = new AC();
        var osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.frequency.value = 1050; osc.type = "sine";
        gain.gain.setValueAtTime(0.22, ctx.currentTime);
        gain.gain.setTargetAtTime(0, ctx.currentTime + 0.75, 0.08);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 1.0);
        osc.onended = function () { ctx.close(); resolve(); };
        setTimeout(resolve, 1400);
      } catch (e) { resolve(); }
    });
  }

  function speak(text) {
    if (!("speechSynthesis" in window) || !text) return;
    var u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95; u.pitch = 0.9;
    window.speechSynthesis.speak(u);
  }

  function announce(text) { tone().then(function () { speak(text); }); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function needsLocation(el) {
    el.innerHTML = '<div class="card"><h3>Choose a location</h3>' +
      '<div class="meta">Enter a ZIP code, "City, ST", or "lat,lon" above to load data for your area.</div></div>';
  }

  return { parseLocation: parseLocation, getLocation: getLocation, setLocation: setLocation,
           api: api, initLocBar: initLocBar, tone: tone, speak: speak, announce: announce,
           esc: esc, needsLocation: needsLocation };
})();
