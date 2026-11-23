import { describe, expect, it } from 'vitest';
import { PLAYER } from '../../src/shooter/config';
import { waterDepth } from '../../src/shooter/terrain';
import { findPath, navFor } from '../../src/shooter/nav';
import { blockedAt, generateMap } from '../../src/shooter/world';

describe('ZERO ZONE seed-wide map invariants', () => {
  it('keeps spawns dry, pickups unembedded, and representative loot reachable', () => {
    for (const seed of [0, 1, 2, 3, 5, 7, 11, 13, 17, 23, 42, 99]) {
      const map = generateMap(seed, 'br');
      const nav = navFor(map);
      expect(map.spawns.length, `seed=${seed}`).toBe(20);
      expect(map.loot.length, `seed=${seed}`).toBeGreaterThan(100);
      expect(new Set(map.loot.map(l => l.id)).size, `seed=${seed} ids`).toBe(map.loot.length);
      for (const spawn of map.spawns) {
        expect(waterDepth(map.terrain, spawn.x, spawn.z), `seed=${seed} spawn water`).toBe(0);
        expect(blockedAt(map, spawn.x, spawn.z, 1.2), `seed=${seed} spawn wall`).toBe(false);
      }
      for (const loot of map.loot) {
        expect(waterDepth(map.terrain, loot.x, loot.z), `seed=${seed} item=${loot.id} water`).toBe(0);
        expect(blockedAt(map, loot.x, loot.z, PLAYER.radius * 0.6),
          `seed=${seed} item=${loot.id} embedded`).toBe(false);
      }
      const stride = Math.max(1, Math.floor(map.loot.length / 16));
      for (let i = 0; i < map.loot.length; i += stride) {
        const l = map.loot[i];
        expect(findPath(nav, 0, 0, l.x, l.z, 300000),
          `seed=${seed} item=${l.id} at (${l.x.toFixed(2)},${l.z.toFixed(2)}) unreachable`).not.toBeNull();
      }
    }
  }, 40000);
});
