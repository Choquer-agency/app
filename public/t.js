/**
 * Choquer Agency — Website Visitor Tracking Pixel
 * Lightweight (~2KB) script for identifying website visitors.
 * Embed: <script defer src="https://portal.choqueragency.com/t.js" data-site="SITE_KEY"></script>
 */
(function () {
  "use strict";

  // Respect consent — if host page sets this to false, don't track
  if (typeof window.__ip_consent !== "undefined" && !window.__ip_consent) return;

  // Find our script tag and extract the site key
  var scripts = document.getElementsByTagName("script");
  var sk = null;
  for (var i = 0; i < scripts.length; i++) {
    if (scripts[i].src && scripts[i].src.indexOf("/t.js") !== -1) {
      sk = scripts[i].getAttribute("data-site");
      break;
    }
  }
  if (!sk) return;

  var endpoint = (function () {
    // Derive the API endpoint from the script's own origin
    for (var j = 0; j < scripts.length; j++) {
      if (scripts[j].src && scripts[j].src.indexOf("/t.js") !== -1) {
        var url = new URL(scripts[j].src);
        return url.origin + "/api/t";
      }
    }
    return "/api/t";
  })();

  // Visitor cookie — first-party, simple UUID
  var COOKIE_NAME = "_ip_vid";
  var vid = getCookie(COOKIE_NAME);
  if (!vid) {
    vid = generateId();
    setCookie(COOKIE_NAME, vid, 365);
  }

  // Session ID — new after 30 min of inactivity
  var SESSION_KEY = "_ip_sid";
  var SESSION_TS_KEY = "_ip_sts";
  var sid = sessionGet(SESSION_KEY);
  var lastActivity = parseInt(sessionGet(SESSION_TS_KEY) || "0", 10);
  var now = Date.now();
  if (!sid || (now - lastActivity) > 30 * 60 * 1000) {
    sid = generateId();
  }
  sessionSet(SESSION_KEY, sid);
  sessionSet(SESSION_TS_KEY, String(now));

  // Parse UTM params
  var params = new URLSearchParams(window.location.search);
  var utmSource = params.get("utm_source") || undefined;
  var utmMedium = params.get("utm_medium") || undefined;
  var utmCampaign = params.get("utm_campaign") || undefined;

  // Track page load
  var pageStart = Date.now();
  send({
    sk: sk,
    u: window.location.href,
    p: window.location.pathname,
    t: document.title,
    r: document.referrer || undefined,
    utm_s: utmSource,
    utm_m: utmMedium,
    utm_c: utmCampaign,
    sid: sid,
    vid: vid,
    sw: screen.width,
    sh: screen.height,
    ts: new Date().toISOString(),
  });

  // Track duration on page exit
  function sendDuration() {
    var duration = Math.round((Date.now() - pageStart) / 1000);
    if (duration < 1) return;
    var data = JSON.stringify({
      sk: sk,
      sid: sid,
      vid: vid,
      p: window.location.pathname,
      d: duration,
      ts: new Date().toISOString(),
      type: "duration",
    });
    // Use sendBeacon for reliability on unload
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, data);
    } else {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", endpoint, false); // sync for unload
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.send(data);
    }
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      sendDuration();
    }
  });

  // Helpers
  function send(data) {
    var payload = JSON.stringify(data);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, payload);
    } else {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", endpoint, true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.send(payload);
    }
  }

  function generateId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function getCookie(name) {
    var match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function setCookie(name, value, days) {
    var expires = new Date(Date.now() + days * 86400000).toUTCString();
    document.cookie = name + "=" + encodeURIComponent(value) + "; expires=" + expires + "; path=/; SameSite=Lax";
  }

  function sessionGet(key) {
    try { return sessionStorage.getItem(key); } catch (e) { return null; }
  }

  function sessionSet(key, value) {
    try { sessionStorage.setItem(key, value); } catch (e) { /* noop */ }
  }
})();
