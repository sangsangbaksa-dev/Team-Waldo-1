import { describe, expect, it } from 'vitest';
import { Match, blankInput, eyeOf } from '../../src/shooter/sim';
import { PLAYER } from '../../src/shooter/config';
import { generateMap } from '../../src/shooter/world';
import { WATER_SLOW, waterDepth } from '../../src/shooter/terrain';
import { findPath, navFor } from '../../src/shooter/nav';

function field(): Match {
  const m = new Match({ seed: 3, mode: 'duel', difficulty: 'normal', humans: [], fill: 2 }); m.map.boxes = []; m.map.grid.clear(); m.loot.forEach(l => { l.taken = true; });
  for (const p of m.players) { p.bot = false; p.brain = null; p.x = 0; p.z = 0; } return m;
}

describe('ZERO ZONE 지형', () => {
  it('같은 시드면 같은 지형이고, 솔로 지도에는 물·구릉·절벽·숲이 있다', () => {
    const a = generateMap(2, 'br'), b = generateMap(2, 'br'); expect(a.terrain).toEqual(b.terrain);
    expect(a.terrain.ponds.length).toBeGreaterThan(2); expect(a.terrain.hills.length).toBeGreaterThan(3); expect(a.terrain.cliffs.length).toBeGreaterThan(2); expect(a.terrain.forests.length).toBeGreaterThan(2);
  });
  it('물 위에는 건물·전리품·출발 지점이 없다', () => {
    for (const seed of [1, 2, 3, 7, 11]) {
      const m = generateMap(seed, 'br'); const t = m.terrain;
      for (const b of m.buildings) expect(waterDepth(t, b.x, b.z)).toBe(0);
      for (const l of m.loot) expect(waterDepth(t, l.x, l.z)).toBe(0);
      for (const s of m.spawns) expect(waterDepth(t, s.x, s.z)).toBe(0);
    }
  });
  it('구릉과 절벽은 걸음과 총알을 막고, 마을 사이 길은 막히지 않는다', () => {
    const m = generateMap(2, 'br'), h = m.terrain.hills[0], nav = navFor(m);
    expect(m.boxes.some(b => b.kind === 'rock' && b.x0 <= h.x && b.x1 >= h.x && b.y1 === h.h)).toBe(true);
    const a = m.compounds[0], c = m.compounds[1]; expect(findPath(nav, a.x, a.z, c.x, c.z, 400000)).not.toBeNull();
  });
  it('물에서는 느려진다', () => {
    const m = field(), p = m.players[0]; m.map.terrain.ponds.push({ x: 0, z: 0, rx: 30, rz: 30, ry: 0, swamp: true });
    p.input = { ...blankInput(), mz: 1 }; for (let i = 0; i < 120; i++) { m.step(1 / 60); m.drain(); }
    expect(p.speed).toBeLessThan(PLAYER.walk * WATER_SLOW[1] * 1.05);
  });
});

describe('ZERO ZONE 웅크리기', () => {
  it('웅크리면 눈이 낮아지고 이동이 느려지며 달릴 수 없다', () => {
    const m = field(), p = m.players[0]; p.input = { ...blankInput(), mz: 1, sprint: true, crouch: true };
    for (let i = 0; i < 90; i++) { m.step(1 / 60); m.drain(); }
    expect(p.crouch).toBeGreaterThan(0.95); expect(eyeOf(p)).toBeLessThan(PLAYER.crouchEye + 0.05); expect(p.speed).toBeLessThan(PLAYER.walk * 0.62);
  });
  it('눈높이로 수평 사격하면 웅크린 상대 머리 위로 지나가고, 아래로 겨누면 맞는다', () => {
    const m = field(), [a, b] = m.players; a.x = 0; a.z = 0; b.x = 20; b.z = 0; b.crouch = 1; const hp = b.hp;
    m.bullet(a.id, 'rifle', 0, 1.65, 0, 0, 0, [], false); expect(b.hp).toBe(hp);
    m.bullet(a.id, 'rifle', 0, 1.65, 0, 0, -0.03, [], false); expect(b.hp).toBeLessThan(hp);
    b.hp = hp; b.crouch = 0; m.bullet(a.id, 'rifle', 0, 1.65, 0, 0, 0, [], false); expect(b.hp).toBeLessThan(hp);
  });
});
