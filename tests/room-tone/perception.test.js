import { test } from "vitest";
import assert from "node:assert/strict";
import { enemyPerception, cellDistance, patrolGoal } from "../../src/room-tone/perception.mjs";
const base = { distance: 6, visible: true, facing: 1, lightOn: true,
  running: false, crouched: false, moving: false, corridorDistance: 6 };
const detect = (overrides) => enemyPerception({ ...base, ...overrides });

test("sight has direction, darkness and close-range awareness", () => {
  assert.equal(detect({}).sight, true);
  assert.equal(detect({ facing: -1 }).sight, false);
  assert.equal(detect({ distance: 2, facing: -1, lightOn: false }).sight, true);
  assert.equal(detect({ distance: 9, lightOn: false }).sight, false);
  assert.equal(detect({ visible: false }).sight, false);
});

test("hearing follows corridor distance and respects player movement", () => {
  const hidden = { distance: 3, visible: false, running: true, moving: true };
  assert.equal(detect({ ...hidden, corridorDistance: 24 }).heard, false);
  assert.equal(detect({ ...hidden, corridorDistance: 7 }).heard, true);
  assert.equal(detect({ ...hidden, corridorDistance: Infinity }).heard, false);
  assert.equal(detect({ ...hidden, moving: false, corridorDistance: 1 }).heard, false);
  assert.equal(detect({ distance: 3, crouched: true, moving: true }).heard, false);
  assert.equal(detect({ distance: 3, moving: true }).heard, true);
  assert.equal(cellDistance(-1, 2.7), Infinity);
  assert.equal(cellDistance(undefined, 2.7), Infinity);
  assert.equal(cellDistance(3, 2.7), 5.4);
});

test("patrol avoids previous and spawn cells and falls back safely", () => {
  assert.equal(patrolGoal([0,1,2,3,4], [0,1,3,7,15], 0, 1, 2, () => 0), 3);
  assert.equal(patrolGoal([0,1,2], [0,1,2], 0, 1, -1, () => 0), 2);
  assert.equal(patrolGoal([0], [0], 0, 0, -1), 0);
});
