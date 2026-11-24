import { expect, it } from 'vitest';
import { frameDelta } from '../../src/sky/clock';
import { createPauseLatch } from '../../src/sky/pause-latch';

it('clamps a stalled flight frame and ignores a clock that runs backward', () => {
  expect(frameDelta(1500, 1000)).toBe(0.05);
  expect(frameDelta(1040, 1000)).toBeCloseTo(0.04);
  expect(frameDelta(900, 1000)).toBe(0);
  expect(frameDelta(Number.NaN, 1000)).toBe(0);
});

it('blocks the resume that arrives with the same pause gesture', () => {
  const latch = createPauseLatch(280);
  latch.arm(1000);
  expect(latch.blocks(1279)).toBe(true);
  expect(latch.blocks(1280)).toBe(false);
  expect(latch.blocks(Number.NaN)).toBe(false);
});
