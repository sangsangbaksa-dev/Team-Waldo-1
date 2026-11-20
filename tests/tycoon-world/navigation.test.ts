import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createCore, SPOTS } from '../../src/tycoon/core';
import { Colliders, buildLayout, WORLD_HALF } from '../../src/tycoon/scene/layout';
import { Player } from '../../src/tycoon/scene/player';
import { readResumePosition } from '../../src/tycoon/scene/resume';
import { nearestMapSpot } from '../../src/tycoon/ui/minimap';

describe('HUSTLE navigation and resume', () => {
  it('selects opened map places and refuses locked or invalid selections', () => {
    const layout = buildLayout(SPOTS), core = createCore({ seed: 3 });
    const onMap = (id: string) => { const l = layout.spotLots.get(id)!; return [(l.doorX + WORLD_HALF) / (2 * WORLD_HALF), (l.doorZ + WORLD_HALF) / (2 * WORLD_HALF)] as const; };
    expect(nearestMapSpot(layout, core.spots(), 0, ...onMap('bench'))).toBe('bench');
    expect(nearestMapSpot(layout, core.spots(), 0, ...onMap('job_mart'))).not.toBe('job_mart');
    expect(nearestMapSpot(layout, core.spots(), 0, NaN, 0)).toBeNull();
  });
  it('restores valid camera data and falls back for corrupted positions', () => {
    const cols = new Colliders();
    expect(readResumePosition({ position: { x: 5, z: 6, yaw: 1, cameraYaw: 2, cameraPitch: 0.5, firstPerson: true } }, cols)).toEqual({ x: 5, z: 6, yaw: 1, cameraYaw: 2, cameraPitch: 0.5, firstPerson: true });
    expect(readResumePosition({ v: 1 }, cols)).toBeNull();
    expect(readResumePosition({ position: { x: Infinity, z: 0, yaw: 0 } }, cols)).toBeNull();
    expect(readResumePosition({ position: { x: WORLD_HALF + 1, z: 0, yaw: 0 } }, cols)).toBeNull();
    const layout = buildLayout(SPOTS); const block = layout.blocks.find(b => b.i === 0 && b.j === 0)!;
    cols.set(block, [{ x0: -2, x1: 2, z0: -2, z1: 2 }]);
    expect(readResumePosition({ position: { x: 0, z: 0, yaw: 0 } }, cols)).toBeNull();
  });
  it('stops all movement immediately on pause or activity lock', () => {
    const p = new Player(new THREE.Scene(), null), cols = new Colliders();
    p.teleport(0, 0, 0); p.update(0.1, { mx: 1, mz: 0, run: true }, cols, false);
    const before = p.pos.clone();
    p.update(0.1, { mx: 1, mz: 0, run: true }, cols, true);
    expect(p.pos.toArray()).toEqual(before.toArray());
    expect(p.speed).toBe(0);
  });
});
