/*
 * Settings + progress — local only via Store.
 */

(function () {
  "use strict";

  function blankOwned() {
    return { pistol: true, shotgun: false, rifle: false };
  }

  function num(v, min, max, fallback) {
    var n = typeof v === "number" ? v : fallback;
    if (n !== n || n === Infinity || n === -Infinity) n = fallback;
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  function boolList(list, cap) {
    if (!Array.isArray(list)) return [];
    return list.slice(0, cap).map(function (v) { return !!v; });
  }

  function normalizeSuspended(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (!raw.player || typeof raw.player !== "object") return null;
    var kinds = { grunt: 1, crawler: 1, fortress: 1, drone: 1, boss: 1 };
    var enemies = [];
    if (Array.isArray(raw.enemies)) {
      raw.enemies.slice(0, 40).forEach(function (e) {
        if (!e || !kinds[e.kind]) return;
        enemies.push({
          x: num(e.x, 0, 4000, 0),
          y: num(e.y, 0, 4000, 0),
          hp: num(e.hp, 1, 80, 1),
          kind: e.kind,
          fireCool: num(e.fireCool, 0, 10, 0),
          post: e.post && typeof e.post === "object"
            ? { x: num(e.post.x, 0, 4000, 0), y: num(e.post.y, 0, 4000, 0) }
            : null
        });
      });
    }
    var breached = [];
    if (Array.isArray(raw.breached)) {
      raw.breached.slice(0, 16).forEach(function (cell) {
        if (!cell) return;
        breached.push({ x: cell.x | 0, y: cell.y | 0 });
      });
    }
    var owned = raw.owned && typeof raw.owned === "object" ? raw.owned : {};
    var inv = raw.inventory && typeof raw.inventory === "object" ? raw.inventory : {};
    var weapon = raw.weaponId === "shotgun" || raw.weaponId === "rifle" ? raw.weaponId : "pistol";
    return {
      sectorIndex: num(raw.sectorIndex, 0, 19, 0),
      score: num(raw.score, 0, 999999, 0),
      hp: num(raw.hp, 1, 5, 5),
      ammo: num(raw.ammo, 0, 999, 0),
      weaponId: weapon,
      owned: {
        pistol: true,
        shotgun: !!owned.shotgun,
        rifle: !!owned.rifle,
        dash: !!owned.dash,
        hull: !!owned.hull
      },
      inventory: { R: !!inv.R, G: !!inv.G, B: !!inv.B },
      player: {
        x: num(raw.player.x, 0, 4000, 48),
        y: num(raw.player.y, 0, 4000, 48),
        facing: num(raw.player.facing, -7, 7, 0)
      },
      enemies: enemies,
      doorsOpen: boolList(raw.doorsOpen, 32),
      keysTaken: boolList(raw.keysTaken, 8),
      cratesTaken: boolList(raw.cratesTaken, 8),
      cachesTaken: boolList(raw.cachesTaken, 4),
      breached: breached,
      breachCharges: raw.breachCharges ? 1 : 0,
      patchRun: !!raw.patchRun
    };
  }

  function read() {
    var data = window.Store && window.Store.getData ? window.Store.getData() : {};
    if (!data || typeof data !== "object") data = {};
    var owned = data.owned && typeof data.owned === "object" ? data.owned : blankOwned();
    return {
      autoAim: data.autoAim !== false,
      muted: !!data.muted,
      difficulty: data.difficulty === "easy" || data.difficulty === "hard" ? data.difficulty : "normal",
      unlockedSector: Math.max(0, Math.min(99, data.unlockedSector | 0)),
      owned: {
        pistol: true,
        shotgun: !!owned.shotgun,
        rifle: !!owned.rifle
      },
      bestScore: Math.max(0, data.bestScore | 0),
      cleared: !!data.cleared,
      suspended: normalizeSuspended(data.suspended)
    };
  }

  function write(patch) {
    var next = read();
    if (patch && typeof patch === "object") {
      if (typeof patch.autoAim === "boolean") next.autoAim = patch.autoAim;
      if (typeof patch.muted === "boolean") next.muted = patch.muted;
      if (patch.difficulty === "easy" || patch.difficulty === "normal" || patch.difficulty === "hard") {
        next.difficulty = patch.difficulty;
      }
      if (typeof patch.unlockedSector === "number") {
        next.unlockedSector = Math.max(next.unlockedSector, patch.unlockedSector | 0);
      }
      if (patch.owned && typeof patch.owned === "object") {
        next.owned = {
          pistol: true,
          shotgun: !!patch.owned.shotgun,
          rifle: !!patch.owned.rifle
        };
      }
      if (typeof patch.bestScore === "number") {
        next.bestScore = Math.max(next.bestScore, patch.bestScore | 0);
      }
      if (typeof patch.cleared === "boolean") next.cleared = next.cleared || patch.cleared;
      if (patch.clearSuspended) next.suspended = null;
      else if (patch.suspended) next.suspended = normalizeSuspended(patch.suspended);
    }
    if (window.Store && window.Store.setData) window.Store.setData(next);
    return next;
  }

  function difficultyMods(diff) {
    if (diff === "easy") {
      return { spawn: 1.35, enemySpeed: 0.85, enemyHp: 0.85, ammo: 1.35, playerSpeed: 1.05 };
    }
    if (diff === "hard") {
      return { spawn: 0.75, enemySpeed: 1.2, enemyHp: 1.35, ammo: 0.75, playerSpeed: 1 };
    }
    return { spawn: 1, enemySpeed: 1, enemyHp: 1, ammo: 1, playerSpeed: 1 };
  }

  window.GameSettings = {
    read: read,
    write: write,
    getAutoAim: function () { return read().autoAim; },
    setAutoAim: function (v) { return write({ autoAim: !!v }).autoAim; },
    getMuted: function () { return read().muted; },
    setMuted: function (v) {
      var muted = write({ muted: !!v }).muted;
      if (window.GameAudio && window.GameAudio.setMuted) window.GameAudio.setMuted(muted);
      return muted;
    },
    getDifficulty: function () { return read().difficulty; },
    setDifficulty: function (v) { return write({ difficulty: v }).difficulty; },
    difficultyMods: difficultyMods,
    getProgress: function () { return read(); },
    unlockSector: function (index) { return write({ unlockedSector: index | 0 }); },
    saveOwned: function (owned) { return write({ owned: owned }); },
    recordScore: function (score, cleared) {
      return write({ bestScore: score | 0, cleared: !!cleared });
    },
    canContinue: function () {
      var p = read();
      if (p.suspended) return true;
      return p.unlockedSector > 0 || p.owned.shotgun || p.owned.rifle || p.cleared;
    }
  };
})();
