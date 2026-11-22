import { describe, expect, it } from 'vitest';
import { generateCity, collideBox, rayStatic, isOpen, nearestLane, findPath } from '../../src/outlaw/world';

describe('OUTLAW allocation-free static SAT and raycast', () => {
  const map = generateCity(7);
  it('finds static overlap inside actual buildings with angled car hulls', () => {
    const b = map.buildings[0]!;
    expect(isOpen(map, b.x, b.z, 1)).toBe(false);
    for (const angle of [0, Math.PI/6, Math.PI/4, Math.PI/2]) {
      const hit = collideBox(map, b.x, b.z, angle, 2.2, 1.1, 0, 2);
      expect(hit).not.toBeNull();
      expect([hit!.dx, hit!.dz, hit!.nx, hit!.nz, hit!.depth].every(Number.isFinite)).toBe(true);
      expect(hit!.depth).toBeGreaterThan(0);
    }
  });
  it('does not report buildings that are far from the geometry or on another floor', () => {
    const b = map.buildings[0]!;
    expect(collideBox(map, map.half + 1000, map.half + 1000, 0, 2, 1)).toBeNull();
    expect(collideBox(map, b.x, b.z, 0, 2, 1, 10000, 10002)).toBeNull();
  });
  it('finds walls with horizontal rays and ignores rays above building roofs', () => {
    const b = map.buildings[0]!;
    const y = Math.min(1, b.h/2), ox = b.x - b.w/2 - 12;
    const solid = rayStatic(map, ox, y, b.z, 1, 0, 0, 25);
    expect(Number.isFinite(solid)).toBe(true);
    expect(solid).toBeLessThanOrEqual(12.01);
    expect(rayStatic(map, ox, b.h + 10000, b.z, 1, 0, 0, 25)).toBe(Infinity);
  });
});

describe('OUTLAW full-city lane graph continuity', () => {
  it('connects lit incoming lanes at southern interior intersections', () => {
    const map = generateCity(19);
    const incoming = map.lanes.filter(n => n.light >= 0 && Math.abs(n.x) < map.half - 110 &&
      n.z > 210 && n.z < map.half - 110);
    expect(incoming.length).toBeGreaterThan(10);
    for (const n of incoming) expect(n.next.length, `dead end at ${n.x},${n.z}`).toBeGreaterThan(0);
  });
  it('provides a drivable path across the newly connected southern rows', () => {
    const map = generateCity(19);
    const start = nearestLane(map, 330, 350);
    expect(start).toBeGreaterThanOrEqual(0);
    const path = findPath(map, start, -330, -350);
    expect(path.length).toBeGreaterThan(5);
    const last = map.lanes[path[path.length - 1]!]!;
    expect(Math.hypot(last.x + 330, last.z + 350)).toBeLessThan(55);
  });
});
