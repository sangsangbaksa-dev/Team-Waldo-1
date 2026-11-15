import { describe, expect, it } from 'vitest';
import { BLOCK, PITCH, ROAD, STRUCTS } from '../../src/city/defs';
import { addSolid, emptyMap, rangeHitsRoad, rectFree, rectHitsRoad, SOLID_CLEARANCE } from '../../src/city/map';
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

  it('rejects HQ, enemy, missing, and duel targets', () => {
    expect(demolishReject(null, 0)).toBe('철거할 건물이 없습니다');
    expect(demolishReject({ kind: 'barracks', f: 0, alive: false }, 0)).toContain('없습니다');
    expect(demolishReject({ kind: 'hq', f: 0, alive: true }, 0)).toContain('본부');
    expect(demolishReject({ kind: 'barracks', f: 2, alive: true }, 0)).toContain('아군');
    expect(demolishReject({ kind: 'barracks', f: 0, alive: true }, 0, { duel: { side: 0 } })).toContain('결투');
    expect(demolishReject({ kind: 'lab', f: 0, alive: true }, 0)).toBe('');
  });
});
