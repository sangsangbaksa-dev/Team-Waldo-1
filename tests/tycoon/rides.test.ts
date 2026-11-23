import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildLayout, Colliders } from '../../src/tycoon/scene/layout';
import { Player } from '../../src/tycoon/scene/player';
import { Rides } from '../../src/tycoon/scene/rides';

describe('HUSTLE urban fleet', () => {
  function setup() {
    const scene = new THREE.Scene();
    const layout = buildLayout([]);
    const player = new Player(scene, null);
    const rides = new Rides(scene, layout, new Colliders());
    return { scene, layout, player, rides };
  }

  it('spreads transport over multiple districts without buying upgrades', () => {
    const { rides } = setup();
    const positions = rides.positions();
    expect(positions.length).toBeGreaterThanOrEqual(5);
    expect(positions.some(car => car.name.includes('세단'))).toBe(true);
    expect(Math.hypot(positions[0].x - positions[positions.length - 1].x, positions[0].z - positions[positions.length - 1].z)).toBeGreaterThan(40);
    rides.dispose();
  });

  it('lets the player drive, stop and get out without ghosting the driver', () => {
    const { player, rides } = setup();
    const car = rides.positions()[0];
    player.teleport(car.x, car.z, car.heading);
    expect(rides.toggle(player).ok).toBe(true);
    expect(rides.driving).toBe(true);
    for (let i = 0; i < 20; i++) rides.update(1 / 60, { throttle: 1, steer: 0, brake: false }, player, false);
    expect(rides.speed).toBeGreaterThan(0);
    expect(rides.toggle(player).ok).toBe(false);
    for (let i = 0; i < 120; i++) rides.update(1 / 60, { throttle: 0, steer: 0, brake: true }, player, false);
    expect(rides.toggle(player).ok).toBe(true);
    expect(rides.driving).toBe(false);
    rides.dispose();
  });

  it('freezes without erasing momentum during a map or menu pause', () => {
    const { player, rides } = setup();
    const car = rides.positions()[0]; player.teleport(car.x, car.z, car.heading);
    expect(rides.toggle(player).ok).toBe(true);
    for (let i = 0; i < 12; i++) rides.update(1 / 60, { throttle: 1, steer: 0, brake: false }, player, false);
    const speed = rides.speed, position = rides.snapshot();
    rides.update(1 / 30, { throttle: 1, steer: 1, brake: false }, player, true);
    expect(rides.speed).toBe(speed);
    expect(rides.snapshot()).toEqual(position);
    rides.dispose();
  });

  it('stops before moving NPC traffic and never tunnels through it', () => {
    const { player, rides } = setup();
    const car = rides.positions()[0]; player.teleport(car.x, car.z, car.heading);
    expect(rides.toggle(player).ok).toBe(true);
    const before = rides.snapshot();
    rides.setTrafficBlocker(() => true);
    expect(rides.update(.1, { throttle: 1, steer: 0, brake: false }, player, false)).toBe(true);
    expect(rides.speed).toBe(0);
    expect(rides.snapshot()).toMatchObject(before!);
    rides.dispose();
  });

  it('restores only an occupied vehicle with a valid location', () => {
    const { player, rides } = setup();
    const car = rides.positions()[0];
    player.teleport(car.x, car.z, car.heading);
    expect(rides.restore({ name: car.name, x: car.x, z: car.z, heading: car.heading }, player)).toBe(true);
    expect(rides.snapshot()).toMatchObject({ name: car.name });
    expect(rides.restore({ name: 'not a real car', x: 0, z: 0, heading: 0 }, player)).toBe(false);
    expect(rides.restore({ name: car.name, x: 1e9, z: 0, heading: 0 }, player)).toBe(false);
    rides.dispose();
  });
});
