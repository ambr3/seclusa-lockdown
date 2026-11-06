/* Pure logic tests. Run: node --test test/*.mjs */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const jsDir = join(here, "..", "static", "js");

function load(file, extra = {}) {
  const source = readFileSync(join(jsDir, file), "utf8");
  const win = { ...extra };
  new Function("window", source)(win);
  return win;
}

const { GameMap } = load("map.js");

test("twenty decks parse", () => {
  assert.equal(GameMap.sectorCount(), 20);
  for (let i = 0; i < 20; i++) {
    const map = GameMap.cloneSector(i);
    assert.ok(map.exits.length >= 1, "deck " + i + " has exit");
    assert.ok(map.keys.length >= 1, "deck " + i + " has keys");
    assert.ok(map.doors.length >= 1, "deck " + i + " has doors");
  }
  const bay = GameMap.cloneSector(19);
  assert.ok(bay.spawns.some((s) => s.kind === "boss"), "salvage bay has boss");
  assert.ok(/Salvage/.test(bay.name), "deck 20 named salvage bay");
  const crash = GameMap.cloneSector(0);
  assert.ok(/Crash/.test(crash.name), "deck 1 named crash site");
  assert.ok((crash.ships || []).length >= 1, "deck 1 has crashed ship");
  assert.ok(crash.keys.some((k) => k.colour === "R"), "deck 1 has red keycard");
});

test("circleBlocked hits walls and closed doors", () => {
  const map = GameMap.cloneSector(0);
  assert.equal(GameMap.circleBlocked(map, 24, 24, 10), true);
  const door = map.doors[0];
  const dx = (door.x + 0.5) * map.tile;
  const dy = (door.y + 0.5) * map.tile;
  assert.equal(GameMap.circleBlocked(map, dx, dy, 8), true);
  map.tiles[door.y][door.x].open = true;
  assert.equal(GameMap.circleBlocked(map, dx, dy, 8), false);
});

test("allDoorsOpen false until unlocked", () => {
  const map = GameMap.cloneSector(0);
  assert.equal(GameMap.allDoorsOpen(map), false);
  map.doors.forEach((d) => {
    map.tiles[d.y][d.x].open = true;
  });
  assert.equal(GameMap.allDoorsOpen(map), true);
});

const { ShooterGame } = load("game.js", {
  getComputedStyle: () => ({ getPropertyValue: () => "" }),
  document: { documentElement: {} },
  GameMap,
});

test("circlesHit detects overlap", () => {
  assert.equal(ShooterGame.circlesHit(0, 0, 10, 15, 0, 10), true);
  assert.equal(ShooterGame.circlesHit(0, 0, 10, 25, 0, 10), false);
});

test("crawlers slide along a wall toward the pilot", () => {
  const along = ShooterGame.crawlerVector(100, 0, 0, 0, 0, -1);
  assert.ok(along.x > 0.5, "tangent toward the pilot");
  const chase = ShooterGame.crawlerVector(0, 40, 0, 0, 0, 0);
  assert.ok(chase.y > 0.9, "open ground is a rush");
});

test("a planted fortress fires, a walking one does not", () => {
  assert.equal(ShooterGame.fortressShouldFire(120, true, 0), true);
  assert.equal(ShooterGame.fortressShouldFire(120, false, 0), false);
  assert.equal(ShooterGame.fortressShouldFire(20, true, 0), false);
});
