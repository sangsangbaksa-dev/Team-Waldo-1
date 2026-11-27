import { describe, expect, it } from 'vitest';
import { findPackage, groundedJump, JUMP_DURATION, mapPoint, PACKAGES, roadGuide, stepJump } from '../../project-harbor/world/exploration';
import { World } from '../../project-harbor/world/application';
import { districtAt } from '../../project-harbor/world/domain';
describe('Harbor exploration', () => {
  it('jumps once, reaches an apex, and lands without a negative height', () => {
    let jump = stepJump(groundedJump(), .05, true, true);
    expect(jump.height).toBeGreaterThan(0);
    for (let i = 0; i < 7; i++) jump = stepJump(jump, .05, true, true);
    expect(jump.height).toBeGreaterThan(1);
    for (let i = 0; i < 12; i++) jump = stepJump(jump, .05, false, true);
    expect(jump.elapsed).toBe(JUMP_DURATION); expect(jump.height).toBe(0);
  });
  it('does not jump when driving', () => {
    expect(stepJump(groundedJump(), .05, true, false)).toEqual(groundedJump());
  });
  it('maps clicks in a letterboxed atlas and rejects margins', () => {
    expect(mapPoint(450, 300, 900, 600)).toEqual({ x: 1536, z: 1024 });
    expect(mapPoint(5, 5, 1200, 600)).toBeNull();
    expect(mapPoint(1, 1, 0, 0)).toBeNull();
  });
  it('guides with orthogonal segments from start to destination', () => {
    const start = { x: 100, z: 110 }, end = { x: 800, z: 1000 };
    const route = roadGuide(start, end);
    expect(route[0]).toEqual(start); expect(route.at(-1)).toEqual(end);
    for (let i = 1; i < route.length; i++) expect(route[i]!.x === route[i-1]!.x || route[i]!.z === route[i-1]!.z).toBe(true);
  });
  it('places unique reachable packages and prevents collection from a car or twice', () => {
    const world = new World({ load() {}, unload() {} });
    expect(PACKAGES).toHaveLength(12);
    expect(new Set(PACKAGES.map(p => p.id)).size).toBe(12);
    for (const item of PACKAGES) {
      expect(districtAt(item.x, item.z).id).toBe(item.district);
      expect(world.open(item.x, item.z)).toBe(true);
      expect(findPackage(item, new Set(), true)).toEqual(item);
      expect(findPackage(item, new Set(), false)).toBeNull();
      expect(findPackage(item, new Set([item.id]), true)).toBeNull();
    }
  });
});
