/* Softlock + integrity checks for all decks. Run: node --test test/ */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const jsDir = join(here, "..", "static", "js");

function load(file) {
  const source = readFileSync(join(jsDir, file), "utf8");
  const win = {};
  new Function("window", source)(win);
  return win;
}

const { GameMap } = load("map.js");

function canReachExit(map) {
  const inv = { R: false, G: false, B: false };
  const startTX = Math.floor(map.start.x / map.tile);
  const startTY = Math.floor(map.start.y / map.tile);

  function flood() {
    const seen = new Set();
    const q = [[startTX, startTY]];
    seen.add(startTX + "," + startTY);
    while (q.length) {
      const [x, y] = q.shift();
      for (let i = 0; i < map.keys.length; i++) {
        const k = map.keys[i];
        if (k.taken) continue;
        const kx = Math.floor(k.x / map.tile);
        const ky = Math.floor(k.y / map.tile);
        if (kx === x && ky === y) {
          k.taken = true;
          inv[k.colour] = true;
        }
      }
      const tile = map.tiles[y][x];
      if (tile.kind === "door" && inv[tile.colour]) tile.open = true;

      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (ny < 0 || nx < 0 || ny >= map.rows || nx >= map.cols) continue;
        const t = map.tiles[ny][nx];
        if (t.kind === "wall") continue;
        if (t.kind === "door" && !t.open && !inv[t.colour]) continue;
        if (t.kind === "door" && inv[t.colour]) t.open = true;
        const id = nx + "," + ny;
        if (seen.has(id)) continue;
        seen.add(id);
        q.push([nx, ny]);
      }
    }
    return seen;
  }

  let prev = "";
  for (let n = 0; n < 12; n++) {
    const sig = [inv.R, inv.G, inv.B, GameMap.allDoorsOpen(map)].join(",");
    if (sig === prev) break;
    prev = sig;
    flood();
  }
  const reach = flood();
  if (!GameMap.allDoorsOpen(map)) return false;
  for (const ex of map.exits) {
    if (reach.has(ex.tx + "," + ex.ty)) return true;
  }
  return false;
}

test("twenty decks parse and stay solvable", () => {
  assert.equal(GameMap.sectorCount(), 20);
  for (let i = 0; i < 20; i++) {
    const map = GameMap.cloneSector(i);
    assert.ok(map.exits.length >= 1, "deck " + i + " exit");
    assert.ok(map.keys.length >= 1, "deck " + i + " keys");
    assert.ok(map.doors.length >= 1, "deck " + i + " doors");
    assert.ok(map.terminals.length >= 1, "deck " + i + " terminal");
    assert.ok(map.ammoCrates.length >= 1, "deck " + i + " ammo");
    const doorCols = new Set(map.doors.map((d) => d.colour));
    for (const c of doorCols) {
      assert.ok(map.keys.some((k) => k.colour === c), "deck " + i + " key for " + c);
    }
    assert.ok(canReachExit(map), "deck " + i + " (" + map.name + ") softlocked");
    assert.ok(map.caches.length >= 1, "deck " + i + " side cache");
  }
  const bay = GameMap.cloneSector(19);
  assert.ok(bay.spawns.some((s) => s.kind === "boss"), "final bay boss");
  assert.ok(/Salvage/.test(bay.name), "final name");
  const crash = GameMap.cloneSector(0);
  assert.ok(/Crash/.test(crash.name), "start name");
  assert.ok((crash.ships || []).length >= 1, "crash has ship");
  assert.ok(crash.tiles.some((row) => row.some((t) => t.outdoor)), "crash has outdoor floor");
});
