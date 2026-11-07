/*
 * Seclusa Lockdown — sectors, gear, atmosphere, pause, minimap.
 */

(function () {
  "use strict";

  var PLAYER_SPEED = 230;
  var ENEMY_SPEED = 68;
  var SPAWN_START = 3.1;
  var SPAWN_MIN = 1.35;
  var PLAYER_R = 14;
  var KEY_R = 10;
  var PICK_R = 14;
  var MAX_HP = 5;
  var IFRAMES = 0.8;
  var ORANGE = "#f97316";
  var TEAL = "#2f8f8a";
  var TAN = "#c9a882";
  var TAN_DARK = "#8a6d4f";
  var METAL = "#4a5562";
  var RED_GLOW = "#ef4444";
  var PURPLE = "#a855f7";
  var YELLOW = "#facc15";
  var AUTO_AIM_RANGE = 520;
  var AMMO_START = 80;
  var AMMO_PICKUP = 30;

  var WEAPONS = {
    pistol: {
      id: "pistol", name: "Pistol",
      cooldown: 0.18, speed: 520, radius: 4,
      cost: 1, damage: 1, pellets: 1, spread: 0
    },
    shotgun: {
      id: "shotgun", name: "Scatter",
      cooldown: 0.55, speed: 460, radius: 3.5,
      cost: 2, damage: 1, pellets: 5, spread: 0.22
    },
    rifle: {
      id: "rifle", name: "Rifle",
      cooldown: 0.11, speed: 640, radius: 3.5,
      cost: 1, damage: 1, pellets: 1, spread: 0
    }
  };

  var SHOP_ITEMS = [
    { id: "ammo", kind: "ammo", label: "+30 ammo", cost: 12 },
    { id: "heal", kind: "heal", label: "+1 HP", cost: 18 },
    { id: "breach", kind: "charge", label: "Breach charge", cost: 26 },
    { id: "dash", kind: "gear", label: "Dash", cost: 32 },
    { id: "shotgun", kind: "weapon", label: "Scatter gun", cost: 35 },
    { id: "hull", kind: "gear", label: "Hull patch", cost: 40 },
    { id: "rifle", kind: "weapon", label: "Rifle", cost: 55 }
  ];

  /* Along the wall when one is close, otherwise straight at the pilot. */
  function crawlerVector(px, py, ex, ey, nx, ny) {
    var tx;
    var ty;
    if (nx || ny) {
      tx = -ny;
      ty = nx;
      var dx = px - ex;
      var dy = py - ey;
      if (tx * dx + ty * dy < 0) {
        tx = -tx;
        ty = -ty;
      }
      tx -= nx * 0.45;
      ty -= ny * 0.45;
    } else {
      tx = px - ex;
      ty = py - ey;
    }
    var len = Math.hypot(tx, ty) || 1;
    return { x: tx / len, y: ty / len };
  }

  function fortressShouldFire(dist, planted, cool) {
    return !!planted && cool <= 0 && dist < 300 && dist > 36;
  }

  function circlesHit(ax, ay, ar, bx, by, br) {
    var dx = ax - bx;
    var dy = ay - by;
    var r = ar + br;
    return dx * dx + dy * dy <= r * r;
  }

  function readColour(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (err) {
      return fallback;
    }
  }

  function sfx(name) {
    if (window.GameAudio && window.GameAudio[name]) window.GameAudio[name]();
  }

  function enemyStats(kind, mods) {
    if (kind === "crawler" || kind === "runner") {
      return { r: 13, hp: Math.max(1, Math.round(1 * mods.enemyHp)), speed: 1.5, score: 3 };
    }
    if (kind === "fortress" || kind === "brute") {
      return { r: 20, hp: Math.max(3, Math.round(4 * mods.enemyHp)), speed: 0.55, score: 6 };
    }
    if (kind === "drone") {
      return { r: 10, hp: Math.max(1, Math.round(1 * mods.enemyHp)), speed: 1.1, score: 4 };
    }
    if (kind === "boss") {
      return { r: 30, hp: Math.max(10, Math.round(16 * mods.enemyHp)), speed: 0.45, score: 45 };
    }
    // grunt
    return { r: 12, hp: Math.max(1, Math.round(1 * mods.enemyHp)), speed: 0.95, score: 2 };
  }

  function create(canvas) {
    var ctx = canvas.getContext("2d");
    var w = canvas.width;
    var h = canvas.height;
    var viewScale = 1;
    var playing = false;
    var paused = false;
    var over = false;
    var won = false;
    var score = 0;
    var hp = MAX_HP;
    var iframes = 0;
    var fireWait = 0;
    var spawnWait = 0;
    var spawnEvery = SPAWN_START;
    var player = { x: 0, y: 0, facing: 0 };
    var bullets = [];
    var enemyShots = [];
    var enemies = [];
    var inventory = { R: false, G: false, B: false };
    var owned = { pistol: true, shotgun: false, rifle: false, dash: false, hull: false };
    var breachCharges = 0;
    var dashLeft = 0;
    var dashCool = 0;
    var dashVx = 0;
    var dashVy = 0;
    var patchRun = false;
    var patchHold = 0;
    var breached = [];
    var weaponId = "pistol";
    var ammo = AMMO_START;
    var sectorIndex = 0;
    var map = null;
    var floorList = [];
    var floorDecor = [];
    var camX = 0;
    var camY = 0;
    var onOver = null;
    var onShop = null;
    var onPause = null;
    var lastInput = null;
    var toastMsg = "";
    var toastLife = 0;
    var shopOpen = false;
    var flash = 0;
    var shake = 0;
    var hitMarks = [];
    var mods = window.GameSettings.difficultyMods("normal");
    var continueMode = false;

    function showToast(msg) {
      toastMsg = msg;
      toastLife = 2.2;
    }

    function weapon() {
      return WEAPONS[weaponId] || WEAPONS.pistol;
    }

    function persistProgress(extra) {
      var patch = {
        owned: owned,
        unlockedSector: sectorIndex,
        bestScore: score
      };
      if (extra) {
        if (typeof extra.unlockedSector === "number") patch.unlockedSector = extra.unlockedSector;
        if (typeof extra.cleared === "boolean") patch.cleared = extra.cleared;
        if (typeof extra.bestScore === "number") patch.bestScore = extra.bestScore;
        if (extra.clearSuspended) patch.clearSuspended = true;
        if (extra.suspended) patch.suspended = extra.suspended;
      }
      window.GameSettings.write(patch);
    }

    function makeEnemy(x, y, kind) {
      var k = kind || "grunt";
      if (k === "runner") k = "crawler";
      if (k === "brute") k = "fortress";
      var st = enemyStats(k, mods);
      return {
        x: x, y: y, r: st.r, hp: st.hp, maxHp: st.hp,
        speed: st.speed, kind: k, score: st.score,
        spawnCool: k === "boss" ? 2.5 : 0,
        fireCool: (k === "drone" || k === "fortress") ? 0.8 : 0,
        planted: false,
        post: null
      };
    }

    function tileHash(tx, ty, salt) {
      var n = ((tx + 1) * 73856093) ^ ((ty + 1) * 19349663) ^ ((salt + 1) * 83492791) ^ ((sectorIndex + 3) * 39916801);
      n = (n >>> 0);
      return n / 4294967295;
    }

    function buildFloorDecor() {
      floorDecor.length = 0;
      if (!map) return;
      var i;

      // Only map-placed crates + ship are solid. Procedural junk is visual only.
      for (i = 0; i < (map.ships || []).length; i++) {
        var sh = map.ships[i];
        floorDecor.push({ kind: "ship", x: sh.x, y: sh.y, rot: -0.35, v: 0, solid: true, r: 30 });
      }
      for (i = 0; i < (map.crates || []).length; i++) {
        var cr = map.crates[i];
        floorDecor.push({
          kind: "box",
          x: cr.x,
          y: cr.y,
          rot: (tileHash(i + 1, 3, 2) - 0.5) * 0.5,
          v: 1,
          solid: true,
          r: 12
        });
      }

      // Sparse visual litter — never solid, never piled on solids/start/keys
      for (i = 0; i < floorList.length; i++) {
        var cell = floorList[i];
        var tile = map.tiles[cell.y][cell.x];
        if (tile.kind === "exit") continue;
        var cx = (cell.x + 0.5) * map.tile;
        var cy = (cell.y + 0.5) * map.tile;
        if (Math.hypot(cx - map.start.x, cy - map.start.y) < map.tile * 2.5) continue;

        var nearSolid = false;
        var j;
        for (j = 0; j < floorDecor.length; j++) {
          var d = floorDecor[j];
          var minD = d.solid ? map.tile * 1.4 : map.tile * 0.85;
          if (Math.hypot(cx - d.x, cy - d.y) < minD) { nearSolid = true; break; }
        }
        if (nearSolid) continue;

        // Keep clear of keys / doors / exits / ammo / terminals
        for (j = 0; j < map.keys.length; j++) {
          if (Math.hypot(cx - map.keys[j].x, cy - map.keys[j].y) < map.tile) { nearSolid = true; break; }
        }
        if (nearSolid) continue;
        for (j = 0; j < map.doors.length; j++) {
          var dx = (map.doors[j].x + 0.5) * map.tile;
          var dy = (map.doors[j].y + 0.5) * map.tile;
          if (Math.hypot(cx - dx, cy - dy) < map.tile * 1.2) { nearSolid = true; break; }
        }
        if (nearSolid) continue;

        var outdoor = !!tile.outdoor;
        var h = tileHash(cell.x, cell.y, 7);
        // Much sparser: ~12% outdoor, ~8% indoor
        if (h > (outdoor ? 0.12 : 0.08)) continue;

        var kind;
        if (outdoor) {
          kind = h < 0.03 ? "scrap" : h < 0.06 ? "rock" : h < 0.09 ? "stain" : "bolt";
        } else {
          kind = h < 0.025 ? "scrap" : h < 0.05 ? "stain" : "bolt";
        }
        floorDecor.push({
          kind: kind,
          x: cx + (tileHash(cell.x, cell.y, 3) - 0.5) * 18,
          y: cy + (tileHash(cell.x, cell.y, 5) - 0.5) * 18,
          rot: tileHash(cell.x, cell.y, 9) * Math.PI * 2,
          v: Math.floor(tileHash(cell.x, cell.y, 11) * 4),
          solid: false,
          r: 0
        });
      }
    }

    function propBlocked(x, y, radius) {
      var i;
      for (i = 0; i < floorDecor.length; i++) {
        var d = floorDecor[i];
        if (!d.solid || !d.r) continue;
        if (Math.hypot(x - d.x, y - d.y) < radius + d.r) return true;
      }
      return false;
    }

    function loadSector(index, keepGear) {
      patchRun = false;
      patchHold = 0;
      breached = [];
      sectorIndex = index;
      map = window.GameMap.cloneSector(index);
      floorList = window.GameMap.floorCells(map);
      buildFloorDecor();
      inventory = { R: false, G: false, B: false };
      player.x = map.start.x;
      player.y = map.start.y;
      player.facing = 0;
      bullets.length = 0;
      enemyShots.length = 0;
      enemies.length = 0;
      shopOpen = false;
      spawnWait = 1.4 * mods.spawn;
      spawnEvery = SPAWN_START * mods.spawn;
      if (!keepGear) {
        owned = { pistol: true, shotgun: false, rifle: false, dash: false, hull: false };
        breachCharges = 0;
        weaponId = "pistol";
        ammo = Math.round(AMMO_START * mods.ammo);
      }
      var i;
      for (i = 0; i < map.spawns.length; i++) {
        var s = map.spawns[i];
        enemies.push(readyEnemy(makeEnemy(s.x, s.y, s.kind)));
      }
      updateCamera();
      showToast(sectorIndex === 0 ? "Crash site — grab the keycard" : map.name);
      persistProgress({ unlockedSector: Math.max(sectorIndex, window.GameSettings.getProgress().unlockedSector) });
    }

    function assignPost(e) {
      var best = null;
      var bestD = Infinity;
      var i;
      for (i = 0; i < map.doors.length; i++) {
        var door = map.doors[i];
        var x = (door.x + 0.5) * map.tile;
        var y = (door.y + 0.5) * map.tile;
        var dist = Math.hypot(x - e.x, y - e.y);
        if (dist < bestD) {
          bestD = dist;
          best = { x: x, y: y };
        }
      }
      e.post = best || { x: e.x, y: e.y };
    }

    function readyEnemy(e) {
      if (e.kind === "fortress") assignPost(e);
      return e;
    }

    function reset(opts) {
      opts = opts || {};
      mods = window.GameSettings.difficultyMods(window.GameSettings.getDifficulty());
      continueMode = !!opts.continueRun;
      score = 0;
      hp = MAX_HP;
      iframes = 0;
      fireWait = 0;
      over = false;
      won = false;
      paused = false;
      toastMsg = "";
      toastLife = 0;
      flash = 0;
      shake = 0;
      hitMarks.length = 0;

      var progress = window.GameSettings.getProgress();
      if (continueMode && progress.suspended) {
        restoreRun(progress.suspended);
        return;
      }
      if (continueMode) {
        owned = {
          pistol: true,
          shotgun: !!progress.owned.shotgun,
          rifle: !!progress.owned.rifle,
          dash: false,
          hull: false
        };
        breachCharges = 0;
        weaponId = owned.rifle ? "rifle" : owned.shotgun ? "shotgun" : "pistol";
        ammo = Math.round(AMMO_START * mods.ammo);
        loadSector(Math.min(progress.unlockedSector, window.GameMap.sectorCount() - 1), true);
      } else {
        window.GameSettings.write({ clearSuspended: true });
        loadSector(0, false);
      }
    }

    function updateCamera() {
      if (!map) return;
      camX = player.x - w * 0.5;
      camY = player.y - h * 0.5;
      camX = Math.max(0, Math.min(map.width - w, camX));
      camY = Math.max(0, Math.min(map.height - h, camY));
      if (map.width < w) camX = (map.width - w) * 0.5;
      if (map.height < h) camY = (map.height - h) * 0.5;
    }

    function moveCircle(ent, dx, dy, radius) {
      var nx = ent.x + dx;
      if (!window.GameMap.circleBlocked(map, nx, ent.y, radius) && !propBlocked(nx, ent.y, radius)) ent.x = nx;
      var ny = ent.y + dy;
      if (!window.GameMap.circleBlocked(map, ent.x, ny, radius) && !propBlocked(ent.x, ny, radius)) ent.y = ny;
    }

    function randomFloorAwayFromPlayer(minDist) {
      var tries = 50;
      while (tries--) {
        var cell = floorList[Math.floor(Math.random() * floorList.length)];
        var tile = map.tiles[cell.y][cell.x];
        if (tile.outdoor) continue;
        var x = (cell.x + 0.5) * map.tile;
        var y = (cell.y + 0.5) * map.tile;
        if (propBlocked(x, y, 16)) continue;
        if (Math.hypot(x - player.x, y - player.y) >= minDist) return { x: x, y: y };
      }
      return null;
    }

    function spawnEnemy(kind) {
      var spot = randomFloorAwayFromPlayer(map.tile * 5);
      if (!spot) return;
      var roll = Math.random();
      var k = kind;
      if (!k) {
        var t = sectorIndex / Math.max(1, window.GameMap.sectorCount() - 1);
        if (roll < 0.06 + t * 0.12) k = "fortress";
        else if (roll < 0.16 + t * 0.18) k = "drone";
        else if (roll < 0.36 + t * 0.2) k = "crawler";
        else k = "grunt";
      }
      enemies.push(readyEnemy(makeEnemy(spot.x, spot.y, k)));
    }

    function nearestEnemy(x, y, range) {
      var best = null;
      var bestD = range * range;
      var i;
      for (i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        var d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      return best;
    }

    function nearTerminal() {
      var i;
      for (i = 0; i < map.terminals.length; i++) {
        var t = map.terminals[i];
        if (circlesHit(player.x, player.y, PLAYER_R, t.x, t.y, PICK_R + 8)) return t;
      }
      return null;
    }

    function onExit() {
      var i;
      for (i = 0; i < map.exits.length; i++) {
        var e = map.exits[i];
        if (circlesHit(player.x, player.y, PLAYER_R, e.x, e.y, PICK_R)) return true;
      }
      return false;
    }

    function nearShip() {
      var i;
      for (i = 0; i < (map.ships || []).length; i++) {
        var ship = map.ships[i];
        if (Math.hypot(player.x - ship.x, player.y - ship.y) < 64) return ship;
      }
      return null;
    }

    function bossAlive() {
      var i;
      for (i = 0; i < enemies.length; i++) {
        if (enemies[i].kind === "boss" && enemies[i].hp > 0) return true;
      }
      return false;
    }

    function hurt(amount) {
      if (iframes > 0) return;
      if (hp - amount <= 0 && owned.hull) {
        owned.hull = false;
        hp = 2;
        iframes = 1.2;
        flash = 0.3;
        shake = 0.35;
        showToast("Hull patch caught it");
        sfx("hurt");
        return;
      }
      hp -= amount;
      iframes = IFRAMES;
      flash = 0.25;
      shake = 0.3;
      sfx("hurt");
      sfx("thud");
      if (hp <= 0) {
        hp = 0;
        endRun(false);
      }
    }

    function wallNormal(ent) {
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [0.7, -0.7], [-0.7, 0.7], [-0.7, -0.7]];
      var nx = 0;
      var ny = 0;
      var hit = 0;
      var i;
      for (i = 0; i < dirs.length; i++) {
        var d = dirs[i];
        var len = Math.hypot(d[0], d[1]) || 1;
        var px = ent.x + (d[0] / len) * (ent.r + 10);
        var py = ent.y + (d[1] / len) * (ent.r + 10);
        if (window.GameMap.circleBlocked(map, px, py, 4)) {
          nx -= d[0] / len;
          ny -= d[1] / len;
          hit++;
        }
      }
      if (!hit) return null;
      var nlen = Math.hypot(nx, ny) || 1;
      return { x: nx / nlen, y: ny / nlen };
    }

    function clearLine(x0, y0, x1, y1) {
      var dist = Math.hypot(x1 - x0, y1 - y0);
      var steps = Math.max(1, Math.ceil(dist / (map.tile * 0.45)));
      var i;
      for (i = 1; i < steps; i++) {
        var t = i / steps;
        var x = x0 + (x1 - x0) * t;
        var y = y0 + (y1 - y0) * t;
        if (window.GameMap.circleBlocked(map, x, y, 3)) return false;
      }
      return true;
    }

    function pushShot(e, nx, ny, speed, radius, dmg, life) {
      enemyShots.push({
        x: e.x + nx * (e.r + 4),
        y: e.y + ny * (e.r + 4),
        vx: nx * speed,
        vy: ny * speed,
        life: life,
        r: radius,
        dmg: dmg
      });
    }

    function stepEnemy(e, dt) {
      var edx = player.x - e.x;
      var edy = player.y - e.y;
      var elen = Math.hypot(edx, edy) || 1;
      var spd = ENEMY_SPEED * e.speed * mods.enemySpeed;
      var nx = edx / elen;
      var ny = edy / elen;

      if (e.kind === "drone") {
        var ideal = 170;
        if (elen < ideal - 30) moveCircle(e, -nx * spd * dt, -ny * spd * dt, e.r);
        else if (elen > ideal + 50) moveCircle(e, nx * spd * dt, ny * spd * dt, e.r);
        else moveCircle(e, -ny * spd * 0.7 * dt, nx * spd * 0.7 * dt, e.r);
        e.fireCool -= dt;
        if (e.fireCool <= 0 && elen < 340 && clearLine(e.x, e.y, player.x, player.y)) {
          e.fireCool = 1.35;
          pushShot(e, nx, ny, 260, 3.5, 1, 1.4);
        }
        return;
      }

      if (e.kind === "crawler") {
        var wall = wallNormal(e);
        var dir = crawlerVector(player.x, player.y, e.x, e.y, wall ? wall.x : 0, wall ? wall.y : 0);
        moveCircle(e, dir.x * spd * dt, dir.y * spd * dt, e.r);
        return;
      }

      if (e.kind === "fortress") {
        if (!e.post) assignPost(e);
        var pdx = e.post.x - e.x;
        var pdy = e.post.y - e.y;
        var plen = Math.hypot(pdx, pdy);
        if (plen > 22) {
          moveCircle(e, (pdx / plen) * spd * dt, (pdy / plen) * spd * dt, e.r);
          var after = Math.hypot(e.post.x - e.x, e.post.y - e.y);
          e.planted = after > plen - 0.4;
        } else {
          e.planted = true;
        }
        if (e.planted) {
          e.fireCool -= dt;
          if (fortressShouldFire(elen, true, e.fireCool) && clearLine(e.x, e.y, player.x, player.y)) {
            e.fireCool = 1.7;
            pushShot(e, nx, ny, 200, 5, 2, 1.6);
          }
        }
        return;
      }

      moveCircle(e, nx * spd * dt, ny * spd * dt, e.r);
    }

    function useBreach() {
      if (breachCharges <= 0) {
        showToast("No breach charge");
        sfx("empty");
        return;
      }
      var tx = Math.floor((player.x + Math.cos(player.facing) * 36) / map.tile);
      var ty = Math.floor((player.y + Math.sin(player.facing) * 36) / map.tile);
      if (tx <= 0 || ty <= 0 || tx >= map.cols - 1 || ty >= map.rows - 1) {
        showToast("The outer wall holds");
        return;
      }
      var tile = map.tiles[ty] && map.tiles[ty][tx];
      if (!tile || tile.kind !== "wall") {
        showToast("Face a wall");
        return;
      }
      map.tiles[ty][tx] = { kind: "floor", outdoor: false, breached: true };
      breached.push({ x: tx, y: ty });
      floorList = window.GameMap.floorCells(map);
      breachCharges -= 1;
      showToast("Wall breached");
      sfx("thud");
    }

    function beginPatch() {
      patchRun = true;
      patchHold = 0;
      sectorIndex = 0;
      map = window.GameMap.cloneSector(0);
      floorList = window.GameMap.floorCells(map);
      buildFloorDecor();
      bullets.length = 0;
      enemyShots.length = 0;
      enemies.length = 0;
      var ship = (map.ships && map.ships[0]) || map.start;
      player.x = ship.x + 58;
      player.y = ship.y;
      if (window.GameMap.circleBlocked(map, player.x, player.y, PLAYER_R) || propBlocked(player.x, player.y, PLAYER_R)) {
        player.x = map.start.x;
        player.y = map.start.y;
      }
      updateCamera();
      showToast("Back at the wreck — hold E to patch");
      sfx("exit");
    }

    function snapshotRun() {
      return {
        sectorIndex: patchRun ? 0 : sectorIndex,
        score: score,
        hp: hp,
        ammo: ammo,
        weaponId: weaponId,
        owned: {
          pistol: true,
          shotgun: !!owned.shotgun,
          rifle: !!owned.rifle,
          dash: !!owned.dash,
          hull: !!owned.hull
        },
        inventory: { R: !!inventory.R, G: !!inventory.G, B: !!inventory.B },
        player: { x: player.x, y: player.y, facing: player.facing },
        enemies: enemies.map(function (e) {
          return {
            x: e.x, y: e.y, hp: e.hp, kind: e.kind,
            fireCool: e.fireCool || 0,
            post: e.post ? { x: e.post.x, y: e.post.y } : null
          };
        }),
        doorsOpen: map.doors.map(function (d) { return !!map.tiles[d.y][d.x].open; }),
        keysTaken: map.keys.map(function (k) { return !!k.taken; }),
        cratesTaken: map.ammoCrates.map(function (c) { return !!c.taken; }),
        cachesTaken: (map.caches || []).map(function (c) { return !!c.taken; }),
        breached: breached.map(function (c) { return { x: c.x, y: c.y }; }),
        breachCharges: breachCharges,
        patchRun: patchRun
      };
    }

    function applySnapshotMap(snap) {
      var i;
      for (i = 0; i < snap.doorsOpen.length && i < map.doors.length; i++) {
        if (snap.doorsOpen[i]) map.tiles[map.doors[i].y][map.doors[i].x].open = true;
      }
      for (i = 0; i < snap.keysTaken.length && i < map.keys.length; i++) {
        map.keys[i].taken = !!snap.keysTaken[i];
        if (map.keys[i].taken) inventory[map.keys[i].colour] = true;
      }
      for (i = 0; i < snap.cratesTaken.length && i < map.ammoCrates.length; i++) {
        map.ammoCrates[i].taken = !!snap.cratesTaken[i];
      }
      for (i = 0; i < snap.cachesTaken.length && i < (map.caches || []).length; i++) {
        map.caches[i].taken = !!snap.cachesTaken[i];
      }
      breached = [];
      for (i = 0; i < snap.breached.length; i++) {
        var cell = snap.breached[i];
        if (!map.tiles[cell.y] || !map.tiles[cell.y][cell.x]) continue;
        if (cell.x <= 0 || cell.y <= 0 || cell.x >= map.cols - 1 || cell.y >= map.rows - 1) continue;
        map.tiles[cell.y][cell.x] = { kind: "floor", outdoor: false, breached: true };
        breached.push({ x: cell.x, y: cell.y });
      }
      floorList = window.GameMap.floorCells(map);
    }

    function restoreRun(snap) {
      score = snap.score;
      hp = snap.hp;
      ammo = snap.ammo;
      weaponId = snap.weaponId;
      owned = {
        pistol: true,
        shotgun: !!snap.owned.shotgun,
        rifle: !!snap.owned.rifle,
        dash: !!snap.owned.dash,
        hull: !!snap.owned.hull
      };
      inventory = { R: !!snap.inventory.R, G: !!snap.inventory.G, B: !!snap.inventory.B };
      breachCharges = snap.breachCharges ? 1 : 0;
      patchRun = !!snap.patchRun;
      patchHold = 0;
      dashLeft = 0;
      dashCool = 0;
      sectorIndex = snap.patchRun ? 0 : snap.sectorIndex;
      map = window.GameMap.cloneSector(sectorIndex);
      floorList = window.GameMap.floorCells(map);
      buildFloorDecor();
      applySnapshotMap(snap);
      player.x = snap.player.x;
      player.y = snap.player.y;
      player.facing = snap.player.facing;
      bullets.length = 0;
      enemyShots.length = 0;
      enemies.length = 0;
      var i;
      for (i = 0; i < snap.enemies.length; i++) {
        var src = snap.enemies[i];
        var e = makeEnemy(src.x, src.y, src.kind);
        e.hp = src.hp;
        e.fireCool = src.fireCool || 0;
        if (src.post) e.post = { x: src.post.x, y: src.post.y };
        else if (e.kind === "fortress") assignPost(e);
        enemies.push(e);
      }
      shopOpen = false;
      spawnWait = 1.2;
      updateCamera();
      showToast(patchRun ? "Hold E at the wreck" : map.name);
    }

    function suspend() {
      if (!playing || over || !map) return;
      var snap = snapshotRun();
      playing = false;
      paused = false;
      shopOpen = false;
      persistProgress({
        suspended: snap,
        bestScore: score,
        unlockedSector: sectorIndex
      });
    }

    function fire() {
      var gun = weapon();
      var cost = gun.cost || 1;
      if (ammo < cost) {
        sfx("empty");
        showToast("Empty");
        return;
      }
      ammo -= cost;
      sfx("shoot");
      var base = player.facing;
      var p;
      for (p = 0; p < gun.pellets; p++) {
        var ang = base + (gun.pellets === 1 ? 0 : (p - (gun.pellets - 1) / 2) * gun.spread);
        bullets.push({
          x: player.x + Math.cos(ang) * (PLAYER_R + 4),
          y: player.y + Math.sin(ang) * (PLAYER_R + 4),
          vx: Math.cos(ang) * gun.speed,
          vy: Math.sin(ang) * gun.speed,
          life: 1.15,
          r: gun.radius,
          dmg: gun.damage
        });
      }
      fireWait = gun.cooldown || 0.2;
    }

    function shopSnapshot() {
      return {
        score: score,
        ammo: ammo,
        hp: hp,
        maxHp: MAX_HP,
        owned: {
          pistol: true,
          shotgun: !!owned.shotgun,
          rifle: !!owned.rifle,
          dash: !!owned.dash,
          hull: !!owned.hull
        },
        breachCharges: breachCharges,
        items: SHOP_ITEMS
      };
    }

    function openShop() {
      shopOpen = true;
      paused = true;
      sfx("shop");
      if (typeof onShop === "function") onShop(shopSnapshot());
      if (typeof onPause === "function") onPause(true);
    }

    function closeShop() {
      shopOpen = false;
      paused = false;
      showToast("Terminal closed");
      if (typeof onPause === "function") onPause(false);
    }

    function purchase(id) {
      var item = null;
      var i;
      for (i = 0; i < SHOP_ITEMS.length; i++) {
        if (SHOP_ITEMS[i].id === id) item = SHOP_ITEMS[i];
      }
      if (!item) return shopSnapshot();
      if (score < item.cost) {
        showToast("Need " + item.cost + " credits");
        sfx("empty");
        return shopSnapshot();
      }
      if (item.kind === "ammo") {
        score -= item.cost;
        ammo += Math.round(AMMO_PICKUP * mods.ammo);
        showToast("Ammo restocked");
        sfx("shop");
      } else if (item.kind === "weapon") {
        if (owned[item.id]) {
          showToast("Already owned");
          return shopSnapshot();
        }
        score -= item.cost;
        owned[item.id] = true;
        weaponId = item.id;
        showToast(WEAPONS[item.id].name + " online");
        sfx("shop");
        persistProgress();
      } else if (item.kind === "heal") {
        if (hp >= MAX_HP) {
          showToast("HP full");
          return shopSnapshot();
        }
        score -= item.cost;
        hp = Math.min(MAX_HP, hp + 1);
        showToast("Vitals restored");
        sfx("shop");
      } else if (item.kind === "gear") {
        if (owned[item.id]) {
          showToast("Already carried");
          return shopSnapshot();
        }
        score -= item.cost;
        owned[item.id] = true;
        showToast(item.id === "dash" ? "Dash online — Shift" : "Hull patch stowed");
        sfx("shop");
      } else if (item.kind === "charge") {
        if (breachCharges >= 1) {
          showToast("Already carrying a charge");
          return shopSnapshot();
        }
        score -= item.cost;
        breachCharges = 1;
        showToast("Breach charge — press F at a wall");
        sfx("shop");
      }
      return shopSnapshot();
    }

    function endRun(didWin) {
      over = true;
      playing = false;
      paused = false;
      shopOpen = false;
      won = !!didWin;
      persistProgress({
        bestScore: score,
        cleared: didWin,
        unlockedSector: didWin ? window.GameMap.sectorCount() - 1 : sectorIndex,
        clearSuspended: true
      });
      if (didWin) sfx("win");
      if (typeof onOver === "function") onOver(score, didWin);
    }

    function setPaused(value) {
      if (!playing || over || shopOpen) return;
      paused = !!value;
      if (typeof onPause === "function") onPause(paused);
      if (paused) showToast("Paused");
    }

    function update(dt, input) {
      if (!playing || over) return;
      lastInput = input;

      if (input.pause) {
        if (shopOpen) {
          closeShop();
          if (typeof onShop === "function") onShop(null);
        } else {
          setPaused(!paused);
        }
      }

      if (paused || shopOpen) {
        if (toastLife > 0) toastLife -= dt;
        return;
      }

      if (dt > 0.05) dt = 0.05;
      if (toastLife > 0) toastLife -= dt;
      if (flash > 0) flash -= dt;
      if (shake > 0) shake -= dt;

      if (input.weapon1 && owned.pistol) weaponId = "pistol";
      if (input.weapon2 && owned.shotgun) weaponId = "shotgun";
      if (input.weapon3 && owned.rifle) weaponId = "rifle";

      if (input.breach) useBreach();

      if (owned.dash && input.dash && dashCool <= 0 && dashLeft <= 0) {
        var dashX = input.moveX;
        var dashY = input.moveY;
        if (!dashX && !dashY) {
          dashX = Math.cos(player.facing);
          dashY = Math.sin(player.facing);
        }
        var dashLen = Math.hypot(dashX, dashY) || 1;
        dashVx = (dashX / dashLen) * 640;
        dashVy = (dashY / dashLen) * 640;
        dashLeft = 0.14;
        dashCool = 0.95;
        iframes = Math.max(iframes, 0.14);
      }
      if (dashCool > 0) dashCool -= dt;

      if (input.interact && nearTerminal()) {
        openShop();
        return;
      }

      if (dashLeft > 0) {
        moveCircle(player, dashVx * dt, dashVy * dt, PLAYER_R);
        dashLeft -= dt;
      } else {
        moveCircle(
          player,
          input.moveX * PLAYER_SPEED * mods.playerSpeed * dt,
          input.moveY * PLAYER_SPEED * mods.playerSpeed * dt,
          PLAYER_R
        );
      }

      var opened = window.GameMap.tryOpenDoor(map, inventory, player.x, player.y, PLAYER_R);
      if (opened) {
        showToast(opened === "R" ? "Red door unlocked" :
          opened === "G" ? "Green door unlocked" : "Blue door unlocked");
        sfx("door");
      }

      var ki;
      for (ki = 0; ki < map.keys.length; ki++) {
        var key = map.keys[ki];
        if (key.taken) continue;
        if (circlesHit(player.x, player.y, PLAYER_R, key.x, key.y, KEY_R)) {
          key.taken = true;
          inventory[key.colour] = true;
          showToast(
            key.colour === "R" ? "Red keycard" :
            key.colour === "G" ? "Green keycard" : "Blue keycard"
          );
          sfx("pickup");
        }
      }

      for (ki = 0; ki < (map.caches || []).length; ki++) {
        var cache = map.caches[ki];
        if (cache.taken) continue;
        if (circlesHit(player.x, player.y, PLAYER_R, cache.x, cache.y, PICK_R)) {
          cache.taken = true;
          if (cache.kind === "patch" && !owned.hull) {
            owned.hull = true;
            showToast("Hull patch");
          } else {
            ammo += Math.round(AMMO_PICKUP * mods.ammo);
            showToast("Cache ammo +" + Math.round(AMMO_PICKUP * mods.ammo));
          }
          sfx("pickup");
        }
      }

      for (ki = 0; ki < map.ammoCrates.length; ki++) {
        var crate = map.ammoCrates[ki];
        if (crate.taken) continue;
        if (circlesHit(player.x, player.y, PLAYER_R, crate.x, crate.y, PICK_R)) {
          crate.taken = true;
          ammo += Math.round(AMMO_PICKUP * mods.ammo);
          showToast("Ammo +" + Math.round(AMMO_PICKUP * mods.ammo));
          sfx("pickup");
        }
      }

      if (input.autoAim) {
        var autoTarget = nearestEnemy(player.x, player.y, AUTO_AIM_RANGE);
        if (autoTarget) {
          player.facing = Math.atan2(autoTarget.y - player.y, autoTarget.x - player.x);
        } else if (input.moveX || input.moveY) {
          player.facing = Math.atan2(input.moveY, input.moveX);
        }
      } else if (input.hasAim) {
        player.facing = Math.atan2(input.aimY, input.aimX);
      } else if (input.moveX || input.moveY) {
        player.facing = Math.atan2(input.moveY, input.moveX);
      }

      fireWait -= dt;
      if (input.shooting && fireWait <= 0) fire();

      iframes -= dt;

      var i;
      for (i = bullets.length - 1; i >= 0; i--) {
        var b = bullets[i];
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        if (b.life <= 0 || window.GameMap.circleBlocked(map, b.x, b.y, b.r) || propBlocked(b.x, b.y, b.r)) {
          bullets.splice(i, 1);
        }
      }

      if (!patchRun) {
        spawnWait -= dt;
        if (spawnWait <= 0) {
          spawnEnemy();
          spawnEvery = Math.max(SPAWN_MIN * mods.spawn, spawnEvery * 0.98);
          spawnWait = spawnEvery;
        }
      }

      for (i = enemyShots.length - 1; i >= 0; i--) {
        var es = enemyShots[i];
        es.x += es.vx * dt;
        es.y += es.vy * dt;
        es.life -= dt;
        if (
          es.life <= 0 ||
          window.GameMap.circleBlocked(map, es.x, es.y, es.r) ||
          propBlocked(es.x, es.y, es.r)
        ) {
          enemyShots.splice(i, 1);
          continue;
        }
        if (circlesHit(es.x, es.y, es.r, player.x, player.y, PLAYER_R)) {
          enemyShots.splice(i, 1);
          hurt(es.dmg || 1);
          if (!playing) return;
        }
      }

      for (i = enemies.length - 1; i >= 0; i--) {
        var e = enemies[i];
        stepEnemy(e, dt);

        if (e.kind === "boss") {
          e.spawnCool -= dt;
          if (e.spawnCool <= 0 && enemies.length < 14) {
            e.spawnCool = 3.2;
            spawnEnemy(Math.random() < 0.5 ? "grunt" : "drone");
            showToast("Bay defenders");
          }
        }

        var hit = false;
        for (var j = bullets.length - 1; j >= 0; j--) {
          var bullet = bullets[j];
          if (circlesHit(e.x, e.y, e.r, bullet.x, bullet.y, bullet.r)) {
            e.hp -= bullet.dmg;
            bullets.splice(j, 1);
            hitMarks.push({ x: e.x, y: e.y, life: 0.25 });
            sfx("hit");
            if (e.hp <= 0) hit = true;
            break;
          }
        }
        if (hit) {
          score += e.score + sectorIndex;
          enemies.splice(i, 1);
          continue;
        }

        if (
          e.kind !== "drone" &&
          circlesHit(e.x, e.y, e.r, player.x, player.y, PLAYER_R)
        ) {
          hurt(e.kind === "boss" || e.kind === "fortress" ? 2 : 1);
          if (!playing) return;
        }
      }

      for (i = hitMarks.length - 1; i >= 0; i--) {
        hitMarks[i].life -= dt;
        if (hitMarks[i].life <= 0) hitMarks.splice(i, 1);
      }

      if (patchRun) {
        if (nearShip() && input.interactHeld) {
          patchHold += dt;
          if (patchHold >= 1.35) endRun(true);
        } else {
          patchHold = 0;
        }
      } else if (window.GameMap.allDoorsOpen(map) && onExit()) {
        if (sectorIndex >= window.GameMap.sectorCount() - 1) {
          if (bossAlive()) showToast("Drop the core first");
          else beginPatch();
        } else {
          sfx("exit");
          persistProgress({ unlockedSector: sectorIndex + 1 });
          loadSector(sectorIndex + 1, true);
        }
      }

      updateCamera();
    }

    function drawStick(stick, radius, labelColour) {
      if (!stick || !stick.active) return;
      ctx.beginPath();
      ctx.arc(stick.ox, stick.oy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = labelColour;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(stick.x, stick.y, radius * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = labelColour;
      ctx.globalAlpha = 0.45;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    function drawIdleStick(colour) {
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = colour;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(80, h - 80, 56, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    function drawFirePad(active, colour) {
      var cx = w - 80;
      var cy = h - 80;
      ctx.beginPath();
      ctx.arc(cx, cy, 48, 0, Math.PI * 2);
      ctx.fillStyle = colour;
      ctx.globalAlpha = active ? 0.45 : 0.18;
      ctx.fill();
      ctx.globalAlpha = active ? 0.9 : 0.4;
      ctx.strokeStyle = colour;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = active ? 0.95 : 0.55;
      ctx.fillStyle = colour;
      ctx.font = "700 13px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("FIRE", cx, cy);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.globalAlpha = 1;
    }

    function drawHpBar(e) {
      if (e.kind !== "boss" && e.maxHp <= 1) return;
      var bw = e.r * 2;
      ctx.fillStyle = "#111";
      ctx.fillRect(e.x - bw / 2, e.y - e.r - 10, bw, 4);
      ctx.fillStyle = ORANGE;
      ctx.fillRect(e.x - bw / 2, e.y - e.r - 10, bw * (e.hp / e.maxHp), 4);
    }

    function rivetAt(x, y, r) {
      var rg = ctx.createRadialGradient(x - 0.5, y - 0.5, 0.2, x, y, r);
      rg.addColorStop(0, "#e8d4b8");
      rg.addColorStop(0.55, "#9a7a58");
      rg.addColorStop(1, "#4a3828");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    function inkStroke() {
      ctx.strokeStyle = "#1a120c";
      ctx.lineWidth = 2.25;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
    }

    function castShadow(x, y, rx, ry) {
      ctx.save();
      ctx.translate(x + 5, y + 7);
      ctx.fillStyle = "rgba(26,18,12,0.34)";
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Highlight and shade stay upper-left on screen. The body underneath is already turned to face.
    function shadeUpperLeft(cx, cy, rx, ry) {
      if (typeof ctx.getTransform !== "function") return;
      var m = ctx.getTransform();
      if (!m || typeof m.a !== "number") return;
      var ang = Math.atan2(m.b, m.a);
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.translate(cx, cy);
      ctx.rotate(-ang);
      ctx.fillStyle = "rgba(255,248,230,0.42)";
      ctx.beginPath();
      ctx.ellipse(-rx * 0.32, -ry * 0.36, rx * 0.55, ry * 0.42, -0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(28,16,8,0.34)";
      ctx.beginPath();
      ctx.ellipse(rx * 0.28, ry * 0.32, rx * 0.6, ry * 0.48, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function roundPlate(x, y, rw, rh, rad) {
      var r = Math.min(rad, rw / 2, rh / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + rw - r, y);
      ctx.quadraticCurveTo(x + rw, y, x + rw, y + r);
      ctx.lineTo(x + rw, y + rh - r);
      ctx.quadraticCurveTo(x + rw, y + rh, x + rw - r, y + rh);
      ctx.lineTo(x + r, y + rh);
      ctx.quadraticCurveTo(x, y + rh, x, y + rh - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }

    function drawPlayerBody() {
      // Built facing +X. The caller turns this to the aim. Light is added in screen space.
      ctx.scale(1.22, 1.22);

      ctx.fillStyle = "#6b4a32";
      ctx.beginPath();
      ctx.ellipse(-2, -7.5, 3.2, 4.2, 0.4, 0, Math.PI * 2);
      ctx.ellipse(-2, 7.5, 3.2, 4.2, -0.4, 0, Math.PI * 2);
      ctx.fill();
      inkStroke();

      ctx.fillStyle = "#ea580c";
      ctx.beginPath();
      ctx.moveTo(-2, -4);
      ctx.quadraticCurveTo(-24, -14, -22, 0);
      ctx.quadraticCurveTo(-24, 14, -2, 4);
      ctx.closePath();
      ctx.fill();
      inkStroke();

      ctx.fillStyle = "#2f8f8a";
      ctx.beginPath();
      ctx.ellipse(-1, 0, 11, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      inkStroke();
      shadeUpperLeft(-1, 0, 11, 13);

      ctx.fillStyle = "#5c4330";
      ctx.fillRect(-9, -2.4, 16, 4.8);
      ctx.fillStyle = "#e7d3b0";
      ctx.fillRect(-7, -1.2, 12, 2.4);

      ctx.fillStyle = "#e7d3b0";
      ctx.beginPath();
      ctx.arc(8, 0, 8.6, 0, Math.PI * 2);
      ctx.fill();
      inkStroke();
      shadeUpperLeft(8, 0, 8.6, 8.6);
      ctx.fillStyle = "#14110e";
      ctx.beginPath();
      ctx.ellipse(13.2, 0, 3.2, 5.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#f97316";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = "rgba(125,211,252,0.35)";
      ctx.beginPath();
      ctx.ellipse(12.4, -1.2, 1.2, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();

      var i, side;
      for (i = 0; i < 2; i++) {
        side = i === 0 ? -1 : 1;
        ctx.fillStyle = "#2f8f8a";
        ctx.beginPath();
        ctx.ellipse(2, side * 11, 4.2, 3.2, 0.2 * side, 0, Math.PI * 2);
        ctx.fill();
        inkStroke();
        ctx.fillStyle = "#d5dde4";
        ctx.beginPath();
        roundPlate(6, side * 11 - 2.6, 16, 5.2, 1.5);
        ctx.fill();
        inkStroke();
        ctx.fillStyle = ORANGE;
        ctx.fillRect(10, side * 11 - 1.3, 4, 2.6);
        ctx.fillStyle = "#14110e";
        ctx.fillRect(20, side * 11 - 1.4, 3.4, 2.8);
      }
      ctx.lineWidth = 1;
    }

    function drawGrunt(e) {
      var s = Math.max(0.95, e.r / 11);
      ctx.save();
      ctx.scale(s, s);
      ctx.strokeStyle = "#1a120c";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-2, -6);
      ctx.lineTo(-10, -13);
      ctx.moveTo(-2, 6);
      ctx.lineTo(-10, 13);
      ctx.moveTo(4, 0);
      ctx.lineTo(13, 0);
      ctx.stroke();
      ctx.fillStyle = "#3f3a34";
      ctx.beginPath();
      ctx.arc(-10, -13, 2.6, 0, Math.PI * 2);
      ctx.arc(-10, 13, 2.6, 0, Math.PI * 2);
      ctx.arc(13, 0, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#d2b48a";
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      inkStroke();
      shadeUpperLeft(0, 0, 12, 12);
      ctx.fillStyle = "#14110e";
      ctx.beginPath();
      ctx.ellipse(5.5, 0, 5.2, 6.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(7.6, -2.4, 1.8, 0, Math.PI * 2);
      ctx.arc(7.6, 2.4, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.lineWidth = 1;
      ctx.lineCap = "butt";
    }

    function drawGruntLamp(e) {
      var s = Math.max(0.95, e.r / 11);
      var x = e.x;
      var y = e.y - 11 * s;
      ctx.fillStyle = "rgba(239,68,68,0.28)";
      ctx.beginPath();
      ctx.arc(x, y, 6.2 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#7f1d1d";
      ctx.beginPath();
      ctx.arc(x, y, 4.1 * s, 0, Math.PI * 2);
      ctx.fill();
      inkStroke();
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(x, y, 2.8 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fee2e2";
      ctx.beginPath();
      ctx.arc(x - 1.1 * s, y - 1.2 * s, 1.15 * s, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawCrawler(e) {
      var r = e.r;
      ctx.strokeStyle = "#1a120c";
      ctx.lineWidth = Math.max(2.5, r * 0.18);
      ctx.lineCap = "round";
      var legs = [
        [-0.2, -0.15, -1.15, -0.85],
        [-0.2, 0.15, -1.15, 0.85],
        [0.15, -0.2, 0.95, -0.95],
        [0.15, 0.2, 0.95, 0.95]
      ];
      var i;
      ctx.beginPath();
      for (i = 0; i < legs.length; i++) {
        ctx.moveTo(r * legs[i][0], r * legs[i][1]);
        ctx.lineTo(r * legs[i][2], r * legs[i][3]);
      }
      ctx.stroke();
      ctx.fillStyle = "#e8e4dc";
      ctx.beginPath();
      ctx.moveTo(r * 0.85, -r * 0.15);
      ctx.lineTo(r * 1.45, -r * 0.02);
      ctx.lineTo(r * 0.95, -r * 0.55);
      ctx.closePath();
      ctx.moveTo(r * 0.85, r * 0.15);
      ctx.lineTo(r * 1.45, r * 0.02);
      ctx.lineTo(r * 0.95, r * 0.55);
      ctx.closePath();
      ctx.fill();
      inkStroke();
      ctx.fillStyle = "#c4a06a";
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.95, r * 0.58, 0, 0, Math.PI * 2);
      ctx.fill();
      inkStroke();
      shadeUpperLeft(0, 0, r * 0.95, r * 0.58);
      ctx.fillStyle = "#14110e";
      ctx.beginPath();
      ctx.ellipse(r * 0.42, 0, r * 0.34, r * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.ellipse(r * 0.62, -r * 0.06, r * 0.1, r * 0.07, 0, 0, Math.PI * 2);
      ctx.ellipse(r * 0.62, r * 0.08, r * 0.1, r * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.lineCap = "butt";
    }

    function drawFortress(e) {
      var r = e.r;
      var i, a;
      ctx.fillStyle = "#6e5134";
      ctx.beginPath();
      ctx.ellipse(r * 0.08, r * 0.18, r * 1.02, r * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#d2b48a";
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.02, r * 0.78, 0, 0, Math.PI * 2);
      ctx.fill();
      inkStroke();
      shadeUpperLeft(0, 0, r * 1.02, r * 0.78);
      ctx.strokeStyle = "#1a120c";
      ctx.lineWidth = Math.max(1.6, r * 0.07);
      for (i = 0; i < 5; i++) {
        a = -0.9 + i * 0.45;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.35, Math.sin(a) * r * 0.28);
        ctx.lineTo(Math.cos(a) * r * 1.0, Math.sin(a) * r * 0.76);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
    }

    function drawFortressCore(e) {
      var r = e.kind === "boss" ? e.r * 0.95 : e.r;
      var x = e.x;
      var y = e.y - r * 0.22;
      ctx.fillStyle = "rgba(217,70,239,0.28)";
      ctx.beginPath();
      ctx.arc(x, y, r * 0.46, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2a1a3a";
      ctx.beginPath();
      ctx.arc(x, y, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      inkStroke();
      var core = ctx.createRadialGradient(x - r * 0.08, y - r * 0.1, 1, x, y, r * 0.26);
      core.addColorStop(0, "#f5d0fe");
      core.addColorStop(0.5, "#d946ef");
      core.addColorStop(1, "#6b21a8");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
      var k;
      for (k = 0; k < 3; k++) {
        ctx.fillStyle = "#e879f9";
        ctx.beginPath();
        ctx.arc(x + (k - 1) * r * 0.46, e.y + r * 0.38, r * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawDrone(e) {
      var r = e.r;
      ctx.fillStyle = "#c4a06a";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
      ctx.fill();
      inkStroke();
      shadeUpperLeft(0, 0, r * 0.9, r * 0.9);
      ctx.fillStyle = "#c4a06a";
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, -r * 0.45);
      ctx.lineTo(-r * 1.15, -r * 0.15);
      ctx.lineTo(-r * 0.2, -r * 0.05);
      ctx.closePath();
      ctx.fill();
      inkStroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, r * 0.45);
      ctx.lineTo(-r * 1.15, r * 0.15);
      ctx.lineTo(-r * 0.2, r * 0.05);
      ctx.closePath();
      ctx.fill();
      inkStroke();
      ctx.fillStyle = "#14110e";
      ctx.beginPath();
      ctx.arc(r * 0.22, 0, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#facc15";
      ctx.beginPath();
      ctx.arc(r * 0.34, 0, r * 0.24, 0, Math.PI * 2);
      ctx.fill();
      inkStroke();
      ctx.fillStyle = "#fffbeb";
      ctx.beginPath();
      ctx.arc(r * 0.28, -r * 0.06, r * 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1;
    }

    function drawDroneBeam(e, facing) {
      var r = e.r;
      var len = r * 2.8;
      var x0 = e.x + Math.cos(facing) * r * 0.75;
      var y0 = e.y + Math.sin(facing) * r * 0.75;
      var x1 = e.x + Math.cos(facing) * len;
      var y1 = e.y + Math.sin(facing) * len;
      ctx.strokeStyle = "rgba(250,204,21,0.32)";
      ctx.lineWidth = Math.max(3, r * 0.5);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.strokeStyle = "#fde68a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.save();
      ctx.translate(x1, y1);
      ctx.scale(1, 0.42);
      ctx.fillStyle = "rgba(250,204,21,0.22)";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 1.6;
      ctx.setLineDash([3.5, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      ctx.lineWidth = 1;
    }

    function drawBoss(e) {
      drawFortress({ x: 0, y: 0, r: e.r * 0.95 });
      ctx.strokeStyle = ORANGE;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, e.r * 1.08, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    function shadowFor(e) {
      if (e.kind === "crawler") return [e.r * 1.35, e.r * 0.5];
      if (e.kind === "fortress") return [e.r * 1.1, e.r * 0.48];
      if (e.kind === "boss") return [e.r * 1.15, e.r * 0.5];
      if (e.kind === "drone") return [e.r * 0.7, e.r * 0.28];
      return [14, 7];
    }

    function drawEnemy(e) {
      var facing = Math.atan2(player.y - e.y, player.x - e.x);
      var sh = shadowFor(e);
      castShadow(e.x, e.y, sh[0], sh[1]);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(facing);
      if (e.kind === "crawler") drawCrawler(e);
      else if (e.kind === "fortress") drawFortress(e);
      else if (e.kind === "drone") drawDrone(e);
      else if (e.kind === "boss") drawBoss(e);
      else drawGrunt(e);
      ctx.restore();
      if (e.kind === "grunt") drawGruntLamp(e);
      else if (e.kind === "fortress" || e.kind === "boss") drawFortressCore(e);
      else if (e.kind === "drone") drawDroneBeam(e, facing);
      drawHpBar(e);
    }

    var platePattern = null;

    function stampTread(g, cx, cy) {
      g.save();
      g.translate(cx, cy);
      g.rotate(Math.PI / 4);
      g.fillStyle = "rgba(48,32,16,0.55)";
      g.beginPath();
      g.moveTo(0, -6.4);
      g.lineTo(3.5, 0.8);
      g.lineTo(0, 6.6);
      g.lineTo(-3.5, 0.8);
      g.closePath();
      g.fill();
      g.fillStyle = "#f3e7d0";
      g.beginPath();
      g.moveTo(0, -5.4);
      g.lineTo(2.7, -0.2);
      g.lineTo(0, 4.6);
      g.lineTo(-2.7, -0.2);
      g.closePath();
      g.fill();
      g.fillStyle = "rgba(255,250,236,0.9)";
      g.beginPath();
      g.moveTo(0, -4.6);
      g.lineTo(1.5, -1.4);
      g.lineTo(-1.5, -1.4);
      g.closePath();
      g.fill();
      g.restore();
    }

    function floorPlate() {
      if (platePattern) return platePattern;
      var doc = canvas.ownerDocument;
      if (!doc || !doc.createElement) return null;
      var sheet = doc.createElement("canvas");
      sheet.width = 36;
      sheet.height = 28;
      var g = sheet.getContext("2d");
      g.fillStyle = "#b7a58c";
      g.fillRect(0, 0, 36, 28);
      stampTread(g, 9, 7);
      stampTread(g, 27, 7);
      stampTread(g, 18, 21);
      stampTread(g, 0, 21);
      stampTread(g, 36, 21);
      platePattern = ctx.createPattern(sheet, "repeat");
      return platePattern;
    }

    function drawFloorTile(px, py, size, tx, ty, outdoor) {
      var s = size + 0.6;
      var n = tileHash(tx, ty, 1);
      var n2 = tileHash(tx, ty, 2);
      if (outdoor) {
        ctx.fillStyle = "#d2bc96";
        ctx.fillRect(px - 1, py - 1, s + 1, s + 1);
        ctx.fillStyle = "rgba(255,236,200," + (0.08 + (1 - n) * 0.08) + ")";
        ctx.beginPath();
        ctx.ellipse(px + size * 0.28, py + size * 0.24, 16, 5.5, -0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(90,62,32," + (0.1 + n * 0.12) + ")";
        ctx.beginPath();
        ctx.ellipse(px + size * 0.68, py + size * 0.72, 15 + n * 8, 5 + n2 * 3, -0.5, 0, Math.PI * 2);
        ctx.fill();
        if (n2 > 0.35) {
          ctx.strokeStyle = "rgba(255,244,220," + (0.16 + n * 0.14) + ")";
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          var wx = px + 8 + n * 12;
          var wy = py + 10 + n2 * 12;
          ctx.moveTo(wx, wy);
          ctx.lineTo(wx + 18, wy + 7);
          ctx.stroke();
        }
        ctx.lineWidth = 1;
        return;
      }
      ctx.fillStyle = floorPlate() || "#b7a58c";
      ctx.fillRect(px - 0.5, py - 0.5, size + 1, size + 1);
      ctx.lineWidth = 1;
    }

    function drawFloorDecorItem(d) {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot || 0);
      if (d.kind === "ship") {
        drawCrashedShip();
      } else if (d.kind === "box") {
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.beginPath();
        ctx.ellipse(1, 4, 14, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        var wood = ctx.createLinearGradient(-12, -12, 12, 12);
        wood.addColorStop(0, "#c4a06a");
        wood.addColorStop(0.45, "#8b5a2b");
        wood.addColorStop(1, "#4a3018");
        ctx.fillStyle = wood;
        ctx.beginPath();
        // rounded crate
        var rr = 3;
        ctx.moveTo(-12 + rr, -11);
        ctx.lineTo(12 - rr, -11);
        ctx.quadraticCurveTo(12, -11, 12, -11 + rr);
        ctx.lineTo(12, 11 - rr);
        ctx.quadraticCurveTo(12, 11, 12 - rr, 11);
        ctx.lineTo(-12 + rr, 11);
        ctx.quadraticCurveTo(-12, 11, -12, 11 - rr);
        ctx.lineTo(-12, -11 + rr);
        ctx.quadraticCurveTo(-12, -11, -12 + rr, -11);
        ctx.fill();
        ctx.strokeStyle = "rgba(40,24,12,0.55)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = "#d4b896";
        ctx.globalAlpha = 0.35;
        ctx.fillRect(-12, -11, 24, 4);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#2a2118";
        ctx.fillRect(-12, -1, 24, 3);
        ctx.fillRect(-2, -11, 4, 22);
        ctx.fillStyle = "#a16207";
        ctx.fillRect(-5, 3, 10, 4);
      } else if (d.kind === "barrel") {
        ctx.fillStyle = "rgba(0,0,0,0.28)";
        ctx.beginPath();
        ctx.ellipse(1, 5, 9, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        var steel = ctx.createLinearGradient(-8, -10, 8, 10);
        steel.addColorStop(0, "#9aa3ad");
        steel.addColorStop(0.5, "#4b5563");
        steel.addColorStop(1, "#1f2937");
        ctx.fillStyle = steel;
        ctx.beginPath();
        ctx.ellipse(0, 0, 9, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(220,230,240,0.25)";
        ctx.beginPath();
        ctx.ellipse(0, -4, 9, 3, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(0, 4, 9, 3, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = ORANGE;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (d.kind === "rock") {
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.beginPath();
        ctx.ellipse(1, 3, 11, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#5c5346";
        ctx.beginPath();
        ctx.moveTo(-10, 2);
        ctx.quadraticCurveTo(-8, -8, 0, -9);
        ctx.quadraticCurveTo(9, -7, 11, 1);
        ctx.quadraticCurveTo(4, 8, -6, 7);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.beginPath();
        ctx.ellipse(-3, -3, 3, 2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.kind === "scrap") {
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.beginPath();
        ctx.ellipse(0, 3, 10, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#6b7280";
        ctx.beginPath();
        ctx.moveTo(-9, -1);
        ctx.lineTo(4, -4);
        ctx.lineTo(8, 2);
        ctx.lineTo(-5, 4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = TEAL;
        ctx.globalAlpha = 0.45;
        ctx.fillRect(-2, -2, 5, 3);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#9ca3af";
        ctx.fillRect(3, -6, 4, 7);
      } else if (d.kind === "stain") {
        ctx.fillStyle = "rgba(20,14,8,0.28)";
        ctx.beginPath();
        ctx.ellipse(0, 0, 12 + d.v * 2, 7 + d.v, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(80,40,20,0.15)";
        ctx.beginPath();
        ctx.ellipse(3, 1, 6, 3, -0.3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        rivetAt(0, 0, 1.8);
      }
      ctx.restore();
    }

    function drawCrashedShip() {
      ctx.fillStyle = "rgba(20,12,8,0.4)";
      ctx.beginPath();
      ctx.ellipse(6, 22, 70, 20, 0.15, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(48,24,10,0.5)";
      ctx.beginPath();
      ctx.ellipse(-16, 18, 78, 26, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(24,12,6,0.45)";
      ctx.beginPath();
      ctx.ellipse(-48, 10, 28, 12, 0.15, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#9aa3ad";
      ctx.beginPath();
      ctx.moveTo(34, 16);
      ctx.lineTo(52, 26);
      ctx.lineTo(40, 22);
      ctx.closePath();
      ctx.fill();
      inkStroke();
      ctx.fillStyle = "#5eead4";
      ctx.globalAlpha = 0.45;
      ctx.fillRect(38, 18, 6, 3);
      ctx.globalAlpha = 1;

      ctx.fillStyle = "#3d4c56";
      ctx.beginPath();
      ctx.moveTo(-6, -14);
      ctx.lineTo(-62, -46);
      ctx.lineTo(-48, -22);
      ctx.lineTo(-28, -10);
      ctx.closePath();
      ctx.fill();
      inkStroke();
      ctx.strokeStyle = ORANGE;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-14, -14);
      ctx.lineTo(-50, -36);
      ctx.stroke();
      ctx.strokeStyle = "#1a120c";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-40, -34);
      ctx.lineTo(-36, -18);
      ctx.stroke();

      var hull = ctx.createLinearGradient(-70, -18, 64, 18);
      hull.addColorStop(0, "#5eead4");
      hull.addColorStop(0.4, "#2f8f8a");
      hull.addColorStop(0.78, "#1a4f4c");
      hull.addColorStop(1, "#0f2e2c");
      ctx.fillStyle = hull;
      ctx.beginPath();
      ctx.moveTo(64, -2);
      ctx.quadraticCurveTo(42, -26, 8, -20);
      ctx.lineTo(-32, -16);
      ctx.quadraticCurveTo(-72, -8, -62, 4);
      ctx.quadraticCurveTo(-50, 22, -18, 18);
      ctx.lineTo(16, 18);
      ctx.quadraticCurveTo(50, 16, 64, -2);
      ctx.closePath();
      ctx.fill();
      inkStroke();
      shadeUpperLeft(0, 0, 58, 18);

      ctx.strokeStyle = "rgba(8,40,38,0.7)";
      ctx.lineWidth = 2;
      var rib;
      for (rib = 0; rib < 5; rib++) {
        var rx = -22 + rib * 14;
        ctx.beginPath();
        ctx.moveTo(rx, -12);
        ctx.quadraticCurveTo(rx + 5, 0, rx, 12);
        ctx.stroke();
      }

      ctx.strokeStyle = "#ea580c";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-36, 3);
      ctx.lineTo(36, -3);
      ctx.stroke();

      ctx.fillStyle = "#0b1214";
      ctx.beginPath();
      ctx.ellipse(30, -3, 13, 8, 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#99f6e4";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = "rgba(153,246,228,0.85)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(22, -6);
      ctx.lineTo(34, 2);
      ctx.lineTo(26, 4);
      ctx.moveTo(30, -8);
      ctx.lineTo(38, 1);
      ctx.stroke();

      ctx.fillStyle = "#1f2937";
      ctx.beginPath();
      ctx.ellipse(-58, 3, 12, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      inkStroke();
      ctx.strokeStyle = "#6b7280";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(-58, 3, 7, 5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(249,115,22,0.7)";
      ctx.beginPath();
      ctx.arc(-58, 3, 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#cbd5e1";
      ctx.beginPath();
      ctx.moveTo(18, 20);
      ctx.lineTo(36, 28);
      ctx.lineTo(22, 24);
      ctx.closePath();
      ctx.fill();
      inkStroke();
      ctx.beginPath();
      ctx.moveTo(-8, 22);
      ctx.lineTo(6, 30);
      ctx.lineTo(-4, 26);
      ctx.closePath();
      ctx.fill();
      inkStroke();

      var puff = (Date.now() / 700) % 1;
      ctx.fillStyle = "rgba(220,220,220," + (0.16 + puff * 0.14) + ")";
      ctx.beginPath();
      ctx.arc(-24, -22 - puff * 8, 6 + puff * 3, 0, Math.PI * 2);
      ctx.arc(-8, -34 - puff * 10, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1;
    }

    function drawMetalDoor(px, py, size, colour) {
      var s = size + 0.5;
      var plate = ctx.createLinearGradient(px, py, px, py + s);
      plate.addColorStop(0, "#efe0c4");
      plate.addColorStop(0.35, "#d2b48a");
      plate.addColorStop(1, "#8d6b45");
      ctx.fillStyle = plate;
      roundPlate(px + 2, py + 2, s - 4, s - 4, 6);
      ctx.fill();
      ctx.strokeStyle = "#1a120c";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,244,220,0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px + 8, py + s - 8);
      ctx.lineTo(px + 8, py + 8);
      ctx.lineTo(px + s - 8, py + 8);
      ctx.stroke();
      ctx.fillStyle = colour || ORANGE;
      roundPlate(px + 6, py + 8, 7, s - 16, 2);
      ctx.fill();
      ctx.strokeStyle = "#1a120c";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#1a120c";
      roundPlate(px + s * 0.5 - 8, py + s * 0.5 - 10, 16, 20, 3);
      ctx.fill();
      ctx.fillStyle = colour || ORANGE;
      ctx.fillRect(px + s * 0.5 - 5, py + s * 0.5 - 6, 10, 6);
      ctx.beginPath();
      ctx.arc(px + s * 0.5, py + s * 0.5 + 6, 3, 0, Math.PI * 2);
      ctx.fill();
      rivetAt(px + 14, py + 12, 2.4);
      rivetAt(px + s - 14, py + 12, 2.4);
      rivetAt(px + 14, py + s - 18, 2.4);
      rivetAt(px + s - 14, py + s - 18, 2.4);
      var doorFace = ctx.createLinearGradient(px, py + s - 8, px, py + s);
      doorFace.addColorStop(0, "#8a6244");
      doorFace.addColorStop(1, "#3a2416");
      ctx.fillStyle = doorFace;
      ctx.fillRect(px + 2, py + s - 8, s - 4, 8);
      ctx.lineWidth = 1;
    }

    function drawKeycard(x, y, colour) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.35);
      ctx.fillStyle = "rgba(26,18,12,0.35)";
      roundPlate(-13, -7, 28, 18, 3);
      ctx.fill();
      ctx.fillStyle = colour;
      roundPlate(-14, -10, 28, 18, 3);
      ctx.fill();
      ctx.strokeStyle = "#1a120c";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = "#1a120c";
      ctx.fillRect(-14, -2, 28, 5);
      ctx.fillStyle = "#f8f1e3";
      roundPlate(-10, -7, 8, 4, 1);
      ctx.fill();
      ctx.strokeStyle = "#1a120c";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
      ctx.lineWidth = 1;
    }

    function drawAmmoCrate(x, y) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = "rgba(26,18,12,0.35)";
      roundPlate(-15, -10, 32, 26, 4);
      ctx.fill();
      var plate = ctx.createLinearGradient(-16, -14, 16, 14);
      plate.addColorStop(0, "#efe0c4");
      plate.addColorStop(0.5, "#d2b48a");
      plate.addColorStop(1, "#8d6b45");
      ctx.fillStyle = plate;
      roundPlate(-16, -14, 32, 26, 4);
      ctx.fill();
      ctx.strokeStyle = "#1a120c";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = ORANGE;
      roundPlate(-10, -2, 20, 10, 2);
      ctx.fill();
      ctx.strokeStyle = "#1a120c";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#1a120c";
      ctx.font = "800 8px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("AMMO", 0, 3);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      rivetAt(-11, -9, 1.8);
      rivetAt(11, -9, 1.8);
      rivetAt(-11, 8, 1.8);
      rivetAt(11, 8, 1.8);
      ctx.lineWidth = 1;
      ctx.restore();
    }

    function drawCache(cache) {
      ctx.save();
      ctx.translate(cache.x, cache.y);
      ctx.fillStyle = "rgba(26,18,12,0.35)";
      ctx.beginPath();
      ctx.ellipse(1, 6, 12, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = cache.kind === "patch" ? "#2f8f8a" : "#e8d0a8";
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1a120c";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#1a120c";
      ctx.font = "800 8px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(cache.kind === "patch" ? "PATCH" : "CACHE", 0, 1);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.restore();
    }

    function drawTerminalProp(x, y, dim) {
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(x - 11, y - 13, 22, 26);
      ctx.strokeStyle = "#64748b";
      ctx.strokeRect(x - 11, y - 13, 22, 26);
      ctx.fillStyle = "#0ea5e9";
      ctx.fillRect(x - 8, y - 9, 16, 11);
      ctx.fillStyle = "#e0f2fe";
      ctx.fillRect(x - 6, y - 7, 12, 3);
      ctx.fillStyle = dim;
      ctx.font = "10px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("E", x, y + 20);
      ctx.textAlign = "left";
    }

    function drawMinimap(text, dim, danger, colours) {
      if (!map || !map.cols || !map.rows) return;
      var mw = 156;
      var mh = 96;
      var mx = w - mw - 14;
      var my = 14;
      var cellW = mw / map.cols;
      var cellH = mh / map.rows;
      roundPlate(mx - 4, my - 4, mw + 16, mh + 16, 8);
      ctx.fillStyle = "rgba(20,12,8,0.4)";
      ctx.fill();
      roundPlate(mx - 8, my - 8, mw + 16, mh + 16, 8);
      ctx.fillStyle = "#14110e";
      ctx.fill();
      ctx.strokeStyle = "#e8d0a8";
      ctx.lineWidth = 3;
      ctx.stroke();
      var y;
      for (y = 0; y < map.rows; y++) {
        var x;
        for (x = 0; x < map.cols; x++) {
          var tile = map.tiles[y][x];
          if (!tile) continue;
          var px = mx + x * cellW;
          var py = my + y * cellH;
          if (tile.kind === "wall") ctx.fillStyle = "#e8d0a8";
          else if (tile.cache) ctx.fillStyle = "#2f8f8a";
          else if (tile.kind === "door" && !tile.open) ctx.fillStyle = colours[tile.colour] || ORANGE;
          else if (tile.kind === "exit") ctx.fillStyle = ORANGE;
          else if (tile.outdoor) ctx.fillStyle = "#3a2e22";
          else ctx.fillStyle = "#241c16";
          ctx.fillRect(px, py, cellW + 0.5, cellH + 0.5);
        }
      }
      var unitX = mw / map.width;
      var unitY = mh / map.height;
      for (var i = 0; i < enemies.length; i++) {
        ctx.fillStyle = danger || "#ef4444";
        ctx.fillRect(mx + enemies[i].x * unitX - 1.5, my + enemies[i].y * unitY - 1.5, 3, 3);
      }
      ctx.fillStyle = "#2f8f8a";
      ctx.beginPath();
      ctx.arc(mx + player.x * unitX, my + player.y * unitY, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1;
    }

    function drawVignette() {
      var g = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.25, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    function solidTile(tx, ty) {
      if (!map || ty < 0 || tx < 0 || ty >= map.rows || tx >= map.cols) return true;
      var tile = map.tiles[ty][tx];
      return tile && (tile.kind === "wall" || (tile.kind === "door" && !tile.open));
    }

    function drawMetalWall(px, py, size, tx, ty) {
      var lip = 9;
      var south = !solidTile(tx, ty + 1);
      var east = !solidTile(tx + 1, ty);
      var north = !solidTile(tx, ty - 1);
      var west = !solidTile(tx - 1, ty);
      var topW = size - (east ? lip : 0);
      var topH = size - (south ? lip : 0);
      var plate = ctx.createLinearGradient(px, py, px + topW, py + topH);
      plate.addColorStop(0, "#f3e6cf");
      plate.addColorStop(0.5, "#c4a06a");
      plate.addColorStop(1, "#8a6844");
      ctx.fillStyle = plate;
      ctx.fillRect(px, py, topW + 0.5, topH + 0.5);

      ctx.fillStyle = "rgba(42,26,14,0.5)";
      if (!east) ctx.fillRect(px + topW - 2, py, 2, topH);
      if (!south) ctx.fillRect(px, py + topH - 2, topW, 2);

      ctx.strokeStyle = "#1a120c";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      if (north) {
        ctx.moveTo(px, py + 1.5);
        ctx.lineTo(px + topW, py + 1.5);
      }
      if (west) {
        ctx.moveTo(px + 1.5, py);
        ctx.lineTo(px + 1.5, py + topH);
      }
      if (south) {
        ctx.moveTo(px, py + topH - 1);
        ctx.lineTo(px + topW, py + topH - 1);
      }
      if (east) {
        ctx.moveTo(px + topW - 1, py);
        ctx.lineTo(px + topW - 1, py + topH);
      }
      ctx.stroke();

      var h = tileHash(tx, ty, 4);
      if (h > 0.4 && topW > 22 && topH > 22) {
        var inset = 7 + Math.floor(tileHash(tx, ty, 6) * 6);
        var pw = topW - inset * 2;
        var ph = topH - inset * 2;
        if (pw > 8 && ph > 8) {
          ctx.strokeStyle = "rgba(26,18,12,0.5)";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(px + inset, py + inset, pw, ph);
          if (h > 0.72) {
            rivetAt(px + inset + 4, py + inset + 4, 1.8);
            rivetAt(px + inset + pw - 4, py + inset + 4, 1.8);
          }
        }
      } else if (topW > 28 && topH > 28) {
        rivetAt(px + 10, py + 10, 2);
        rivetAt(px + topW - 10, py + 10, 2);
      }

      if (north) {
        ctx.strokeStyle = "rgba(255,244,220,0.5)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px + 4, py + 4);
        ctx.lineTo(px + Math.max(8, topW - 4), py + 4);
        ctx.stroke();
      }
      if (south) {
        var face = ctx.createLinearGradient(px, py + topH, px, py + size);
        face.addColorStop(0, "#8a6244");
        face.addColorStop(1, "#3a2416");
        ctx.fillStyle = face;
        ctx.fillRect(px, py + topH, topW + 0.5, lip + 0.5);
        ctx.fillStyle = "rgba(255,220,180,0.28)";
        ctx.fillRect(px, py + topH, topW, 2);
      }
      if (east) {
        ctx.fillStyle = "#2c1b12";
        ctx.fillRect(px + topW, py, lip + 0.5, size + 0.5);
        ctx.fillStyle = "rgba(255,220,180,0.12)";
        ctx.fillRect(px + topW, py, 2, size);
      }
      ctx.lineWidth = 1;
    }

    function beginFrame() {
      ctx.setTransform(viewScale, 0, 0, viewScale, 0, 0);
      ctx.imageSmoothingEnabled = true;
      if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
    }

    function render() {
      beginFrame();
      if (!map) {
        ctx.clearRect(0, 0, w, h);
        return;
      }

      var text = readColour("--text", "#e8e8e8");
      var dim = readColour("--text-dim", "#8a8a8a");
      var danger = readColour("--danger", "#f2857c");
      var colours = window.GameMap.KEY_COLOURS;
      var sx = shake > 0 ? (Math.random() - 0.5) * 6 : 0;
      var sy = shake > 0 ? (Math.random() - 0.5) * 6 : 0;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#1a140e";
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(-camX + sx, -camY + sy);

      var t = map.tile;
      var y;
      for (y = 0; y < map.rows; y++) {
        var x;
        for (x = 0; x < map.cols; x++) {
          var tile = map.tiles[y][x];
          var px = x * t;
          var py = y * t;
          if (tile.kind === "wall") {
            drawMetalWall(px, py, t, x, y);
          } else if (tile.kind === "door" && !tile.open) {
            drawMetalDoor(px, py, t, colours[tile.colour] || ORANGE);
          } else {
            drawFloorTile(px, py, t, x, y, !!tile.outdoor);
            if (tile.kind === "exit") {
              var ready = window.GameMap.allDoorsOpen(map);
              ctx.strokeStyle = ready ? ORANGE : dim;
              ctx.globalAlpha = ready ? 0.9 : 0.35;
              ctx.lineWidth = 2;
              ctx.strokeRect(px + 8, py + 8, t - 16, t - 16);
              ctx.font = "700 11px system-ui, sans-serif";
              ctx.fillStyle = ready ? ORANGE : dim;
              ctx.textAlign = "center";
              ctx.fillText("EXIT", px + t * 0.5, py + t * 0.55);
              ctx.textAlign = "left";
              ctx.globalAlpha = 1;
              ctx.lineWidth = 1;
            }
          }
        }
      }

      for (var di = 0; di < floorDecor.length; di++) {
        drawFloorDecorItem(floorDecor[di]);
      }

      for (var ti = 0; ti < map.terminals.length; ti++) {
        drawTerminalProp(map.terminals[ti].x, map.terminals[ti].y, dim);
      }

      for (var ai = 0; ai < map.ammoCrates.length; ai++) {
        if (map.ammoCrates[ai].taken) continue;
        drawAmmoCrate(map.ammoCrates[ai].x, map.ammoCrates[ai].y);
      }

      for (var ci = 0; ci < (map.caches || []).length; ci++) {
        if (map.caches[ci].taken) continue;
        drawCache(map.caches[ci]);
      }

      for (var ki = 0; ki < map.keys.length; ki++) {
        var key = map.keys[ki];
        if (key.taken) continue;
        drawKeycard(key.x, key.y, colours[key.colour] || ORANGE);
      }

      for (var i = 0; i < enemies.length; i++) {
        drawEnemy(enemies[i]);
      }

      for (i = 0; i < hitMarks.length; i++) {
        var hm = hitMarks[i];
        ctx.globalAlpha = Math.max(0, hm.life * 4);
        ctx.strokeStyle = ORANGE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hm.x, hm.y, 10 + (0.25 - hm.life) * 30, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      for (i = 0; i < bullets.length; i++) {
        var b = bullets[i];
        ctx.fillStyle = "rgba(249,115,22,0.35)";
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff7ed";
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ORANGE;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
      }

      for (i = 0; i < enemyShots.length; i++) {
        var shot = enemyShots[i];
        ctx.beginPath();
        ctx.arc(shot.x, shot.y, shot.r, 0, Math.PI * 2);
        ctx.fillStyle = YELLOW;
        ctx.fill();
        ctx.strokeStyle = "rgba(250,204,21,0.5)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(shot.x - shot.vx * 0.02, shot.y - shot.vy * 0.02);
        ctx.lineTo(shot.x, shot.y);
        ctx.stroke();
      }

      castShadow(player.x, player.y, 18, 8);
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(player.facing);
      ctx.globalAlpha = iframes > 0 && Math.floor(iframes * 20) % 2 === 0 ? 0.35 : 1;
      drawPlayerBody();
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.restore();

      drawVignette();
      if (flash > 0) {
        ctx.fillStyle = "rgba(180,30,30," + (flash * 1.2) + ")";
        ctx.fillRect(0, 0, w, h);
      }

      drawMinimap(text, dim, danger, colours);

      if (patchRun && nearShip() && !shopOpen && playing && !paused) {
        ctx.fillStyle = text;
        ctx.font = "600 13px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Hold E — patch the hull", w * 0.5, h - 24);
        ctx.textAlign = "left";
      } else if (nearTerminal() && !shopOpen && playing && !paused) {
        ctx.fillStyle = text;
        ctx.font = "600 13px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("E — terminal", w * 0.5, h - 24);
        ctx.textAlign = "left";
      }

      if (toastLife > 0 && toastMsg) {
        ctx.font = "700 15px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        var tw = ctx.measureText(toastMsg).width;
        ctx.globalAlpha = Math.min(1, toastLife);
        roundPlate(w * 0.5 - tw / 2 - 14, 14, tw + 28, 32, 8);
        ctx.fillStyle = "#1a120c";
        ctx.fill();
        ctx.strokeStyle = "#e8d0a8";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = "#f8f1e3";
        ctx.fillText(toastMsg, w * 0.5, 30);
        ctx.globalAlpha = 1;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.lineWidth = 1;
      }

      if (paused && !shopOpen) {
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = text;
        ctx.font = "700 28px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Paused", w * 0.5, h * 0.45);
        ctx.font = "14px system-ui, sans-serif";
        ctx.fillStyle = dim;
        ctx.fillText("Press P or Esc", w * 0.5, h * 0.45 + 28);
        ctx.textAlign = "left";
      }

      if ((playing || over) && lastInput) {
        var showChrome = lastInput.touchMode ||
          (window.GameInput && window.GameInput.preferTouchChrome());
        if (showChrome) {
          if (lastInput.autoAim) {
            drawStick(lastInput.moveStick, lastInput.stickRadius, text);
            if (!lastInput.moveStick.active) drawIdleStick(dim);
            drawFirePad(!!lastInput.firePadActive, ORANGE);
          } else {
            drawStick(lastInput.moveStick, lastInput.stickRadius, text);
            drawStick(lastInput.aimStick, lastInput.stickRadius, ORANGE);
            if (!lastInput.moveStick.active && !lastInput.aimStick.active) {
              drawIdleStick(dim);
              ctx.globalAlpha = 0.22;
              ctx.strokeStyle = ORANGE;
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(w - 80, h - 80, 56, 0, Math.PI * 2);
              ctx.stroke();
              ctx.globalAlpha = 1;
            }
          }
        }
      }
    }

    function paintMenuBackdrop() {
      beginFrame();
      ctx.clearRect(0, 0, w, h);
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#12151a");
      g.addColorStop(0.55, "#0c0e12");
      g.addColorStop(1, "#07080a");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // soft sand wash (crash site mood)
      var sand = ctx.createRadialGradient(w * 0.28, h * 0.62, 20, w * 0.28, h * 0.62, w * 0.45);
      sand.addColorStop(0, "rgba(120,90,50,0.18)");
      sand.addColorStop(1, "rgba(120,90,50,0)");
      ctx.fillStyle = sand;
      ctx.fillRect(0, 0, w, h);

      // distant fortress wall band
      ctx.fillStyle = "rgba(140,110,80,0.22)";
      ctx.fillRect(0, h * 0.22, w, 28);
      ctx.fillStyle = "rgba(90,70,48,0.35)";
      for (var i = 0; i < 12; i++) {
        ctx.fillRect(i * (w / 11) + 8, h * 0.22, w / 14, 28);
      }

      var card = Math.min(480, Math.max(280, w - 32));
      var margin = Math.max(72, (w - card) * 0.5);
      var shipScale = Math.max(1.05, Math.min(2.15, (margin * 0.48 - 10) / 72));
      var pilotScale = Math.max(1.45, Math.min(3.05, (margin * 0.48 - 10) / 34));
      var shipX = margin * 0.52;
      var pilotX = w - margin * 0.52;

      function menuPool(x, y, radius) {
        var pool = ctx.createRadialGradient(x, y, 8, x, y, radius);
        pool.addColorStop(0, "rgba(196,154,96,0.72)");
        pool.addColorStop(0.55, "rgba(120,86,48,0.28)");
        pool.addColorStop(1, "rgba(120,86,48,0)");
        ctx.fillStyle = pool;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      menuPool(shipX, h * 0.64, margin * 0.85);
      menuPool(pilotX, h * 0.6, margin * 0.7);

      ctx.save();
      ctx.translate(shipX, h * 0.62);
      ctx.rotate(-0.4);
      ctx.scale(shipScale, shipScale);
      drawCrashedShip();
      ctx.restore();

      castShadow(pilotX, h * 0.58, 22 * pilotScale * 0.45, 10 * pilotScale * 0.45);
      ctx.save();
      ctx.translate(pilotX, h * 0.58);
      ctx.rotate(-0.55);
      ctx.scale(pilotScale, pilotScale);
      drawPlayerBody();
      ctx.restore();
      drawVignette();
    }

    return {
      reset: reset,
      start: function (opts) {
        reset(opts || {});
        playing = true;
        over = false;
        won = false;
        paused = false;
        if (window.GameAudio && window.GameAudio.unlock) window.GameAudio.unlock();
      },
      stop: function () {
        playing = false;
        paused = false;
        shopOpen = false;
      },
      suspend: suspend,
      update: update,
      render: render,
      paintMenuBackdrop: paintMenuBackdrop,
      isPlaying: function () { return playing; },
      isPaused: function () { return paused; },
      setPaused: setPaused,
      isOver: function () { return over; },
      didWin: function () { return won; },
      getScore: function () { return score; },
      hudSnapshot: function () {
        var gearBits = [];
        if (owned.dash) gearBits.push(dashCool > 0.15 ? "Dash…" : "Dash");
        if (breachCharges) gearBits.push("Breach");
        if (owned.hull) gearBits.push("Patch");
        return {
          score: score,
          hp: hp,
          ammo: ammo,
          weapon: weapon().name,
          deck: map ? map.name : "",
          cards: { R: !!inventory.R, G: !!inventory.G, B: !!inventory.B },
          lowHp: hp <= 2,
          lowAmmo: ammo <= 8,
          gear: gearBits.join("  ")
        };
      },
      getPlayerPos: function () { return { x: player.x - camX, y: player.y - camY }; },
      setOnOver: function (fn) { onOver = fn; },
      setOnShop: function (fn) { onShop = fn; },
      setOnPause: function (fn) { onPause = fn; },
      purchase: purchase,
      closeShop: closeShop,
      shopSnapshot: shopSnapshot,
      isShopOpen: function () { return shopOpen; },
      getFacing: function () { return player.facing; },
      resize: function (width, height) {
        var dpr = 1;
        if (typeof window !== "undefined" && window.devicePixelRatio) {
          dpr = Math.min(2, window.devicePixelRatio);
        }
        viewScale = dpr;
        w = Math.max(1, Math.floor(width));
        h = Math.max(1, Math.floor(height));
        canvas.width = Math.max(1, Math.floor(w * viewScale));
        canvas.height = Math.max(1, Math.floor(h * viewScale));
        if (map) updateCamera();
      }
    };
  }

  window.ShooterGame = {
    create: create,
    circlesHit: circlesHit,
    crawlerVector: crawlerVector,
    fortressShouldFire: fortressShouldFire,
    SHOP_ITEMS: SHOP_ITEMS
  };
})();
