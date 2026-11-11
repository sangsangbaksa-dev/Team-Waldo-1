import { expect, it } from "vitest";
import { loadGameData } from "../../src/data";
import { createWorld, step, DT } from "../../src/sim";
import { spawnEnemy } from "../../src/sim/spawn";
import { nearestTarget } from "../../src/sim/weapons/target";

it("first-person auto-aim ignores the nearest enemy behind the player", () => {
  const w = createWorld(loadGameData(), 1, { firstPerson: true });
  const slime = w.data.enemyIndex.slime_green;
  spawnEnemy(w, slime, -15, 0);
  spawnEnemy(w, slime, 45, 0);
  expect(nearestTarget(w)).toBe(1);
  expect(nearestTarget(w, 35)).toBe(-1);
});

it("the curse ends the trial even at full health and never advances while paused", () => {
  const w = createWorld(loadGameData(), 1, { curseDeadline: DT * 2 });
  step(w, [{ t: "pause" }]);
  expect(w.tick).toBe(0);
  step(w, [{ t: "resume" }]);
  expect(w.over).toBe(false);
  step(w, []);
  expect(w.over).toBe(true);
  expect(w.player.hp).toBe(0);
  expect(w.events).toContainEqual(
    expect.objectContaining({ t: "runEnd", victory: false }),
  );
});
