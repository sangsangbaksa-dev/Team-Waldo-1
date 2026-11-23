import { describe, expect, it } from 'vitest';
import { Match } from '../../src/shooter/sim';
import { waterDepth } from '../../src/shooter/terrain';
import { blockedAt } from '../../src/shooter/world';

describe('ZERO ZONE supply-drop placement safety', () => {
  it('places two predictable drop crates away from water, walls, and interiors', () => {
    for (const seed of [1, 2, 3, 4, 5, 7, 11, 42, 99, 123, 2026]) {
      const a = new Match({ seed, mode: 'br', difficulty: 'normal', humans: [{ name: 'Solo' }], fill: 1, air: false, vehicles: false, bombs: false });
      const b = new Match({ seed, mode: 'br', difficulty: 'normal', humans: [{ name: 'Solo' }], fill: 1, air: false, vehicles: false, bombs: false });
      expect(a.drops.length, `seed=${seed}`).toBe(2);
      expect(a.drops.map(({ x, z, at }) => ({ x, z, at }))).toEqual(b.drops.map(({ x, z, at }) => ({ x, z, at })));
      for (const d of a.drops) {
        expect(waterDepth(a.map.terrain, d.x, d.z), `seed=${seed} drop water`).toBe(0);
        expect(blockedAt(a.map, d.x, d.z, 3.2), `seed=${seed} drop collision`).toBe(false);
        expect(a.map.buildings.some(b =>
          Math.abs(d.x - b.x) < b.w / 2 + 3.2 &&
          Math.abs(d.z - b.z) < b.d / 2 + 3.2), `seed=${seed} indoor drop`).toBe(false);
      }
      a.t = Math.max(...a.drops.map(d => d.at)) + 0.1;
      a.step(1 / 60);
      const reward = a.loot.filter(l => l.id >= 900_000 && l.id < 901_000);
      expect(reward.length, `seed=${seed} reward count`).toBe(16);
      for (const item of reward) {
        expect(waterDepth(a.map.terrain, item.x, item.z), `seed=${seed} item=${item.id} water`).toBe(0);
        expect(blockedAt(a.map, item.x, item.z, 0.45), `seed=${seed} item=${item.id} wall`).toBe(false);
      }
    }
  });
});
