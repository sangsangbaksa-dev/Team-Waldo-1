import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildLayout, Colliders, PITCH } from '../../src/tycoon/scene/layout';
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

  it('does not spawn an occupied sedan inside a building collision box', () => {
    const scene = new THREE.Scene();
    const layout = buildLayout([]);
    const city = new Colliders();
    const road = Math.round((layout.spawn.x - PITCH / 2) / PITCH) * PITCH + PITCH / 2;
    const x = road - 3, z = layout.spawn.z + 4;
    const block = layout.blocks.find(b => b.i === Math.round(x / PITCH) && b.j === Math.round(z / PITCH));
    expect(block).toBeDefined();
    if (block) city.set(block, [{ x0: x - 2, x1: x + 2, z0: z - 2, z1: z + 2 }]);
    const rides = new Rides(scene, layout, city);
    expect(rides.positions().every(c => Math.hypot(c.x - x, c.z - z) > 0.2)).toBe(true);
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

  it('rejects nose-to-tail overlap even when car centers are more than 3.5m apart', () => {
    const { player, rides } = setup();
    const [first, second] = rides.positions();
    expect(first).toBeDefined(); expect(second).toBeDefined();
    const gap = 3.9;
    const overlapping = {
      name: second.name,
      x: first.x + Math.cos(first.heading) * gap,
      z: first.z - Math.sin(first.heading) * gap,
      heading: first.heading,
    };
    expect(rides.restore(overlapping, player)).toBe(false);
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
