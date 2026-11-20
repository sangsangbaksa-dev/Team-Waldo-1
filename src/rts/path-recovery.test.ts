import { describe, expect, it } from 'vitest';
import { Pather } from './path';
import { RtsSim } from './sim';

describe('FRONTLINE movement recovery', () => {
  it('returns no route when surrounded by obstacles', () => {
    const n = 7, grid = new Uint8Array(n * n);
    grid.fill(1);
    grid[1 * n + 1] = 0;
    grid[5 * n + 5] = 0;
    expect(new Pather(n, grid).find(1.5, 1.5, 5.5, 5.5)).toBeNull();
  });

  it('routes around an obstacle and ends at the requested position', () => {
    const n = 9, grid = new Uint8Array(n * n);
    for (let y = 1; y < 8; y++) grid[y * n + 4] = 1;
    const route = new Pather(n, grid).find(2.5, 4.5, 6.65, 4.65);
    expect(route).not.toBeNull();
    expect(route!.length).toBeGreaterThan(2);
    expect(route!.slice(-2)).toEqual([6.65, 4.65]);
  });

  it('does not create duplicate formation positions for a repeated unit id', () => {
    const sim = new RtsSim();
    const u = sim.units.find(x => x.owner === 0)!;
    expect(sim.apply(0, { k: 'move', ids: [u.id, u.id], x: 20, y: 20 })).toBe(true);
    expect(u.o.x).toBe(20);
    expect(u.o.y).toBe(20);
  });

  it('keeps large formation destinations inside the map', () => {
    const sim = new RtsSim();
    const ids = Array.from({ length: 36 }, (_, i) => sim.spawnAt(0, 'marine', 10 + i % 6, 10 + Math.floor(i / 6)).id);
    expect(sim.apply(0, { k: 'move', ids, x: 0, y: 0 })).toBe(true);
    for (const id of ids) {
      const u = sim.unit(id)!;
      expect(u.o.x).toBeGreaterThanOrEqual(0.5);
      expect(u.o.y).toBeGreaterThanOrEqual(0.5);
      expect(u.o.x).toBeLessThanOrEqual(sim.map.size - 0.5);
      expect(u.o.y).toBeLessThanOrEqual(sim.map.size - 0.5);
    }
  });
});
