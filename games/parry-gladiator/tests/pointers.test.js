import test from 'node:test';
import assert from 'node:assert/strict';
import { claimPointer, releasePointer, stickFromPoint } from '../src/ui/pointers.js';

test('stick input stays inside the unit circle past the pad edge', () => {
  const box = { left: 0, top: 0, width: 100, height: 100 };
  const center = stickFromPoint(50, 50, box);
  assert.deepEqual({ x: center.x, z: center.z }, { x: 0, z: 0 });
  const edge = stickFromPoint(200, 50, box);
  assert.equal(edge.x, 1);
  assert.equal(edge.z, 0);
  const up = stickFromPoint(50, 0, box);
  assert.ok(up.z > 0.9);
});

test('a second finger cannot take or release a control the first finger owns', () => {
  assert.equal(claimPointer(null, 4), 4);
  assert.equal(claimPointer(4, 9), 4);
  assert.equal(releasePointer(4, 9), 4);
  assert.equal(releasePointer(4, 4), null);
  assert.equal(releasePointer(null, 4), null);
});
