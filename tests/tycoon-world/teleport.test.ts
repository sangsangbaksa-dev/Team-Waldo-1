import { describe, expect, it } from 'vitest';
import { WORLD_HALF } from '../../src/tycoon/scene/layout';
import { findTeleportLanding } from '../../src/tycoon/scene/teleport';

describe('HUSTLE teleport landing', () => {
  it('uses the map pin as-is when there is room to stand', () => {
    const pin = { x: 24, z: -40 };
    expect(findTeleportLanding(pin, () => true)).toEqual(pin);
  });

  it('finds a nearby free point when the pin is obstructed', () => {
    const pin = { x: 24, z: -40 };
    const free = ({ x, z }: typeof pin) => Math.hypot(x - pin.x, z - pin.z) >= 3;
    const point = findTeleportLanding(pin, free);
    expect(point).not.toBeNull();
    expect(point && free(point)).toBe(true);
    expect(point && Math.hypot(point.x - pin.x, point.z - pin.z)).toBeCloseTo(4);
  });

  it('rejects invalid pins and reports fully obstructed areas', () => {
    expect(findTeleportLanding({ x: Number.NaN, z: 0 }, () => true)).toBeNull();
    expect(findTeleportLanding({ x: WORLD_HALF, z: 0 }, () => true)).toBeNull();
    expect(findTeleportLanding({ x: 0, z: 0 }, () => false)).toBeNull();
  });

  it('stays inside the playable city when a pin is on the border', () => {
    const pin = { x: WORLD_HALF - 2, z: 0 };
    const point = findTeleportLanding(pin, ({ x }) => x < pin.x - 1);
    expect(point).not.toBeNull();
    expect(Math.abs(point!.x)).toBeLessThan(pin.x);
  });
});
