/* Facing, minimap placement, and the menu closing sheets. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const jsDir = join(here, "..", "static", "js");

function load(file, win) {
  const source = readFileSync(join(jsDir, file), "utf8");
  new Function("window", "document", "navigator", "getComputedStyle", source)(
    win,
    win.document,
    win.navigator,
    win.getComputedStyle
  );
  return win;
}

function mockCanvas(width, height) {
  const calls = [];
  const grad = { addColorStop() {} };
  const canvas = {
    width,
    height,
    style: {},
    calls,
    getContext() {
      return ctx;
    },
    getBoundingClientRect() {
      return { width, height, top: 0, left: 0, right: width, bottom: height };
    },
  };
  const ctx = new Proxy(
    { canvas, measureText: () => ({ width: 40 }) },
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (prop === "createLinearGradient" || prop === "createRadialGradient") {
          return () => grad;
        }
        return (...args) => {
          calls.push([prop, args]);
        };
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    }
  );
  return canvas;
}

function settingsStub() {
  const progress = {
    autoAim: false,
    muted: false,
    difficulty: "normal",
    bestScore: 0,
    cleared: false,
    unlockedSector: 0,
    owned: {},
  };
  return {
    getAutoAim: () => progress.autoAim,
    setAutoAim: (v) => {
      progress.autoAim = !!v;
      return progress.autoAim;
    },
    getMuted: () => progress.muted,
    setMuted: (v) => {
      progress.muted = !!v;
      return progress.muted;
    },
    getDifficulty: () => progress.difficulty,
    setDifficulty: (v) => {
      progress.difficulty = v;
      return v;
    },
    difficultyMods: () => ({ spawn: 1, enemySpeed: 1, enemyHp: 1, ammo: 1, playerSpeed: 1 }),
    getProgress: () => progress,
    write: (patch) => {
      if (patch && patch.clearSuspended) progress.suspended = null;
      else if (patch && patch.suspended) progress.suspended = patch.suspended;
      if (patch && typeof patch.bestScore === "number") progress.bestScore = patch.bestScore;
      return progress;
    },
    canContinue: () => !!progress.suspended,
  };
}

function bootWindow(canvas) {
  const ids = [
    "game", "stage", "scrim",
    "sheet-theme", "sheet-settings", "sheet-shop",
    "btn-theme", "btn-settings", "btn-play", "btn-continue", "btn-restart",
    "btn-menu", "btn-main-menu", "btn-shop-close",
    "opt-auto-aim", "opt-mute",
    "menu-controls", "menu-best",
    "overlay-menu", "overlay-over", "over-title", "over-score",
    "shop-credits", "shop-ammo", "shop-hp",
  ];
  const nodes = new Map();
  function make(id) {
    const classes = new Set();
    const attrs = {};
    const listeners = {};
    const node = {
      id,
      hidden: false,
      disabled: false,
      textContent: "",
      style: {},
      classList: {
        add(c) { classes.add(c); },
        remove(c) { classes.delete(c); },
        contains(c) { return classes.has(c); },
        toggle(c, on) {
          const next = on === undefined ? !classes.has(c) : !!on;
          if (next) classes.add(c);
          else classes.delete(c);
        },
      },
      setAttribute(k, v) { attrs[k] = String(v); },
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      click() { (listeners.click || []).forEach((fn) => fn({})); },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      getBoundingClientRect() {
        return { width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600 };
      },
    };
    nodes.set(id, node);
    return node;
  }
  ids.forEach(make);
  nodes.set("game", canvas);

  const win = {
    devicePixelRatio: 2,
    document: {
      readyState: "complete",
      documentElement: {},
      getElementById: (id) => nodes.get(id) || null,
      querySelectorAll: () => [],
      addEventListener() {},
    },
    navigator: {},
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    requestAnimationFrame() { return 1; },
    cancelAnimationFrame() {},
    addEventListener() {},
  };
  win.nodes = nodes;
  return win;
}

test("facing follows aim and movement", () => {
  const canvas = mockCanvas(800, 600);
  const win = bootWindow(canvas);
  const { GameMap } = load("map.js", win);
  win.GameMap = GameMap;
  win.GameSettings = settingsStub();
  const { ShooterGame } = load("game.js", win);
  const game = ShooterGame.create(canvas);
  game.resize(400, 300);
  game.start({});
  const idle = {
    moveX: 0, moveY: 0, aimX: 0, aimY: 0, hasAim: false,
    shooting: false, autoAim: false, interact: false,
  };
  game.update(0.016, { ...idle, hasAim: true, aimX: 0, aimY: 1 });
  assert.ok(Math.abs(game.getFacing() - Math.PI / 2) < 0.001, "aim south");
  game.update(0.016, { ...idle, moveX: -1, moveY: 0 });
  assert.ok(Math.abs(game.getFacing() - Math.PI) < 0.001, "move west");
});

test("minimap stays inside the logical view when the backing store is larger", () => {
  const canvas = mockCanvas(800, 600);
  const win = bootWindow(canvas);
  const { GameMap } = load("map.js", win);
  win.GameMap = GameMap;
  win.GameSettings = settingsStub();
  const { ShooterGame } = load("game.js", win);
  const game = ShooterGame.create(canvas);
  game.resize(800, 600);
  assert.equal(canvas.width, 1600);
  game.start({});
  canvas.calls.length = 0;
  game.render();
  const dots = canvas.calls.filter((c) => c[0] === "arc" && c[1][2] === 3.2);
  assert.equal(dots.length, 1);
  const x = dots[0][1][0];
  assert.ok(x > 600 && x < 800, "player dot x " + x + " is inside the 800px view");
});

test("menu closes an open sheet", () => {
  const canvas = mockCanvas(800, 600);
  const win = bootWindow(canvas);
  const { GameMap } = load("map.js", win);
  win.GameMap = GameMap;
  win.GameSettings = settingsStub();
  win.Theme = {
    apply() {},
    current() { return "system"; },
    setBackground() {},
    paintBackground() {},
    paintModeChrome() {},
    set() {},
  };
  win.GameInput = {
    setAutoAim() {},
    setEnabled() {},
    attach() {},
    getState() {
      return { moveX: 0, moveY: 0, aimX: 0, aimY: 0, hasAim: false, shooting: false };
    },
  };
  load("game.js", win);
  load("app.js", win);

  const sheet = win.document.getElementById("sheet-settings");
  const scrim = win.document.getElementById("scrim");
  const menu = win.document.getElementById("overlay-menu");
  win.document.getElementById("btn-settings").click();
  assert.equal(sheet.classList.contains("open"), true);
  assert.equal(scrim.classList.contains("open"), true);

  win.document.getElementById("btn-main-menu").click();
  assert.equal(sheet.classList.contains("open"), false);
  assert.equal(sheet.getAttribute("aria-hidden"), "true");
  assert.equal(scrim.classList.contains("open"), false);
  assert.equal(menu.hidden, false);
  assert.equal(menu.classList.contains("hidden"), false);
});

test("menu keeps the live deck", () => {
  const canvas = mockCanvas(800, 600);
  const win = bootWindow(canvas);
  const { GameMap } = load("map.js", win);
  win.GameMap = GameMap;
  win.GameSettings = settingsStub();
  const { ShooterGame } = load("game.js", win);
  const game = ShooterGame.create(canvas);
  game.resize(800, 600);
  game.start({});
  const idle = {
    moveX: 0, moveY: 0, aimX: 0, aimY: 0, hasAim: false,
    shooting: false, autoAim: false, interact: false,
  };
  game.update(0.05, { ...idle, moveX: 1 });
  assert.equal(game.isPlaying(), true);
  game.suspend();
  assert.equal(game.isPlaying(), false);
  const snap = win.GameSettings.getProgress().suspended;
  assert.equal(snap.sectorIndex, 0);
  assert.ok(snap.player.x > 0);
  const hp = snap.hp;
  game.start({ continueRun: true });
  assert.equal(game.isPlaying(), true);
  assert.equal(game.getScore(), snap.score);
  assert.equal(win.GameSettings.getProgress().suspended.hp, hp);
});
