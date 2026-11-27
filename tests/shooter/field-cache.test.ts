import { describe, expect, it } from 'vitest';
import { advanceCache, createFieldCaches, CACHE_SECONDS } from '../../src/shooter/field-cache';
import { generateMap, blockedAt } from '../../src/shooter/world';
import { Match } from '../../src/shooter/sim';

describe('field caches', () => {
  it('places deterministic caches on open terrain', () => {
    const map = generateMap(7, 'br');
    const sites = createFieldCaches(map, 7);
    expect(sites).toHaveLength(2);
    expect(sites).toEqual(createFieldCaches(map, 7));
    for (const site of sites) expect(blockedAt(map, site.x, site.z, 4)).toBe(false);
  });
  it('requires uninterrupted control and pays only once', () => {
    const c = { x: 0, z: 0, progress: 0, claimed: false, expired: false, contested: false };
    expect(advanceCache(c, 3, true, false, true)).toBe(false);
    expect(advanceCache(c, 1, true, true, true)).toBe(false);
    expect(c.progress).toBe(1);
    expect(advanceCache(c, CACHE_SECONDS, true, false, true)).toBe(true);
    expect(advanceCache(c, CACHE_SECONDS, true, false, true)).toBe(false);
  });
  it('expires outside the zone and is opt-in for solo only', () => {
    const c = { x: 0, z: 0, progress: 0, claimed: false, expired: false, contested: false };
    expect(advanceCache(c, 1, true, false, false)).toBe(false);
    expect(c.expired).toBe(true);
    const options = { seed: 7, mode: 'br' as const, difficulty: 'normal' as const, humans: [{ name: 'Player' }], fill: 1 };
    expect(new Match(options).fieldCaches).toHaveLength(0);
    expect(new Match({ ...options, fieldCaches: true }).fieldCaches).toHaveLength(2);
    expect(new Match({ ...options, fieldCaches: true, humans: [{ name: 'Remote', remote: true }] }).fieldCaches).toHaveLength(0);
  });
});
