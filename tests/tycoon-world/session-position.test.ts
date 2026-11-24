import { describe, expect, it } from 'vitest';
import { WORLD_HALF } from '../../src/tycoon/scene/layout';
import { readSessionPosition } from '../../src/tycoon/scene/session-position';

describe('HUSTLE session position saves', () => {
  it('lets prior saves use their original spawn', () => {
    expect(readSessionPosition({ v: 1, cash: 30, stage: 'parttime', day: 2 })).toBeNull();
  });

  it('round-trips a player position, vehicle, and waypoint', () => {
    const world = {
      x: 10, z: -3, yaw: 0.75,
      ride: { name: '시티 세단', x: 10, z: -3, heading: 1 },
      waypoint: { x: 72, z: -10 },
    };
    expect(readSessionPosition(JSON.parse(JSON.stringify({ v: 1, world })))).toEqual(world);
  });

  it('rejects bad coordinates while salvaging valid player positions', () => {
    expect(readSessionPosition({ world: { x: WORLD_HALF, z: 0, yaw: 0 } })).toBeNull();
    expect(readSessionPosition({ world: { x: 10, z: 0, yaw: 0, waypoint: { x: 0, z: Infinity }, ride: { name: 'car', x: 0, z: 0, heading: '1' } } }))
      .toEqual({ x: 10, z: 0, yaw: 0, ride: null, waypoint: null });
  });

  it('wraps a yaw that has turned past one circle and drops a huge yaw', () => {
    expect(readSessionPosition({ world: { x: 10, z: 0, yaw: 0.75 + Math.PI * 4 } })?.yaw).toBeCloseTo(0.75, 5);
    expect(readSessionPosition({ world: { x: 10, z: 0, yaw: 1e20 } })).toBeNull();
    expect(readSessionPosition({ world: { x: 4, z: 2, yaw: 0.2, ride: { name: '', x: 4, z: 2, heading: 1 } } })?.ride).toBeNull();
  });
});
