import { describe, expect, it } from 'vitest';
import { SIZE } from '../../src/city/defs';
import { mapPointerToWorld } from '../../src/city/uiMath';

describe('LAST CITY minimap hit testing', () => {
  it('maps x and y independently on rectangular displayed maps', () => {
    expect(mapPointerToWorld(110, 220, 10, 20, 200, 400)).toEqual({ x: SIZE / 2, y: SIZE / 2 });
    expect(mapPointerToWorld(210, 420, 10, 20, 200, 400)).toEqual({ x: SIZE, y: SIZE });
  });
  it('clamps clicks to world bounds and ignores invalid layouts', () => {
    expect(mapPointerToWorld(-100, 9999, 10, 20, 200, 400)).toEqual({ x: 0, y: SIZE });
    expect(mapPointerToWorld(10, 20, 10, 20, 0, 400)).toBeNull();
    expect(mapPointerToWorld(NaN, 20, 10, 20, 200, 400)).toBeNull();
  });
});
