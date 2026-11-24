import test from 'node:test';
import assert from 'node:assert/strict';
import { duelFraming, impactAngle, impactMotion, TRAIL_LIFETIME, trailOpacity } from '../src/infrastructure/render/motion.js';

test('portrait framing changes continuously and gives fighters room', () => {
  const narrow = duelFraming(5, 0.6), wide = duelFraming(5, 1.6);
  assert.ok(narrow.depth > wide.depth && narrow.shoulder < wide.shoulder);
  assert.ok(Math.abs(duelFraming(5, 0.919).depth - duelFraming(5, 0.921).depth) < 0.01);
  assert.ok(duelFraming(8, 1.6).depth > duelFraming(2, 1.6).depth);
});
test('blade trails decay and collision sparks spread across the contact axis', () => {
  assert.equal(trailOpacity(TRAIL_LIFETIME, 2, 3), 0);
  assert.ok(trailOpacity(0, 2, 3) > trailOpacity(0.06, 2, 3));
  assert.ok(Math.abs(impactAngle(1, 0, 0.5, 0.75) - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(impactAngle(1, 0, 0.5, 0.25) + Math.PI / 2) < 1e-9);
  assert.deepEqual(impactMotion(0, 0), { x: 0, y: 0, z: 0 });
});
