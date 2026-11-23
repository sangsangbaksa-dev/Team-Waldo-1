import { describe, expect, it } from 'vitest';
import { Match, blankInput } from '../../src/shooter/sim';
import { emptyTerrain, groundHeight, groundRayDistance, riseHeight } from '../../src/shooter/terrain';
import { addBox, blockedAt, circleHits, generateMap, lineClear, pushOut, rayWorld, type GameMap } from '../../src/shooter/world';

function slopeMap(): GameMap {
  const m = generateMap(1, 'duel');
  m.boxes = []; m.grid.clear(); m.terrain = emptyTerrain();
  m.terrain.rises.push({ x: 0, z: 0, r: 20, h: 4 });
  return m;
}

describe('ZERO ZONE 올라갈 수 있는 고저차', () => {
  it('중심 높이, 가장자리, 경사 중간 높이가 연속적이고 유한하다', () => {
    const slope = { x: 0, z: 0, r: 20, h: 4 };
    const t = emptyTerrain(); t.rises.push(slope);
    expect(groundHeight(t, 0, 0)).toBe(4);
    expect(groundHeight(t, 10, 0)).toBeCloseTo(2.25, 6);
    expect(groundHeight(t, 20, 0)).toBe(0);
    expect(groundHeight(t, 21, 0)).toBe(0);
    expect(riseHeight(slope, 19.999, 0)).toBeGreaterThanOrEqual(0);
    expect(riseHeight(slope, 20, 0)).toBe(0);
  });

  it('얕은 능선은 시야와 총알을 가리고, 능선 위를 넘기는 고각 사격은 통과한다', () => {
    const m = slopeMap();
    expect(lineClear(m, -25, 1.6, 0, 25, 1.6, 0)).toBe(false);
    expect(rayWorld(m, -25, 1.6, 0, 1, 0, 0, 50)).toBeLessThan(25);
    expect(lineClear(m, -25, 5, 0, 25, 5, 0)).toBe(true);
    expect(groundRayDistance(m.terrain, 0, 10, 0, 0, -1, 0, 20)).toBeCloseTo(6, 4);
    expect(groundRayDistance(m.terrain, 0, 10, 0, 0, 1, 0, 20)).toBe(Infinity);
  });

  it('아주 얇게 산 정상에 스치는 수평 총알을 표본 간격과 상관없이 차단한다', () => {
    const t = emptyTerrain();
    t.rises.push({ x: 0.37, z: 0, r: 20, h: 4 });
    const y = 3.9995;
    const d = groundRayDistance(t, -25, y, 0, 1, 0, 0, 50);
    expect(d).toBeGreaterThan(24);
    expect(d).toBeLessThan(26);
    expect(groundHeight(t, -25 + d, 0)).toBeCloseTo(y, 3);
    expect(groundRayDistance(t, -25, 4.1, 0, 1, 0, 0, 50)).toBe(Infinity);
  });

  it('오르막 위 표적은 올려 겨냥해야 명중하며 수평 사격은 지형에 막힌다', () => {
    const m = new Match({ seed: 3, mode: 'duel', difficulty: 'normal', humans: [], fill: 2 });
    m.map = slopeMap(); m.map.loot.forEach(l => { l.taken = true; });
    const [shooter, target] = m.players;
    shooter.bot = false; shooter.brain = null; shooter.x = -25; shooter.z = 0; shooter.air = 0;
    target.bot = false; target.brain = null; target.x = 0; target.z = 0; target.air = 0;
    const hp = target.hp;
    m.bullet(shooter.id, 'rifle', -25, 1.65, 0, 0, 0, [], false);
    expect(target.hp).toBe(hp);
    const raised = groundHeight(m.map.terrain, target.x, target.z);
    m.bullet(shooter.id, 'rifle', -25, 1.65, 0, 0, Math.atan2(raised, 25), [], false);
    expect(target.hp).toBeLessThan(hp);
  });

  it('캐릭터는 점프 없이 경사를 지나갈 수 있으며 지면 고도가 변화한다', () => {
    const match = new Match({ seed: 1, mode: 'duel', difficulty: 'normal', humans: [{ name: 'Human' }], fill: 1 });
    match.map = slopeMap();
    const p = match.players[0]; p.bot = false; p.remote = false; p.x = -21; p.z = 0; p.yaw = 0;
    p.input = { ...blankInput(), yaw: 0, mz: 1 };
    let highest = 0;
    for (let i = 0; i < 600; i++) {
      match.step(1 / 60); match.drain();
      highest = Math.max(highest, groundHeight(match.map.terrain, p.x, p.z));
    }
    expect(highest).toBeGreaterThan(3.7);
    expect(p.x).toBeGreaterThan(12);
    expect(p.alt).toBe(0); // 0은 낙하산 고도 상태만 표시합니다.
  });

  it('높은 지형 상공에서는 지표면까지 남은 거리로 낙하산을 펼친다', () => {
    const m = new Match({ seed: 3, mode: 'br', difficulty: 'normal', humans: [{ name: 'Human' }], fill: 1, air: true, vehicles: false, bombs: false });
    m.map.boxes = []; m.map.grid.clear(); m.map.terrain = emptyTerrain();
    m.map.terrain.rises.push({ x: 0, z: 0, r: 20, h: 4 });
    const p = m.players[0]; p.x = 0; p.z = 0; p.air = 2; p.alt = 107; p.vx = p.vz = 0; p.input = blankInput();
    m.step(0.01);
    expect(p.air).toBe(3);
    expect(p.alt).toBeGreaterThan(100);
  });

  it('낙하산은 평지가 아니라 실제 경사면에 도착하면 착지한다', () => {
    const match = new Match({ seed: 3, mode: 'br', difficulty: 'normal', humans: [{ name: 'Human' }], fill: 1, air: true, vehicles: false, bombs: false });
    match.map.boxes = []; match.map.grid.clear();
    match.map.terrain = emptyTerrain();
    match.map.terrain.rises.push({ x: 0, z: 0, r: 20, h: 4 });
    const p = match.players[0]; p.x = 0; p.z = 0; p.air = 3; p.alt = 4.5; p.vx = 0; p.vz = 0;
    p.input = blankInput();
    match.step(0.3);
    expect(p.air).toBe(0);
    expect(p.alt).toBe(0);
    expect(groundHeight(match.map.terrain, p.x, p.z)).toBeGreaterThan(3.5);
  });

  it('높은 차량은 사람 키보다 위에 있는 낮은 차고 천장에 걸린다', () => {
    const m = slopeMap();
    addBox(m, { x0: 28, x1: 32, z0: -2, z1: 2, y0: 2.4, y1: 2.65, kind: 'ceiling', tex: 0 });
    expect(circleHits(m, 30, 0, 0.4)).toBe(false);
    expect(circleHits(m, 30, 0, 0.4, 3.1)).toBe(true);
  });

  it('높은 능선에 주차된 차량도 발밑 충돌로 처리하고, 머리 위 천장은 통과한다', () => {
    const m = slopeMap();
    addBox(m, { x0: -1, x1: 1, z0: -1, z1: 1, y0: 4, y1: 5.5, kind: 'vehicle', tex: 0 });
    addBox(m, { x0: -8, x1: -5, z0: -1, z1: 1, y0: 8, y1: 8.3, kind: 'ceiling', tex: 0 });
    expect(groundHeight(m.terrain, 0, 0)).toBe(4);
    expect(blockedAt(m, 0, 0, 0.4)).toBe(true);
    expect(circleHits(m, 0, 0, 0.4)).toBe(true);
    const player = { x: 0, z: 0 };
    expect(pushOut(m, player, 0.4)).toBe(true);
    expect(circleHits(m, player.x, player.z, 0.4)).toBe(false);
    expect(blockedAt(m, -6, 0, 0.4)).toBe(false);
    expect(rayWorld(m, -6, 4, 0, 0, 1, 0, 10)).toBeCloseTo(4, 5);
  });

  it('실제 지도에서는 다른 시드의 완만한 구릉이 생성되며 재현 가능하다', () => {
    for (const seed of [1, 7, 42]) {
      const a = generateMap(seed, 'br'), b = generateMap(seed, 'br');
      expect(a.terrain.rises).toEqual(b.terrain.rises);
      expect(a.terrain.rises.length).toBeGreaterThan(0);
      for (const rise of a.terrain.rises) {
        expect(rise.r).toBeGreaterThan(20);
        expect(rise.h).toBeGreaterThan(1);
      }
    }
  });
});
