import { describe, expect, it } from 'vitest';
import { blockedAt, generateMap, METROPOLIS } from '../../src/shooter/world';
import { findPath, navFor } from '../../src/shooter/nav';
import { waterDepth } from '../../src/shooter/terrain';

describe('ZERO ZONE 중앙 메트로폴리스', () => {
  it('솔로에는 중심 시가지와 3~9층 건물, 서로 다른 지형 높낮이가 생성된다', () => {
    const map = generateMap(42, 'br');
    const center = map.compounds.find(c => c.name === '중앙 메트로폴리스');
    expect(center).toBeDefined();
    expect(center?.x).toBe(0);
    expect(center?.z).toBe(0);
    const downtown = map.buildings.filter(b => Math.abs(b.x) < 45 && Math.abs(b.z) < 45);
    expect(downtown.length).toBeGreaterThanOrEqual(16);
    const towers = downtown.filter(b => b.type === 'apartment');
    expect(towers.length).toBeGreaterThanOrEqual(10);
    expect(new Set(towers.map(b => b.h)).size).toBeGreaterThan(2);
    expect(Math.max(...towers.map(b => b.h))).toBeGreaterThanOrEqual(15);
    for (const b of downtown) expect(waterDepth(map.terrain, b.x, b.z)).toBe(0);
    expect(new Set(map.terrain.hills.map(h => Math.floor(h.h))).size).toBeGreaterThan(2);
  });

  it('도심 3×3 교차로와 도로의 중심선은 엄폐물/건물에 막히지 않는다', () => {
    for (const seed of [1, 7, 42, 99]) {
      const map = generateMap(seed, 'br');
      expect(map.compounds[0].downtown).toBe(true);
      for (const x of [-METROPOLIS.lotW, 0, METROPOLIS.lotW]) {
        for (const z of [-METROPOLIS.lotD, 0, METROPOLIS.lotD]) {
          expect(blockedAt(map, x, z, 0.4)).toBe(false);
        }
      }
      const nav = navFor(map);
      expect(findPath(nav, -METROPOLIS.lotW, 0, METROPOLIS.lotW, 0, 30000)).not.toBeNull();
    }
  });

  it('도심의 전리품은 벽·상자 안에 박히지 않는다', () => {
    for (const seed of [1, 7, 42]) {
      const map = generateMap(seed, 'br');
      const towers = map.buildings.filter(b => Math.abs(b.x) < 40 && Math.abs(b.z) < 40);
      const centerLoot = map.loot.filter(l => towers.some(b =>
        Math.abs(l.x - b.x) < b.w / 2 && Math.abs(l.z - b.z) < b.d / 2));
      expect(centerLoot.length).toBeGreaterThan(25);
      for (const l of centerLoot) expect(blockedAt(map, l.x, l.z, 0.45)).toBe(false);
    }
  });

  it('중앙 도시는 시드별로 결정적이며, 대전 모드는 기존 구조를 유지한다', () => {
    const a = generateMap(42, 'br');
    const b = generateMap(42, 'br');
    expect(a.compounds).toEqual(b.compounds);
    expect(a.buildings).toEqual(b.buildings);
    const duel = generateMap(42, 'duel');
    expect(duel.compounds.some(c => c.name === '중앙 메트로폴리스')).toBe(false);
  });
});
