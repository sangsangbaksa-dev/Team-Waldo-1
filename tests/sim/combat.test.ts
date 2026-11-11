import { describe, expect, it } from "vitest";
import { loadGameData } from "../../src/data";
import { createWorld, step } from "../../src/sim";
import { spawnEnemy, spawnProjectile } from "../../src/sim/spawn";
import { PROJ_HOSTILE } from "../../src/sim/pool";
import { enemyAI } from "../../src/sim/systems/enemyAI";
import { collision } from "../../src/sim/systems/collision";
import { fireBeam, fireBoomerang } from "../../src/sim/weapons/advanced";
import { projectiles } from "../../src/sim/systems/projectiles";
function setup() {
  const d = structuredClone(loadGameData());
  d.stages.stages.forEach((s) => {
    s.waves = [];
    s.miniboss = undefined;
  });
  const w = createWorld(d, 42);
  w.player.weapons = [];
  return w;
}

describe("finished combat", () => {
  it("hostile shots hurt the player, respect invulnerability, and never hurt enemies", () => {
    const w = setup();
    spawnEnemy(w, w.data.enemyIndex.slime_green, 0, 0);
    const hp = w.enemies.hp[0];
    for (let k = 0; k < 2; k++) {
      spawnProjectile(w, 0, 0, 0, 0, 0, 4, 12, 0, 2);
      w.projectiles.hp[k] = PROJ_HOSTILE;
    }
    collision(w);
    expect(w.player.hp).toBe(w.data.balance.player.hp - 12);
    expect(w.enemies.hp[0]).toBe(hp);
    expect(w.projectiles.count).toBe(0);
    expect(w.stats.damageTaken).toBe(12);
  });
  it("ranged enemies telegraph before firing and the boss casts a ten-shot ring", () => {
    const w = setup();
    spawnEnemy(w, w.data.enemyIndex.lich, 130, 0);
    for (let i = 0; i < 70; i++) enemyAI(w);
    expect(w.projectiles.count).toBe(0);
    expect(Math.abs(w.enemies.vx[0])).toBe(0);
    for (let i = 0; i < 16; i++) enemyAI(w);
    expect(w.projectiles.count).toBe(10);
    expect(Array.from(w.projectiles.hp.slice(0, 10))).toEqual(
      Array(10).fill(PROJ_HOSTILE),
    );
  });
  it("moonbeam pierces aligned targets but excludes enemies outside the beam", () => {
    const w = setup(),
      kind = w.data.enemyIndex.golem_stone;
    spawnEnemy(w, kind, 50, 0);
    spawnEnemy(w, kind, 100, 0);
    spawnEnemy(w, kind, 100, 60);
    const def = w.data.weapons[w.data.weaponIndex.moon_beam];
    fireBeam(w, { def: 0, level: 1, cooldown: 0 }, def, def.levels[0]);
    expect(w.enemies.hp[0]).toBe(96);
    expect(w.enemies.hp[1]).toBe(96);
    expect(w.enemies.hp[2]).toBe(120);
    expect(w.events.some((e) => e.t === "beam")).toBe(true);
  });
  it("boomerangs turn toward the player and expire instead of accumulating", () => {
    const w = setup();
    spawnEnemy(w, w.data.enemyIndex.golem_stone, 180, 0);
    const def = w.data.weapons[w.data.weaponIndex.boomerang];
    fireBoomerang(
      w,
      { def: w.data.weaponIndex.boomerang, level: 1, cooldown: 0 },
      def,
      def.levels[0],
    );
    for (let i = 0; i < 30; i++) projectiles(w);
    expect(w.projectiles.vx[0]).toBeLessThan(0);
    for (let i = 0; i < 40; i++) projectiles(w);
    expect(w.projectiles.count).toBe(0);
  });
  it("pausing freezes enemy attack clocks and projectiles", () => {
    const w = setup();
    spawnEnemy(w, w.data.enemyIndex.lich, 130, 0);
    step(w, [{ t: "pause" }]);
    for (let i = 0; i < 120; i++) step(w, []);
    expect(w.time).toBe(0);
    expect(w.enemies.timer[0]).toBe(0);
    expect(w.projectiles.count).toBe(0);
  });
});
