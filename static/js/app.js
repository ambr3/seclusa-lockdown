/*
 * Seclusa Lockdown shell — sheets, overlays, rAF loop.
 */

(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  var openSheetId = null;
  var game = null;
  var raf = 0;
  var lastTs = 0;
  var looping = false;

  function syncThemeChrome() {
    if (window.Theme.paintModeChrome) window.Theme.paintModeChrome();
  }

  function showSheet(id) {
    closeSheet();
    openSheetId = id;
    var scrim = $("scrim");
    var sheet = $(id);
    if (scrim) scrim.classList.add("open");
    if (sheet) {
      sheet.classList.add("open");
      sheet.setAttribute("aria-hidden", "false");
    }
    if (id === "sheet-theme") syncThemeChrome();
    if (id === "sheet-settings") syncSettingsChrome();
  }

  function closeSheet() {
    if (openSheetId === "sheet-shop" && game && game.isShopOpen()) {
      game.closeShop();
    }
    if (openSheetId) {
      var sheet = $(openSheetId);
      if (sheet) {
        sheet.classList.remove("open");
        sheet.setAttribute("aria-hidden", "true");
      }
    }
    openSheetId = null;
    var scrim = $("scrim");
    if (scrim) scrim.classList.remove("open");
  }

  function applyAutoAim(value) {
    var on = window.GameSettings.setAutoAim(value);
    window.GameInput.setAutoAim(on);
    syncSettingsChrome();
    syncControlsBlurb();
    return on;
  }

  function applyMuted(value) {
    var on = window.GameSettings.setMuted(value);
    syncSettingsChrome();
    return on;
  }

  function syncToggle(id, on) {
    var toggle = $(id);
    if (!toggle) return;
    toggle.setAttribute("aria-checked", on ? "true" : "false");
    toggle.classList.toggle("on", on);
    var label = toggle.querySelector(".toggle-state");
    if (label) label.textContent = on ? "On" : "Off";
  }

  function syncSettingsChrome() {
    syncToggle("opt-auto-aim", window.GameSettings.getAutoAim());
    syncToggle("opt-mute", window.GameSettings.getMuted());
    var diff = window.GameSettings.getDifficulty();
    document.querySelectorAll("[data-diff-opt]").forEach(function (chip) {
      chip.setAttribute("aria-checked", String(chip.getAttribute("data-diff-opt") === diff));
    });
  }

  function syncControlsBlurb() {
    var copy = $("menu-controls");
    if (!copy) return;
    if (window.GameSettings.getAutoAim()) {
      copy.textContent = "WASD move · Shift dash · F breach · Space fire · E terminal · P pause";
    } else {
      copy.textContent = "WASD move · mouse aim · Shift dash · F breach · click fire · E terminal";
    }
  }

  function syncMenuProgress() {
    var progress = window.GameSettings.getProgress();
    var best = $("menu-best");
    if (best) {
      best.textContent = progress.bestScore
        ? ("Best score " + progress.bestScore + (progress.cleared ? " · Parts recovered" : ""))
        : "No runs yet — salvage stays on this device.";
    }
    var cont = $("btn-continue");
    if (cont) {
      var suspended = progress.suspended;
      var can = window.GameSettings.canContinue();
      cont.hidden = !can;
      cont.disabled = !can;
      if (suspended) {
        cont.textContent = suspended.patchRun
          ? "Resume — the wreck"
          : ("Resume — Deck " + ((suspended.sectorIndex | 0) + 1));
      } else if (can) {
        cont.textContent = "Continue — Deck " + (progress.unlockedSector + 1);
      }
    }
  }

  function paintShop(snapshot) {
    if (!snapshot) {
      closeSheet();
      return;
    }
    var credits = $("shop-credits");
    var ammo = $("shop-ammo");
    var hp = $("shop-hp");
    if (credits) credits.textContent = String(snapshot.score);
    if (ammo) ammo.textContent = String(snapshot.ammo);
    if (hp) hp.textContent = snapshot.hp + " / " + snapshot.maxHp;

    document.querySelectorAll("[data-shop-buy]").forEach(function (btn) {
      var id = btn.getAttribute("data-shop-buy");
      var ownedGear = (id === "shotgun" || id === "rifle" || id === "dash" || id === "hull") && snapshot.owned[id];
      var carrying = id === "breach" && snapshot.breachCharges >= 1;
      btn.disabled = !!(ownedGear || carrying);
      var tag = btn.querySelector(".shop-tag");
      if (tag) {
        tag.textContent = ownedGear || carrying ? "Carried" : tag.getAttribute("data-cost") + " cr";
      }
    });

    showSheet("sheet-shop");
  }

  function wireTheme() {
    window.Theme.apply(window.Theme.current());
    if (window.Theme.setBackground) window.Theme.setBackground("grid");
    if (window.Theme.paintBackground) window.Theme.paintBackground();
    syncThemeChrome();

    var button = $("btn-theme");
    if (button) {
      button.addEventListener("click", function () { showSheet("sheet-theme"); });
    }

    document.querySelectorAll("[data-theme-opt]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var mode = chip.getAttribute("data-theme-opt");
        if (mode !== "system" && mode !== "light" && mode !== "dark") return;
        window.Theme.set(mode);
        syncThemeChrome();
      });
    });
  }

  function wireSettings() {
    applyAutoAim(window.GameSettings.getAutoAim());
    applyMuted(window.GameSettings.getMuted());
    syncSettingsChrome();

    var btn = $("btn-settings");
    if (btn) {
      btn.addEventListener("click", function () { showSheet("sheet-settings"); });
    }

    var toggle = $("opt-auto-aim");
    if (toggle) {
      toggle.addEventListener("click", function () {
        applyAutoAim(!window.GameSettings.getAutoAim());
      });
    }

    var mute = $("opt-mute");
    if (mute) {
      mute.addEventListener("click", function () {
        applyMuted(!window.GameSettings.getMuted());
      });
    }

    document.querySelectorAll("[data-diff-opt]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        window.GameSettings.setDifficulty(chip.getAttribute("data-diff-opt"));
        syncSettingsChrome();
      });
    });
  }

  function wireShop() {
    document.querySelectorAll("[data-shop-buy]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!game) return;
        var next = game.purchase(btn.getAttribute("data-shop-buy"));
        paintShop(next);
      });
    });
    var close = $("btn-shop-close");
    if (close) {
      close.addEventListener("click", function () {
        if (game) game.closeShop();
        closeSheet();
      });
    }
  }

  function wireChrome() {
    var scrim = $("scrim");
    if (scrim) {
      scrim.addEventListener("click", function () {
        if (openSheetId === "sheet-shop") return;
        closeSheet();
      });
    }
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        if (openSheetId === "sheet-shop") {
          if (game) game.closeShop();
          closeSheet();
          return;
        }
        if (openSheetId) {
          closeSheet();
          return;
        }
        if (game && game.isPlaying() && !game.isOver()) {
          game.setPaused(!game.isPaused());
        }
      }
    });
  }

  function showOverlay(id) {
    ["overlay-menu", "overlay-over"].forEach(function (oid) {
      var el = $(oid);
      if (!el) return;
      var on = oid === id;
      el.hidden = !on;
      el.classList.toggle("hidden", !on);
    });
    window.GameInput.setEnabled(false);
  }

  function hideOverlays() {
    ["overlay-menu", "overlay-over"].forEach(function (oid) {
      var el = $(oid);
      if (!el) return;
      el.hidden = true;
      el.classList.add("hidden");
    });
    window.GameInput.setEnabled(true);
  }

  function fitCanvas() {
    var stage = $("stage");
    var canvas = $("game");
    if (!stage || !canvas || !game) return;
    var rect = stage.getBoundingClientRect();
    var cssW = Math.max(1, Math.floor(rect.width));
    var cssH = Math.max(1, Math.floor(rect.height));
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    game.resize(cssW, cssH);
  }

  function frame(ts) {
    if (!looping) return;
    var dt = lastTs ? (ts - lastTs) / 1000 : 0;
    lastTs = ts;

    var pos = game.getPlayerPos();
    var input = window.GameInput.getState(pos.x, pos.y);

    if (game.isPlaying()) {
      game.update(dt, input);
    }
    game.render();
    syncPlayHud();
    raf = window.requestAnimationFrame(frame);
  }

  function syncPlayHud() {
    var bar = $("playhud");
    if (!bar || !game || !game.hudSnapshot) return;
    var menu = $("overlay-menu");
    var menuOpen = menu && !menu.hidden && !menu.classList.contains("hidden");
    var show = game.isPlaying() && !game.isOver() && !menuOpen;
    bar.hidden = !show;
    if (!show) return;
    var hud = game.hudSnapshot();
    $("hud-score").textContent = "Score " + hud.score;
    var hpEl = $("hud-hp");
    hpEl.textContent = "HP " + hud.hp;
    hpEl.classList.toggle("is-low", hud.lowHp);
    var ammoEl = $("hud-ammo");
    ammoEl.textContent = "Ammo " + hud.ammo;
    ammoEl.classList.toggle("is-low", hud.lowAmmo);
    $("hud-weapon").textContent = hud.weapon;
    $("hud-deck").textContent = hud.deck;
    ["R", "G", "B"].forEach(function (c) {
      var chip = $("hud-card-" + c);
      if (chip) chip.classList.toggle("on", !!hud.cards[c]);
    });
    var gear = $("hud-gear");
    gear.hidden = !hud.gear;
    gear.textContent = hud.gear;
  }

  function startLoop() {
    if (looping) return;
    looping = true;
    lastTs = 0;
    raf = window.requestAnimationFrame(frame);
  }

  function stopLoop() {
    looping = false;
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
  }

  function startGame(opts) {
    closeSheet();
    hideOverlays();
    fitCanvas();
    game.start(opts || {});
    startLoop();
  }

  function endGame(score, won) {
    var title = $("over-title");
    var label = $("over-score");
    if (title) title.textContent = won ? "Parts recovered" : "Downed";
    if (label) {
      label.textContent = won
        ? ("Score: " + score + " — enough scrap to patch the ship.")
        : ("Score: " + score);
    }
    syncMenuProgress();
    showOverlay("overlay-over");
    syncPlayHud();
  }

  function goMenu() {
    closeSheet();
    if (game && game.isPlaying() && !game.isOver() && game.suspend) game.suspend();
    else game.stop();
    stopLoop();
    fitCanvas();
    if (game.paintMenuBackdrop) game.paintMenuBackdrop();
    else game.render();
    syncControlsBlurb();
    syncMenuProgress();
    showOverlay("overlay-menu");
    syncPlayHud();
  }

  function registerSw() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function () { /* offline first load */ });
    });
  }

  function boot() {
    wireTheme();
    wireSettings();
    wireShop();
    wireChrome();

    var canvas = $("game");
    if (!canvas || !window.ShooterGame || !window.GameInput || !window.GameSettings) return;

    game = window.ShooterGame.create(canvas);
    game.setOnOver(endGame);
    game.setOnShop(paintShop);
    window.GameInput.attach(canvas);

    var play = $("btn-play");
    var cont = $("btn-continue");
    var restart = $("btn-restart");
    var menu = $("btn-menu");
    if (play) play.addEventListener("click", function () { startGame({ continueRun: false }); });
    if (cont) cont.addEventListener("click", function () { startGame({ continueRun: true }); });
    if (restart) restart.addEventListener("click", function () { startGame({ continueRun: false }); });
    if (menu) menu.addEventListener("click", goMenu);
    var mainMenu = $("btn-main-menu");
    if (mainMenu) mainMenu.addEventListener("click", goMenu);

    window.addEventListener("resize", function () {
      fitCanvas();
      if (!looping) game.render();
    });

    fitCanvas();
    if (game.paintMenuBackdrop) game.paintMenuBackdrop();
    syncControlsBlurb();
    syncMenuProgress();
    showOverlay("overlay-menu");
    registerSw();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
