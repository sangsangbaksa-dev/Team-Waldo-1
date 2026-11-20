import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { Colliders } from '../../src/tycoon/scene/layout';
import { Player } from '../../src/tycoon/scene/player';

describe('HUSTLE player regression', () => {
  it('stops immediately while paused or during a stationary activity', () => {
    const player = new Player(new Scene(), null);
    const colliders = new Colliders();
    player.teleport(0, 0, 0);
    player.update(0.08, { mx: 0, mz: 1, run: true }, colliders, false);
    expect(player.speed).toBeGreaterThan(0);
    const before = player.pos.clone();
    player.update(0.08, { mx: 0, mz: 1, run: true }, colliders, true);
    expect(player.speed).toBe(0);
    expect(player.pos.distanceTo(before)).toBe(0);
  });

  it('initializes the camera at the current player location after switching views', () => {
    const player = new Player(new Scene(), null);
    const colliders = new Colliders();
    const camera = new PerspectiveCamera();
    player.teleport(0, 0, 0);
    player.placeCamera(camera, 0.016, colliders);
    player.setFirstPerson(true);
    player.teleport(20, 20, 0);
    player.setFirstPerson(false);
    player.placeCamera(camera, 0.016, colliders);
    // Facing +X: third-person camera starts behind the player, not on the old heading.
    expect(camera.position.x).toBeCloseTo(20 - Math.cos(player.camPitch) * player.dist);
    expect(camera.position.z).toBeCloseTo(20);
    expect(camera.position.distanceTo(player.pos)).toBeLessThan(10);
  });
});
