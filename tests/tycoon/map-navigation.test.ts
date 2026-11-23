import { describe, expect, it } from 'vitest';
import { pointFromMapClick } from '../../src/tycoon/ui/minimap';
import { WORLD_HALF } from '../../src/tycoon/scene/layout';

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
