/*
 * Seclusa app — theme + page background.
 *
 * Mode: system / light / dark (theme-boot already painted before first frame).
 * Background: orange lines, named solids, or a custom hex — one setting for the
 * whole app. Day/Night sky slots are Weather-only and do not live here.
 */

(function () {
  "use strict";

  var LIGHT = "#ffffff";
  var DARK = "#0a0a0a";
  var BG_OPTS = {
    grid: 1, blue: 1, lightblue: 1, green: 1, red: 1,
    yellow: 1, black: 1, white: 1, custom: 1
  };
  var BG_LEGACY = {
    sky: "lightblue", ocean: "blue", slate: "black", forest: "green",
    sunset: "red", violet: "blue", rose: "red", amber: "yellow", plain: "white"
  };
  var BG_SOLIDS = {
    blue: "#3b82f6", lightblue: "#7dd3fc", green: "#22c55e", red: "#ef4444",
    yellow: "#facc15", black: "#0a0a0a", white: "#ffffff"
  };

  var dynSheet = null;
  var dynMap = {};

  function dynEnsure() {
    if (dynSheet) return dynSheet;
    try {
      dynSheet = new CSSStyleSheet();
      document.adoptedStyleSheets = [].concat(document.adoptedStyleSheets, dynSheet);
      return dynSheet;
    } catch (err) {
      dynSheet = null;
      return null;
    }
  }

  function dynSet(key, rule) {
    dynMap[key] = rule;
    var sheet = dynEnsure();
    if (!sheet) return;
    try {
      while (sheet.cssRules.length) sheet.deleteRule(0);
      Object.keys(dynMap).forEach(function (k) {
        try { sheet.insertRule(dynMap[k], sheet.cssRules.length); } catch (e) { /* skip */ }
      });
    } catch (err) { /* best-effort */ }
  }

  function prefersDark() {
    try {
      return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    } catch (err) {
      return false;
    }
  }

  function resolve(mode) {
    if (mode === "dark") return "dark";
    if (mode === "light") return "light";
    return prefersDark() ? "dark" : "light";
  }

  function resolveBg(mode) {
    if (BG_OPTS[mode]) return mode;
    if (BG_LEGACY[mode]) return BG_LEGACY[mode];
    return "grid";
  }

  function bgLuma(hex) {
    var m = /^#([0-9a-fA-F]{6})$/.exec(hex || "");
    if (!m) return 0.5;
    var n = parseInt(m[1], 16);
    var r = ((n >> 16) & 255) / 255;
    var g = ((n >> 8) & 255) / 255;
    var b = (n & 255) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function bgToneFor(value, customHex) {
    if (value === "grid") return null;
    if (value === "black") return "dark";
    if (value === "white" || value === "yellow" || value === "lightblue"
      || value === "blue" || value === "green" || value === "red") {
      return "light";
    }
    return bgLuma(customHex) < 0.18 ? "dark" : "light";
  }

  function apply(mode) {
    var theme = resolve(mode);
    var root = document.documentElement;
    if (root.getAttribute("data-theme") !== theme) {
      root.setAttribute("data-theme", theme);
    }
    var colour = theme === "dark" ? DARK : LIGHT;
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) {
      metas[i].setAttribute("content", colour);
    }
    return theme;
  }

  function current() {
    if (window.Store && window.Store.getTheme) return window.Store.getTheme();
    return "system";
  }

  function set(mode) {
    if (window.Store && window.Store.setTheme) window.Store.setTheme(mode);
    return apply(mode);
  }

  function applyBackground(mode, customHex) {
    var value = resolveBg(mode);
    var colour = /^#[0-9a-fA-F]{6}$/.test(customHex || "")
      ? customHex.toLowerCase()
      : "#5faff0";
    var root = document.documentElement;
    var tone = bgToneFor(value, colour);
    if (tone) root.setAttribute("data-bg-tone", tone);
    else root.removeAttribute("data-bg-tone");

    dynSet("bg-custom", "html { --bg-custom: " + colour + "; }");
    if (value === "custom") {
      dynSet(
        "bg-solid-live",
        'html[data-bg="custom"] { --bg-solid: ' + colour + "; --bg: " + colour + "; }"
      );
    } else if (value !== "grid") {
      var solid = BG_SOLIDS[value] || colour;
      dynSet(
        "bg-solid-live",
        'html[data-bg="' + value + '"] { --bg-solid: ' + solid + "; --bg: " + solid + "; }"
      );
    } else if (dynMap["bg-solid-live"]) {
      delete dynMap["bg-solid-live"];
      dynSet("bg-custom", "html { --bg-custom: " + colour + "; }");
    }

    root.setAttribute("data-bg", value);
    return value;
  }

  function paintBackground() {
    var mode = window.Store && window.Store.getBackground
      ? window.Store.getBackground()
      : "grid";
    var custom = window.Store && window.Store.getBgCustom
      ? window.Store.getBgCustom()
      : "#5faff0";
    applyBackground(mode, custom);
    paintBgChrome();
  }

  function paintBgChrome() {
    var stored = resolveBg(window.Store && window.Store.getBackground
      ? window.Store.getBackground()
      : "grid");
    var custom = window.Store && window.Store.getBgCustom
      ? window.Store.getBgCustom()
      : "#5faff0";
    var colour = /^#[0-9a-fA-F]{6}$/.test(custom) ? custom.toLowerCase() : "#5faff0";
    var picker = document.getElementById("bgCustomPicker");
    if (picker) picker.value = colour;
    dynSet("bg-custom-swatch", "#bgCustomSwatch { --swatch: " + colour + "; }");
    document.querySelectorAll("[data-bg-opt]").forEach(function (btn) {
      btn.setAttribute("aria-checked", String(btn.getAttribute("data-bg-opt") === stored));
    });
  }

  function setBackground(mode) {
    var next = resolveBg(mode);
    if (window.Store && window.Store.setBackground) window.Store.setBackground(next);
    paintBackground();
    return next;
  }

  function setCustomBackground(hex) {
    var colour = window.Store && window.Store.setBgCustom
      ? window.Store.setBgCustom(hex)
      : "#5faff0";
    paintBackground();
    return colour;
  }

  function paintModeChrome() {
    var mode = current();
    document.querySelectorAll("[data-theme-opt]").forEach(function (btn) {
      btn.setAttribute("aria-checked", String(btn.getAttribute("data-theme-opt") === mode));
    });
  }

  if (window.matchMedia) {
    var query = window.matchMedia("(prefers-color-scheme: dark)");
    var onChange = function () {
      if (current() === "system") apply("system");
    };
    if (query.addEventListener) query.addEventListener("change", onChange);
    else if (query.addListener) query.addListener(onChange);
  }

  window.Theme = {
    apply: apply,
    resolve: resolve,
    current: current,
    set: set,
    paintBackground: paintBackground,
    paintBgChrome: paintBgChrome,
    paintModeChrome: paintModeChrome,
    setBackground: setBackground,
    setCustomBackground: setCustomBackground
  };
})();
