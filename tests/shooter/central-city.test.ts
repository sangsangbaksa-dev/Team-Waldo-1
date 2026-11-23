import { describe, expect, it } from 'vitest';
import { blockedAt, generateMap, METROPOLIS, rayWorld } from '../../src/shooter/world';
import { findPath, navFor } from '../../src/shooter/nav';
import { waterDepth } from '../../src/shooter/terrain';

describe('ZERO ZONE 중앙 메트로폴리스', () => {
  it('솔로에는 중심 시가지와 3~9층 건물, 서로 다른 지형 높낮이가 생성된다', () => {
    const map = generateMap(42, 'br');
    const center = map.compounds.find(c => c.name === '중앙 메트로폴리스');
    expect(center).toBeDefined();
    expect(center?.x).toBe(0);
    expect(center?.z).toBe(0);
    // 중앙 시가지를 별도 카운트해도 5종 지형 테마가 지도에 골고루 나타납니다.
    expect(new Set(map.compounds.slice(1, 6).map(c => c.theme)).size).toBe(5);
    const downtown = map.buildings.filter(b => Math.abs(b.x) < 45 && Math.abs(b.z) < 45);
    expect(downtown.length).toBeGreaterThanOrEqual(16);
    const towers = downtown.filter(b => b.type === 'apartment');
    expect(towers.length).toBeGreaterThanOrEqual(10);
    expect(new Set(towers.map(b => b.h)).size).toBeGreaterThan(2);
    expect(Math.max(...towers.map(b => b.h))).toBeGreaterThanOrEqual(12 * 3.2);
    expect(towers.some(b => b.x > 20 && b.z > 20 && b.h >= 12 * 3.2)).toBe(true);
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

  it('고층 내부는 1층 천장이 총알을 막으면서 보행/AI 공간을 유지한다', () => {
    for (const seed of [1, 42]) {
      const map = generateMap(seed, 'br');
      const towers = map.buildings.filter(b => b.type === 'apartment' && b.h >= 9);
      const ceilings = map.boxes.filter(b => b.kind === 'ceiling');
      expect(ceilings.length).toBe(towers.length);
      for (const b of towers) {
        const ceiling = ceilings.find(c => c.x0 < b.x && c.x1 > b.x && c.z0 < b.z && c.z1 > b.z);
        expect(ceiling).toBeDefined();
        expect(ceiling!.y0).toBeGreaterThan(2.5);
        expect(rayWorld(map, b.x, 2.6, b.z, 0, 1, 0, 2)).toBeCloseTo(ceiling!.y0 - 2.6, 5);
      }
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

  it('스폰 위치는 항상 맵 안의 충돌 없는 육지다', () => {
    for (const mode of ['br', 'duel'] as const) for (const seed of [1, 2, 3, 7, 11, 42]) {
      const map = generateMap(seed, mode);
      expect(map.spawns.length).toBeGreaterThanOrEqual(mode === 'br' ? 20 : 8);
      for (const s of map.spawns) {
        expect(Math.abs(s.x)).toBeLessThan(map.half - 1.2);
        expect(Math.abs(s.z)).toBeLessThan(map.half - 1.2);
        expect(blockedAt(map, s.x, s.z, 1.2)).toBe(false);
        expect(waterDepth(map.terrain, s.x, s.z)).toBe(0);
      }
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
