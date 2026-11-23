import { describe, expect, it } from 'vitest';
import { addBox, moveBox, rayWorld, type Box, type GameMap } from '../../src/shooter/world';
import { emptyTerrain } from '../../src/shooter/terrain';
import { makeRng } from '../../src/shooter/config';

function emptyMap(): GameMap {
  return { seed: 1, mode: 'duel', half: 115, terrain: emptyTerrain(),
    boxes: [], buildings: [], trees: [], rocks: [], props: [], compounds: [],
    sites: [], roads: [], loot: [], spawns: [], grid: new Map() };
}

/** Spatial-grid-independent AABB ray reference, used to detect missed cells. */
function brute(boxes: Box[], ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): number {
  let nearest = Infinity;
  for (const b of boxes) {
    let near = 0, far = maxT;
    for (const [origin, dir, min, max] of [[ox, dx, b.x0, b.x1], [oy, dy, b.y0, b.y1], [oz, dz, b.z0, b.z1]]) {
      if (Math.abs(dir) < 1e-9) { if (origin < min || origin > max) { near = Infinity; break; } }
      else {
        let a = (min - origin) / dir, c = (max - origin) / dir;
        if (a > c) [a, c] = [c, a];
        near = Math.max(near, a);
        far = Math.min(far, c);
      }
    }
    if (near <= far) nearest = Math.min(nearest, near);
  }
  return nearest;
}

describe('ZERO ZONE 레이캐스트 격자 누락 방지', () => {
  it('4m 표본 사이에 잠깐 들어간 얇은 건물 모서리도 맞힌다', () => {
    const map = emptyMap();
    addBox(map, { x0: 16.03, x1: 16.11, z0: 31.83, z1: 31.98, y0: 0, y1: 3, kind: 'wall', tex: 0 });
    const len = Math.hypot(16.1, 32), dx = 16.1 / len, dz = 32 / len;
    expect(rayWorld(map, 0, 1, 0, dx, 0, dz, 100)).toBeCloseTo(16.03 / dx, 5);
  });

  it('격자 멤버십이 바뀌는 차량·상자를 최신 위치에서 검사한다', () => {
    const map = emptyMap();
    addBox(map, { x0: 20, x1: 22, z0: -1, z1: 1, y0: 0, y1: 3, kind: 'vehicle', tex: 0 });
    expect(rayWorld(map, 0, 1, 0, 1, 0, 0, 100)).toBe(20);
    moveBox(map, 0, { x0: 48, x1: 50 });
    expect(rayWorld(map, 0, 1, 0, 1, 0, 0, 100)).toBe(48);
    moveBox(map, 0, { y0: 1000, y1: 1002 });
    expect(rayWorld(map, 0, 1, 0, 1, 0, 0, 100)).toBe(Infinity);
  });

  it('무작위 3D 광선은 모든 AABB를 직접 검사한 결과와 일치한다', () => {
    const map = emptyMap(), rng = makeRng(9927);
    for (let i = 0; i < 100; i++) {
      const x = (rng() * 2 - 1) * 110, z = (rng() * 2 - 1) * 110;
      const w = 0.2 + rng() * 7, d = 0.2 + rng() * 7;
      addBox(map, { x0: x, x1: x + w, z0: z, z1: z + d, y0: 0, y1: 1 + rng() * 25, kind: 'wall', tex: 0 });
    }
    for (let i = 0; i < 300; i++) {
      const ox = (rng() * 2 - 1) * 120, oz = (rng() * 2 - 1) * 120, oy = rng() * 22;
      const yaw = rng() * Math.PI * 2, pitch = (rng() - 0.5) * 1.3;
      const dx = Math.cos(yaw) * Math.cos(pitch), dz = Math.sin(yaw) * Math.cos(pitch), dy = Math.sin(pitch);
      // 지면 고도를 통합한 레이캐스트는 상자 외에 y=0 지면도 최초 교차점으로 봅니다.
      const flatHit = dy < -1e-9 ? oy / -dy : Infinity;
      const expected = Math.min(brute(map.boxes, ox, oy, oz, dx, dy, dz, 250), flatHit <= 250 ? flatHit : Infinity);
      const actual = rayWorld(map, ox, oy, oz, dx, dy, dz, 250);
      if (Number.isFinite(expected)) expect(actual).toBeCloseTo(expected, 5);
      else expect(actual).toBe(Infinity);
    }
  });

  it('격자 경계와 평행한 총알도 경계 건너편 상자의 옆면을 맞힌다', () => {
    const map = emptyMap();
    addBox(map, { x0: 15.5, x1: 16, z0: 30, z1: 32, y0: 0, y1: 4, kind: 'wall', tex: 0 });
    expect(rayWorld(map, 16, 1, 0, 0, 0, 1, 100)).toBe(30);
    expect(rayWorld(map, 16.01, 1, 0, 0, 0, 1, 100)).toBe(Infinity);
  });

  it('수직·역방향·영벡터를 처리하고 최대 사거리 뒤의 물체는 제외한다', () => {
    const map = emptyMap();
    addBox(map, { x0: -1, x1: 1, z0: -1, z1: 1, y0: 0, y1: 3, kind: 'wall', tex: 0 });
    expect(rayWorld(map, 0, 5, 0, 0, -1, 0, 10)).toBe(2);
    expect(rayWorld(map, 10, 1, 0, -1, 0, 0, 10)).toBe(9);
    expect(rayWorld(map, 10, 1, 0, -1, 0, 0, 5)).toBe(Infinity);
    expect(rayWorld(map, 10, 1, 0, 0, 0, 0, 10)).toBe(Infinity);
  });
});
