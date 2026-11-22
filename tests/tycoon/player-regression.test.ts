import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { CharacterKit } from '../../src/shared/character';
import { Colliders, buildLayout } from '../../src/tycoon/scene/layout';
import { SPOTS } from '../../src/tycoon/core';
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

describe('HUSTLE smooth camera obstruction checks', () => {
  it('does not interpolate the camera through a solid wall when its orbit changes abruptly', () => {
    const player = new Player(new Scene(), null), camera = new PerspectiveCamera(), cols = new Colliders();
    const block = buildLayout(SPOTS).blocks.find(b => b.i === 0 && b.j === 0)!;
    cols.set(block, [{ x0: -1, x1: 1, z0: -1, z1: 1 }]);
    player.teleport(-5, 0, 0);
    player.camPitch = .1; player.camYaw = -Math.PI / 2;
    player.placeCamera(camera, .016, cols);
    // Simulate a stage-transition camera move without resetting interpolation.
    player.pos.x = 5; player.camYaw = Math.PI / 2;
    player.placeCamera(camera, .1, cols);
    const out = { x: 0, z: 0 };
    expect(cols.resolve(camera.position.x, camera.position.z, .5, out)).toBe(false);
    expect(camera.position.toArray().every(Number.isFinite)).toBe(true);
  });
});

it('keeps HUSTLE player feet above the paved ground after shared rig poses animate', () => {
  const empty = { fixed: null, team: null, skin: null, glow: null };
  const kit = new CharacterKit({ civ: { body: empty, leg: empty } });
  const player = new Player(new Scene(), kit);
  const colliders = new Colliders();
  player.teleport(0, 0, 0);
  player.setOutfit(0);
  player.update(.016, {mx: 0, mz: 0, run: false}, colliders, false);
  expect(player.rig?.root.position.y).toBeCloseTo(player.pos.y);
  player.update(.016, {mx: 0, mz: 1, run: false}, colliders, false);
  expect(player.rig!.root.position.y).toBeGreaterThanOrEqual(player.pos.y);
});
