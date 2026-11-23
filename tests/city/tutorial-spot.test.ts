import { describe, expect, it } from 'vitest';
import { World } from '../../src/city/world';
import { clearLine, navBlocked } from '../../src/city/map';
import { freeSpot } from '../../src/city/tutorial';

describe('LAST CITY tutorial spawn visibility', () => {
  it.each([7, 42, 123])('finds a visible, walkable tutorial spawn for seed %i', seed => {
    const w = new World({ seed, difficulty: 'd4', klass: 'warlord', tutorial: true });
    const boss = w.boss(0)!, hq = w.hq(0)!;
    // Force all random attempts toward the HQ wall; the fallback must search elsewhere.
    const towardHq = Math.atan2(hq.y + hq.h / 2 - boss.y, hq.x + hq.w / 2 - boss.x);
    w.rng = () => 0.5;
    const p = freeSpot(w, towardHq, 200, 320, 0);
    expect(navBlocked(w.map, p.x, p.y)).toBe(false);
    expect(clearLine(w.map, boss.x, boss.y, p.x, p.y)).toBe(true);
    expect(Math.hypot(p.x - boss.x, p.y - boss.y)).toBeGreaterThan(35);
  });
});
