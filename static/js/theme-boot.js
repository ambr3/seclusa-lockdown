/*
 * Seclusa app theme boot — sets the saved appearance before the first paint.
 *
 * Copy this file as-is. It is the one piece of a Seclusa app that genuinely has to
 * run before anything else, and getting it wrong is visible rather than theoretical.
 *
 * Sets data-theme (light/dark/system) and data-bg (lines or a solid/custom colour).
 * There is no Day/Night sky split here — that is Weather-only.
 *
 * Two rules it follows, both of which have been learned the hard way:
 *
 *   1. Never throw. This is the first script on the page; an exception here stops
 *      later scripts loading and can leave the page unstyled entirely.
 *   2. Never assume storage exists. Private browsing and blocked-storage modes throw
 *      on *access*, not just on use, so even the existence check is inside the try.
 */

(function () {
  var KEY_THEME = "ssc.pref_key_night_mode";
  // Shooter settings live in their own key. store.js writes this same name.
  var KEY_SETTINGS = "seclusa.shooter.settings";
  var BG = {
    grid: 1, blue: 1, lightblue: 1, green: 1, red: 1,
    yellow: 1, black: 1, white: 1, custom: 1
  };
  var BG_LEGACY = {
    sky: "lightblue", ocean: "blue", slate: "black", forest: "green",
    sunset: "red", violet: "blue", rose: "red", amber: "yellow", plain: "white"
  };

  function readPref() {
    try {
      var v = localStorage.getItem(KEY_THEME);
      return v === "light" || v === "dark" ? v : null;
    } catch (err) {
      return null;
    }
  }

  function readHex(v) {
    return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null;
  }

  function readSettingsBg() {
    try {
      var raw = localStorage.getItem(KEY_SETTINGS);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      var rawBg = parsed.background;
      var bg = BG[rawBg] ? rawBg : (BG_LEGACY[rawBg] || null);
      var custom = readHex(parsed.bgCustom);
      return { bg: bg, custom: custom };
    } catch (err) {
      return null;
    }
  }

  try {
    var html = document.documentElement;
    var saved = readPref();

    if (saved) {
      html.setAttribute("data-theme", saved);
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      html.setAttribute("data-theme", "dark");
    }

    var bgInfo = readSettingsBg();
    try { html.removeAttribute("style"); } catch (err) { /* ignore */ }
    if (bgInfo && bgInfo.custom) {
      try {
        var sheet = new CSSStyleSheet();
        sheet.insertRule("html { --bg-custom: " + bgInfo.custom + "; }", 0);
        document.adoptedStyleSheets = [].concat(document.adoptedStyleSheets, sheet);
      } catch (err) {
        /* Fallback --bg-custom in CSS. */
      }
    }
    if (bgInfo && bgInfo.bg) {
      html.setAttribute("data-bg", bgInfo.bg);
      var tone = "light";
      if (bgInfo.bg === "black") {
        tone = "dark";
      } else if (bgInfo.bg === "custom" && bgInfo.custom) {
        var n = parseInt(bgInfo.custom.slice(1), 16);
        var r = ((n >> 16) & 255) / 255;
        var g = ((n >> 8) & 255) / 255;
        var b = (n & 255) / 255;
        var luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        tone = luma < 0.18 ? "dark" : "light";
      } else if (bgInfo.bg === "grid") {
        tone = null;
      }
      if (tone) html.setAttribute("data-bg-tone", tone);
      else html.removeAttribute("data-bg-tone");
    }
  } catch (err) {
    /* Storage blocked, or no matchMedia. The light default in the markup stands. */
  }
})();
