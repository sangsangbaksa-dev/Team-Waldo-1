import { describe, expect, it } from 'vitest';
import { pointFromMapClick } from '../../src/tycoon/ui/minimap';
import { WORLD_HALF } from '../../src/tycoon/scene/layout';
import { streetRoute, streetDistance } from '../../src/tycoon/ui/road-route';

describe('HUSTLE waypoint coordinates', () => {
  const rect = { left: 20, top: 30, width: 400, height: 400 };
  it('maps the visible center of the city to the origin', () => {
    expect(pointFromMapClick(220, 230, rect)).toEqual({ x: 0, z: 0 });
  });
  it('clamps clicks outside the map to the world boundary', () => {
    const a = pointFromMapClick(-500, -100, rect);
    const b = pointFromMapClick(1000, 1000, rect);
    expect(a).toEqual({ x: -WORLD_HALF + 2, z: -WORLD_HALF + 2 });
    expect(b).toEqual({ x: WORLD_HALF - 2, z: WORLD_HALF - 2 });
  });
  it('uses CSS pixel bounds even if the backing canvas is higher resolution', () => {
    expect(pointFromMapClick(120, 130, rect)).toMatchObject({ x: -WORLD_HALF / 2, z: -WORLD_HALF / 2 });
  });
});

describe('HUSTLE road navigation', () => {
  it('connects street waypoints with orthogonal road segments', () => {
    const from = { x: -127.5, z: 159 };
    const to = { x: 21, z: 4 };
    const route = streetRoute(from, to);
    expect(route[0]).toEqual(from);
    expect(route[route.length - 1]).toEqual(to);
    for (let i = 1; i < route.length; i++) {
      expect(route[i].x === route[i - 1].x || route[i].z === route[i - 1].z).toBe(true);
    }
    expect(streetDistance(from, to)).toBeGreaterThanOrEqual(Math.hypot(from.x - to.x, from.z - to.z));
  });
  it('does not create detours when already aligned on a road', () => {
    const from = { x: 24, z: 0 };
    const to = { x: 24, z: 96 };
    expect(streetRoute(from, to)).toEqual([from, to]);
    expect(streetDistance(from, to)).toBe(96);
    expect(streetRoute(from, from)).toEqual([from]);
    expect(streetDistance(from, from)).toBe(0);
  });
});
