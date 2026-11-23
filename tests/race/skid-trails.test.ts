import { describe, expect, it } from 'vitest';
import { SkidTrailHistory } from '../../src/race/skid-trails';

describe('SPEED RUSH tire trails at varying display refresh rates', () => {
  it('preserves drift marks even when each 144Hz frame moves less than 20cm', () => {
    const h = new SkidTrailHistory();
    h.sample(0, 0, 0, 0);
    let visible = 0, lastEnd = 0;
    for (let frame = 1; frame <= 144; frame++) {
      const run = h.sample(0, frame * 20 / 144, 0, 0);
      if (!run) continue;
      expect(run.x).toBeCloseTo(lastEnd);
      visible += run.pieces;
      lastEnd = run.x + run.dx;
    }
    expect(visible).toBeGreaterThan(60);
    expect(lastEnd).toBeGreaterThan(19.5);
  });

  it('bridges long 20Hz movement with smaller contiguous pieces', () => {
    const h = new SkidTrailHistory();
    expect(h.sample(1, 0, 0, 0)).toBeNull();
    let previousEnd = 0, count = 0;
    for (let frame = 1; frame <= 20; frame++) {
      const run = h.sample(1, frame * 90 / 20, 0, 0)!;
      expect(run).not.toBeNull();
      expect(run.x).toBeCloseTo(previousEnd);
      expect(run.pieces).toBe(2); // 4.5 metres -> two <=3m quads
      previousEnd = run.x + run.dx;
      count += run.pieces;
    }
    expect(count).toBe(40);
    expect(previousEnd).toBeCloseTo(90);
  });

  it('breaks marks across recoveries or teleports instead of drawing an enormous quad', () => {
    const h = new SkidTrailHistory();
    h.sample(0, 0, 0, 0);
    expect(h.sample(0, 100, 0, 0)).toBeNull();
    const after = h.sample(0, 102, 0, 0)!;
    expect(after.x).toBe(100);
    expect(after.pieces).toBe(1);
  });

  it('lifts independent wheels and ignores corrupt coordinates', () => {
    const h = new SkidTrailHistory();
    h.sample(0, 0, 0, 0); h.sample(1, 1, 0, 0);
    expect(h.sample(0, NaN, 0, 0)).toBeNull();
    expect(h.sample(1, 2, 0, 0)?.x).toBe(1);
    h.lift(0);
    expect(h.sample(0, 10, 0, 0)).toBeNull();
    expect(h.sample(0, 11, 0, 0)?.x).toBe(10);
  });
});
