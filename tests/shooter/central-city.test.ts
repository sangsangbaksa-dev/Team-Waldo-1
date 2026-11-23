import { describe, expect, it } from 'vitest';
import { generateMap } from '../../src/shooter/world';
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

  it('중앙 도시는 시드별로 결정적이며, 대전 모드는 기존 구조를 유지한다', () => {
    const a = generateMap(42, 'br');
    const b = generateMap(42, 'br');
    expect(a.compounds).toEqual(b.compounds);
    expect(a.buildings).toEqual(b.buildings);
    const duel = generateMap(42, 'duel');
    expect(duel.compounds.some(c => c.name === '중앙 메트로폴리스')).toBe(false);
  });
});
