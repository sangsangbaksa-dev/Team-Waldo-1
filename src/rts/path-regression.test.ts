import { describe, expect, it } from 'vitest';
import { Pather } from './path';

const pather = () => {
  const n = 16, grid = new Uint8Array(n * n);
  // An internal wall with one walkable opening.
  for (let y = 0; y < n; y++) if (y !== 8) grid[y * n + 7] = 1;
  return { grid, n, p: new Pather(n, grid) };
};
describe('FRONTLINE A* heap reuse', () => {
  it('preserves valid full routes after repeated alternating searches', () => {
    const { p } = pather();
    for (let k = 0; k < 40; k++) {
      const [sx, sy, gx, gy] = k % 2 ? [12.5, 2.5, 3.5, 2.5] : [3.5, 2.5, 12.5, 2.5];
      const route = p.find(sx, sy, gx, gy);
      expect(route).not.toBeNull();
      expect(route!.slice(-2)).toEqual([gx, gy]);
      let x = sx, y = sy;
      for (let i = 0; i < route!.length; i += 2) {
        expect(p.los(x, y, route![i], route![i + 1])).toBe(true);
        x = route![i]; y = route![i + 1];
      }
    }
  });
  it('does not reuse obsolete paths after an obstacle changes', () => {
    const { grid, n, p } = pather();
    const start = [3.5, 2.5] as const, goal = [12.5, 2.5] as const;
    const first = p.find(...start, ...goal);
    expect(first?.slice(-2)).toEqual([...goal]);
    grid[8 * n + 7] = 1;
    const blocked = p.find(...start, ...goal);
    expect(blocked?.slice(-2)).not.toEqual([...goal]);
    grid[8 * n + 7] = 0;
    const reopened = p.find(...start, ...goal);
    expect(reopened?.slice(-2)).toEqual([...goal]);
  });
});
