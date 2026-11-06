/*
 * Seclusa app — local storage.
 *
 * Everything the app knows lives on this device. There is no account, no
 * server and no network call anywhere in this file or in the app that uses it.
 * The service worker's `connect-src 'none'` makes that enforced rather than
 * promised — the browser refuses the requests even if a future edit tried to
 * make them.
 *
 * STORAGE CAN BE BLOCKED, AND NOTHING BREAKS
 *
 * Private browsing and "block all cookies" modes throw on *access* to
 * localStorage, not just on use, so even the existence check has to be inside
 * the try. When storage is unavailable the app falls back to an in-memory map:
 * the session still works, the data just does not survive a reload. That is a
 * far better failure than a blank screen, and it is why every read and write
 * below is wrapped.
 *
 * The namespaced keys below are the ones the app owns. "Clear all data" in the
 * app's settings removes exactly these, and nothing else.
 */

(function () {
  "use strict";

  var KEY_DATA = "seclusa.shooter.data";
  var KEY_SETTINGS = "seclusa.shooter.settings";

  /*
   * The theme key is the one the shared template already uses, so the
   * pre-paint script (theme-boot.js) and this file agree on one value.
   * "system" is deliberately not a value theme-boot.js honours: it falls
   * through to the OS preference, which is exactly what "system" means.
   */
  var KEY_THEME = "ssc.pref_key_night_mode";

  /*
   * Fallback for blocked storage. Same shape as localStorage, so the rest of
   * the file does not need to know which one it is talking to.
   */
  var memory = Object.create(null);

  function backing() {
    try {
      // Touching localStorage at all is enough to throw in blocked modes.
      var ls = window.localStorage;
      var probe = "__seclusa_probe__";
      ls.setItem(probe, "1");
      ls.removeItem(probe);
      return ls;
    } catch (err) {
      return null;
    }
  }

  var store = backing();

  function readRaw(key) {
    try {
      if (store) return store.getItem(key);
      return key in memory ? memory[key] : null;
    } catch (err) {
      return key in memory ? memory[key] : null;
    }
  }

  function writeRaw(key, value) {
    try {
      if (store) {
        store.setItem(key, value);
        return true;
      }
    } catch (err) {
      /* Falls through to the in-memory copy below. */
    }
    memory[key] = value;
    return false;
  }

  function removeRaw(key) {
    try {
      if (store) store.removeItem(key);
    } catch (err) {
      /* Nothing to do; the in-memory copy is cleared either way. */
    }
    delete memory[key];
  }

  function readJSON(key, fallback) {
    var raw = readRaw(key);
    if (raw === null || raw === "") return fallback;
    try {
      var parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (err) {
      // Corrupt data must not take the app down. The bad value is dropped so
      // the next write replaces it with something readable.
      removeRaw(key);
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      return writeRaw(key, JSON.stringify(value));
    } catch (err) {
      return false;
    }
  }

  // ---------------------------------------------------------------- settings

  var BG_PALETTE = {
    grid: 1, blue: 1, lightblue: 1, green: 1, red: 1,
    yellow: 1, black: 1, white: 1, custom: 1
  };
  var BG_LEGACY = {
    sky: "lightblue", ocean: "blue", slate: "black", forest: "green",
    sunset: "red", violet: "blue", rose: "red", amber: "yellow", plain: "white"
  };

  function normalizeHex(hex) {
    if (typeof hex !== "string") return null;
    var m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
    return m ? "#" + m[1].toLowerCase() : null;
  }

  function normalizeBackground(background) {
    if (BG_PALETTE[background]) return background;
    if (BG_LEGACY[background]) return BG_LEGACY[background];
    return "grid";
  }

  function getSettings() {
    var stored = readJSON(KEY_SETTINGS, {});
    if (!stored || typeof stored !== "object") stored = {};
    return {
      theme: stored.theme === "light" || stored.theme === "dark" ? stored.theme : "system",
      background: normalizeBackground(stored.background),
      bgCustom: normalizeHex(stored.bgCustom) || "#5faff0"
    };
  }

  function setSettings(patch) {
    /* Merge into the raw bag so unknown keys (and background) are not wiped. */
    var stored = readJSON(KEY_SETTINGS, {});
    if (!stored || typeof stored !== "object") stored = {};
    for (var k in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, k) && patch[k] != null) {
        stored[k] = patch[k];
      }
    }
    writeJSON(KEY_SETTINGS, stored);
    return getSettings();
  }

  function getTheme() {
    try {
      var v = window.localStorage.getItem(KEY_THEME);
      if (v === "light" || v === "dark") return v;
    } catch (err) {
      /* Fall through. */
    }
    return getSettings().theme;
  }

  /**
   * Writes the theme in two places on purpose.
   *
   * The key the template's pre-paint script reads has to hold "light" or
   * "dark" for that script to act on it; when the choice is "system" we store
   * that separately and clear the pre-paint key, so the script follows the OS.
   */
  function setTheme(theme) {
    var value = theme === "light" || theme === "dark" ? theme : "system";
    setSettings({ theme: value });
    try {
      if (value === "system") window.localStorage.removeItem(KEY_THEME);
      else window.localStorage.setItem(KEY_THEME, value);
    } catch (err) {
      writeRaw(KEY_THEME, value);
    }
    return value;
  }

  /** One page background for the whole app — not Day/Night (Weather-only). */
  function getBackground() {
    return getSettings().background;
  }

  function setBackground(background) {
    var value = normalizeBackground(background);
    setSettings({ background: value });
    return value;
  }

  function getBgCustom() {
    return getSettings().bgCustom;
  }

  function setBgCustom(hex) {
    var value = normalizeHex(hex) || "#5faff0";
    setSettings({ bgCustom: value, background: "custom" });
    return value;
  }

  // -------------------------------------------------------------------- data

  function getData() {
    var value = readJSON(KEY_DATA, {});
    return value && typeof value === "object" ? value : {};
  }

  function setData(value) {
    writeJSON(KEY_DATA, value);
    return value;
  }

  /** Removes everything the app owns, and nothing else. */
  function clearAll() {
    removeRaw(KEY_DATA);
    removeRaw(KEY_SETTINGS);
    removeRaw(KEY_THEME);
  }

  window.Store = {
    getData: getData,
    setData: setData,
    getSettings: getSettings,
    setSettings: setSettings,
    getTheme: getTheme,
    setTheme: setTheme,
    getBackground: getBackground,
    setBackground: setBackground,
    getBgCustom: getBgCustom,
    setBgCustom: setBgCustom,
    clearAll: clearAll,
    isPersistent: function () {
      return !!store;
    }
  };
})();
