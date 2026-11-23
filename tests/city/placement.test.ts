import { describe, expect, it } from 'vitest';
import { BLOCK, PITCH, ROAD, STRUCTS } from '../../src/city/defs';
import { addSolid, emptyMap, generateCity, makeRng, rangeHitsRoad, rectFree, rectHitsRoad, removeSolid, SOLID_CLEARANCE } from '../../src/city/map';
import {
  ANCHOR_BUILD_RANGE, blockedByCrystal, canPlaceAt, demolishRefund, demolishReject,
  HQ_BUILD_RANGE, inBuildRange, snapBuildCoord, structCenter,
} from '../../src/city/placement';

describe('road and footprint checks', () => {
  it('treats a half-open footprint flush with the block edge as off the road', () => {
    const x0 = ROAD, end = x0 + BLOCK;
    expect(end).toBe(PITCH);
    expect(rangeHitsRoad(x0, end)).toBe(false);
    expect(rangeHitsRoad(end - 88, end)).toBe(false);
    expect(rangeHitsRoad(x0 - 1, x0 + 40)).toBe(true);
    expect(rangeHitsRoad(end - 10, end + 0.01)).toBe(true);
    expect(rangeHitsRoad(0, ROAD)).toBe(true);
    expect(rectHitsRoad(end - 88, x0 + 40, 88, 72)).toBe(false);
    expect(rectHitsRoad(end - 87, x0 + 40, 88, 72)).toBe(true);
  });

  it('lets a barracks sit flush with a block edge that the old closed sample rejected', () => {
    const map = emptyMap(), x0 = ROAD, y0 = ROAD, end = x0 + BLOCK;
    expect(rectFree(map, end - STRUCTS.barracks.w, y0 + 80, STRUCTS.barracks.w, STRUCTS.barracks.h)).toBe(true);
    expect(rectFree(map, end - STRUCTS.barracks.w + 1, y0 + 80, STRUCTS.barracks.w, STRUCTS.barracks.h)).toBe(false);
  });

  it('matches an exhaustive collision check over many city layouts', () => {
    const reference = (map: ReturnType<typeof emptyMap>, x: number, y: number, w: number, h: number): boolean => {
      if (x < 20 || y < 20 || x + w > 5140 || y + h > 5140) return false;
      const pad = SOLID_CLEARANCE;
      if (map.solids.some(s => s.alive && x < s.x + s.w + pad && x + w > s.x - pad && y < s.y + s.h + pad && y + h > s.y - pad)) return false;
      return !rectHitsRoad(x, y, w, h);
    };
    for (const seed of [3, 23, 120]) {
      const map = generateCity(makeRng(seed)), random = makeRng(seed + 500);
      for (let i = 0; i < 800; i++) {
        const x = random() * 5200 - 20, y = random() * 5200 - 20;
        const w = 20 + random() * 160, h = 20 + random() * 160;
        expect(rectFree(map, x, y, w, h)).toBe(reference(map, x, y, w, h));
      }
    }
  });

  it('updates the spatial index when a building is demolished', () => {
    const map = emptyMap();
    const id = addSolid(map, { x: 316, y: 196, w: 40, h: 40, height: 1, wall: '#000', roof: '#000', struct: 0, alive: true });
    expect(rectFree(map, 350, 196, 20, 20)).toBe(false);
    removeSolid(map, id);
    expect(rectFree(map, 350, 196, 20, 20)).toBe(true);
  });

  it('rejects overlapping buildings but allows a small clearance gap', () => {
    const map = emptyMap();
    addSolid(map, { x: 200, y: 200, w: 80, h: 80, height: 1, wall: '#000', roof: '#000', struct: 0, alive: true });
    expect(rectFree(map, 280, 200, 60, 60)).toBe(false);
    expect(rectFree(map, 280 + SOLID_CLEARANCE, 200, 60, 60)).toBe(true);
    expect(rectFree(map, 280 + SOLID_CLEARANCE - 1, 200, 60, 60)).toBe(false);
  });
});

describe('placement range and snap', () => {
  it('snaps both axes to the shared build grid', () => {
    expect(snapBuildCoord(14)).toBe(10);
    expect(snapBuildCoord(15)).toBe(20);
    expect(HQ_BUILD_RANGE).toBe(720);
    expect(ANCHOR_BUILD_RANGE).toBe(460);
  });

  it('accepts sites near the HQ, an owned business, or an owned structure', () => {
    const hq = { x: 1000, y: 1000, w: 120, h: 120 }, c = structCenter(hq);
    expect(inBuildRange(c.x + 700, c.y, hq, [], [])).toBe(true);
    expect(inBuildRange(c.x + 730, c.y, hq, [], [])).toBe(false);
    expect(inBuildRange(c.x + 730, c.y, hq, [{ x: c.x + 730, y: c.y }], [])).toBe(true);
    expect(inBuildRange(3000, 3000, hq, [], [{ x: 3000 - 100, y: 3000, w: 88, h: 72 }])).toBe(true);
    expect(inBuildRange(3000, 3000, hq, [], [{ x: 3000 - 600, y: 3000, w: 88, h: 72 }])).toBe(false);
  });

  it('keeps crystals just outside the building footprint plus clearance', () => {
    const w = STRUCTS.depot.w, h = STRUCTS.depot.h;
    expect(blockedByCrystal(100, 100, w, h, [{ x: 100 + w / 2 + 16 - 1, y: 100, amount: 10 }])).toBe(true);
    expect(blockedByCrystal(100, 100, w, h, [{ x: 100 + w / 2 + 16 + 1, y: 100, amount: 10 }])).toBe(false);
    expect(blockedByCrystal(100, 100, w, h, [{ x: 100, y: 100, amount: 0 }])).toBe(false);
  });

  it('canPlaceAt requires an empty in-range footprint', () => {
    const map = emptyMap(), hq = { x: ROAD + 160, y: ROAD + 160, w: 120, h: 120 };
    addSolid(map, { x: hq.x, y: hq.y, w: hq.w, h: hq.h, height: 1, wall: '#000', roof: '#000', struct: 1, alive: true });
    const ok = { cx: hq.x + 120 + 44 + 8, cy: hq.y + 60, w: 88, h: 72, map, hq, ownedBiz: [], ownedStructs: [], crystals: [], businesses: [] };
    expect(canPlaceAt(ok)).toBe(true);
    expect(canPlaceAt({ ...ok, cx: hq.x + 60, cy: hq.y + 60 })).toBe(false);
    expect(canPlaceAt({ ...ok, cx: 4000, cy: 4000 })).toBe(false);
  });
});

describe('demolish rules', () => {
  it('refunds half the paid cost, rounded down', () => {
    expect(demolishRefund(150, 0)).toEqual({ crystal: 75, cash: 0 });
    expect(demolishRefund(125, 300)).toEqual({ crystal: 62, cash: 150 });
    expect(demolishRefund(100, 100, 0.5)).toEqual({ crystal: 50, cash: 50 });
  });

  it('rejects HQ, enemy and missing targets', () => {
    expect(demolishReject(null, 0)).toBe('철거할 건물이 없습니다');
    expect(demolishReject({ kind: 'barracks', f: 0, alive: false }, 0)).toContain('없습니다');
    expect(demolishReject({ kind: 'hq', f: 0, alive: true }, 0)).toContain('본부');
    expect(demolishReject({ kind: 'barracks', f: 2, alive: true }, 0)).toContain('아군');
    expect(demolishReject({ kind: 'lab', f: 0, alive: true }, 0)).toBe('');
  });
});

describe('건설 고스트 거리와 실패 이유', () => {
  it('십자선이 바닥에 닿는 지점에 놓이고, 보스를 덮을 만큼 가까워지지 않는다', async () => {
    const { buildDistance, buildMinDistance, BUILD_REACH_MAX } = await import('../../src/city/uiMath');
    const EYE = 37, min = buildMinDistance(STRUCTS.hq.w, STRUCTS.hq.h);
    // 지평선 쪽(또는 잘못된 값)은 최대 거리
    expect(buildDistance(0, EYE, min)).toBe(BUILD_REACH_MAX); expect(buildDistance(Number.NaN, EYE, min)).toBe(BUILD_REACH_MAX);
    // 발밑을 봐도 최소 거리(건물 바닥면 대각선의 절반 이상)에서 멈춘다 → 본부 같은 큰 건물이 눈앞을 덮지 않는다
    for (const k of Object.keys(STRUCTS) as (keyof typeof STRUCTS)[]) {
      const m = buildMinDistance(STRUCTS[k].w, STRUCTS[k].h);
      expect(buildDistance(-1.4, EYE, m)).toBe(m); expect(m).toBeGreaterThan(Math.hypot(STRUCTS[k].w, STRUCTS[k].h) / 2);
    }
    // 중간 각도는 눈높이 / tan 으로 바닥 교점과 일치하고, 아래로 숙일수록 단조롭게 가까워진다
    expect(buildDistance(-Math.atan(EYE / 300), EYE, 0)).toBeCloseTo(300, 5);
    let prev = Infinity; for (let deg = 0; deg <= 60; deg++) { const d = buildDistance(-deg * Math.PI / 180, EYE, min); expect(d).toBeLessThanOrEqual(prev); prev = d; }
  });
  it('지을 수 없는 이유를 구분해서 알려 준다', async () => {
    const { placeProblem } = await import('../../src/city/placement');
    const base = { w: 60, h: 60, map: emptyMap(), hq: { x: 800, y: 800, w: 120, h: 120 }, ownedBiz: [], ownedStructs: [], crystals: [], businesses: [] };
    expect(placeProblem({ ...base, cx: 3000, cy: 3000 })).toBe('range');
    expect(placeProblem({ ...base, cx: 700, cy: 700 })).toBe('road');
    expect(placeProblem({ ...base, cx: 900, cy: 900, crystals: [{ x: 905, y: 905, amount: 100 }] })).toBe('crystal');
    expect(placeProblem({ ...base, cx: 900, cy: 900, businesses: [{ x: 910, y: 900 }] })).toBe('pad');
    expect(placeProblem({ ...base, cx: 900, cy: 900 })).toBe('');
  });
});
