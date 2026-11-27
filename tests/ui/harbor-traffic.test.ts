import { describe, expect, it } from 'vitest';
import * as T from 'three';
import { LIMIT, makeVehicle, stepVehicle } from '../../project-harbor/vehicles/domain.js';
import { DEPTH, WIDTH, districtAt } from '../../project-harbor/world/domain';
import { beginHijack, doorPoint, stepHijack } from '../../project-harbor/world/hijack';
import {
  CrimeLedger, dispatchCommand, initialPursuit, policyFor, retainPursuit, spawnBudget, stepPursuit,
} from '../../project-harbor/world/pursuit';
import { buildLanes, endPoint, nearestLane, poseOn, signalOpen, SPAWN, vehicleYawFromWorld, worldYawFromVehicle } from '../../project-harbor/world/roads';
import { FreeRoam, IDLE_INPUT } from '../../project-harbor/world/session';
import { FixedClock, StreetSim, type SimContext, type SimEvent } from '../../project-harbor/world/street-sim';
import {
  claimSignal, lodOf, neighborsOnLane, stepTraffic, SpatialHash, type TrafficCar,
} from '../../project-harbor/world/lane';
import { CityGarage } from '../../project-harbor/world/garage';
import type { Ride } from '../../project-harbor/world/traffic';

const view = { load() {}, unload() {} };

function context(over: Partial<SimContext> = {}): SimContext {
  return {
    x: SPAWN.x, z: SPAWN.z, yaw: 0, use: false, throttle: 0, steer: 0, handbrake: false,
    stars: 0, crimePulse: false, seen: false, blocked: () => false, clear: () => true, ...over,
  };
}

function blank(over: Partial<TrafficCar> = {}): TrafficCar {
  return {
    id: 1, x: 0, z: 0, yaw: 0, speed: 8, vx: 0, vz: 0, edge: 0, progress: 10,
    kind: 'civil', control: 'ai', mode: 'lane', occupied: true, parked: false, door: 0,
    health: 100, panic: 0, wait: 0, cruise: 12, length: 4.6, width: 1.85, color: 0x527c99,
    persistent: false, lod: 'near', type: 'sedan', drift: 0, ...over,
  };
}

function redTime(axis: 'x' | 'z', x: number, z: number): number {
  for (let time = 0; time < 24; time += 0.25) if (!signalOpen(axis, x, z, time)) return time;
  return 0;
}

describe('harbor traffic, hijack, and pursuit', () => {
  it('builds the lane graph in the world map, outside the old vehicle grid', () => {
    const edges = buildLanes();
    expect(edges.length).toBeGreaterThan(40);
    for (const edge of edges) {
      const pose = poseOn(edge, edge.length * 0.5);
      expect(pose.x).toBeGreaterThan(0);
      expect(pose.x).toBeLessThan(WIDTH);
      expect(pose.z).toBeGreaterThan(0);
      expect(pose.z).toBeLessThan(DEPTH);
      expect(edge.next.length).toBeGreaterThan(0);
    }
    expect(edges.some(edge => poseOn(edge, edge.length * 0.5).x > LIMIT)).toBe(true);
    const spawn = nearestLane(edges, SPAWN.x, SPAWN.z);
    expect(spawn).not.toBeNull();
    expect(Math.hypot(poseOn(spawn!.edge, spawn!.progress).x - SPAWN.x, poseOn(spawn!.edge, spawn!.progress).z - SPAWN.z)).toBeLessThan(8);
  });

  it('fills six districts without stacking cars on the player spawn', () => {
    const sim = new StreetSim();
    const counts = new Map<string, number>();
    let nearSpawn = 0;
    for (const car of sim.cars) {
      expect(car.x).toBeGreaterThan(4);
      expect(car.x).toBeLessThan(WIDTH - 4);
      expect(car.z).toBeGreaterThan(4);
      expect(car.z).toBeLessThan(DEPTH - 4);
      if (Math.hypot(car.x - SPAWN.x, car.z - SPAWN.z) <= 12) nearSpawn += 1;
      const id = districtAt(car.x, car.z).id;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect(nearSpawn).toBeLessThanOrEqual(1);
    expect(counts.size).toBe(6);
    expect(counts.get('city')).toBeLessThanOrEqual(10);
    expect(counts.get('forest')).toBeLessThanOrEqual(3);
    expect([...counts.values()].reduce((sum, count) => sum + count, 0)).toBeGreaterThan(20);
    expect(sim.cars.filter(car => car.parked && car.occupied).length).toBeGreaterThan(0);
  });

  it('reserves one vehicle, refuses a second boarding, and emits a single theft', () => {
    const sim = new StreetSim();
    const car = sim.cars.find(entry => entry.kind === 'civil');
    expect(car).toBeTruthy();
    if (!car) return;
    const lane = nearestLane(sim.edges, SPAWN.x, SPAWN.z);
    expect(lane).not.toBeNull();
    if (!lane) return;
    car.edge = lane.edge.id;
    car.progress = lane.progress;
    car.parked = true;
    car.speed = 0;
    car.panic = 0;
    car.occupied = true;
    car.control = 'ai';
    sim.step(1 / 60, context());
    expect(Math.hypot(car.x - SPAWN.x, car.z - SPAWN.z)).toBeLessThan(3.5);
    sim.step(1 / 60, context({ use: true }));
    expect(sim.hijack?.carId).toBe(car.id);
    expect(car.control).toBe('reserved');
    expect(beginHijack(car, car.x, car.z, 2, () => true).reason).toBe('owned');
    sim.step(1 / 60, context({ use: true }));
    expect(sim.hijack?.carId).toBe(car.id);
    const events: SimEvent[] = [];
    for (let i = 0; i < 100; i++) events.push(...sim.step(1 / 60, context()));
    expect(events.filter(event => event.type === 'crime')).toHaveLength(1);
    expect(events.find(event => event.type === 'crime')?.id).toBe('hijack:' + car.id + ':1');
    expect(events.filter(event => event.type === 'driver')).toHaveLength(1);
    expect(sim.driving).toBe(true);
    expect(sim.playerCar?.id).toBe(car.id);
    const body = sim.ride(car);
    body.health = 21; car.health = 21;
    sim.repairPlayer(100);
    sim.step(1 / 60, context());
    expect(sim.playerCar?.health).toBe(100);
    expect(sim.ride(car).health).toBe(100);
  });

  it('retains one use pulse across substep-sized frames', () => {
    const sim = new StreetSim();
    const car = sim.cars.find(entry => entry.kind === 'civil')!;
    const lane = nearestLane(sim.edges, SPAWN.x, SPAWN.z)!;
    car.edge = lane.edge.id; car.progress = lane.progress; car.parked = true;
    car.speed = 0; car.panic = 0; car.control = 'ai';
    sim.step(1 / 60, context());
    sim.step(1 / 240, context({ use: true }));
    expect(sim.hijack).toBeNull();
    sim.step(1 / 60, context());
    expect(sim.hijack?.carId).toBe(car.id);
  });

  it('rents a legal car without a theft event and rejects blocked rental space', () => {
    const sim = new StreetSim();
    expect(sim.rent('sport', SPAWN.x, SPAWN.z, () => false)).toBe(false);
    expect(sim.rent('sport', 1344, 692, () => true)).toBe(true);
    expect(sim.playerCar?.type).toBe('sport');
    expect(sim.rent('bike', 1344, 692, () => true)).toBe(false);
    expect(sim.step(1 / 60, context()).filter(event => event.type === 'crime')).toHaveLength(0);
  });

  it('checks the door and refuses a fast or boxed-in vehicle', () => {
    const edges = buildLanes();
    const lane = nearestLane(edges, SPAWN.x, SPAWN.z)!;
    const pose = poseOn(lane.edge, lane.progress);
    const car = blank({ x: pose.x, z: pose.z, yaw: pose.yaw, speed: 0, width: 1.85 });
    const door = doorPoint(car);
    expect(Math.hypot(door.x - car.x, door.z - car.z)).toBeGreaterThan(1);
    expect(Math.hypot(door.seatX - car.x, door.seatZ - car.z)).toBeLessThan(0.5);
    expect(beginHijack(car, pose.x + 20, pose.z, 1, () => true).reason).toBe('far');
    expect(beginHijack({ ...car, speed: 12 }, pose.x, pose.z, 1, () => true).reason).toBe('fast');
    expect(beginHijack(car, pose.x, pose.z, 1, () => false).reason).toBe('blocked');
    const started = beginHijack(car, pose.x, pose.z, 1, () => true);
    expect(started.hijack?.phase).toBe('door');
    let hijack = started.hijack;
    const events = [];
    for (let i = 0; i < 90 && hijack; i++) {
      const stepped = stepHijack(hijack, 1 / 60);
      hijack = stepped.hijack;
      events.push(...stepped.events);
    }
    expect(events.map(event => event.type)).toEqual(['driver', 'crime', 'board']);
    const empty = beginHijack({ ...car, occupied: false }, pose.x, pose.z, 1, () => true).hijack;
    expect(empty).toBeTruthy();
    if (!empty) return;
    const boarded = [];
    let cursor: typeof empty | null = empty;
    for (let i = 0; i < 50 && cursor; i++) {
      const stepped = stepHijack(cursor, 1 / 60);
      cursor = stepped.hijack;
      boarded.push(...stepped.events);
    }
    expect(boarded.map(event => event.type)).toEqual(['board']);
  });

  it('follows the car ahead, holds at red, and recovers a deadlocked intersection', () => {
    const edges = buildLanes();
    const edge = edges.find(entry => entry.length > 80 && entry.next.length > 0);
    expect(edge).toBeTruthy();
    if (!edge) return;
    const leader = blank({ id: 1, edge: edge.id, progress: 40, speed: 3 });
    const follower = blank({ id: 2, edge: edge.id, progress: 28, speed: 12, cruise: 12 });
    const next = blank({ id: 3, edge: edge.next[0]!, progress: 4, speed: 2 });
    const cars = [leader, follower, next];
    const around = neighborsOnLane(cars, 1, edges);
    expect(around.some(neighbor => neighbor.id === 1 && neighbor.gap > 0 && neighbor.gap < 20)).toBe(true);
    expect(around.some(neighbor => neighbor.id === 3 && neighbor.gap > edge.length - 40)).toBe(true);
    stepTraffic(follower, edge, edges, around, true, false, false, false, 0, 0.5);
    expect(follower.mode).toBe('follow');
    expect(follower.speed).toBeLessThan(8);

    const end = endPoint(edge);
    const waiting = blank({ id: 4, edge: edge.id, progress: edge.length - 8, speed: 10, cruise: 10 });
    stepTraffic(waiting, edge, edges, [], false, false, false, false, redTime(edge.axis, end.x, end.z), 0.35);
    expect(waiting.mode).toBe('hold');
    expect(waiting.wait).toBeGreaterThan(0);
    expect(waiting.speed).toBeLessThan(6);
    waiting.wait = 7;
    stepTraffic(waiting, edge, edges, [], true, false, false, false, redTime(edge.axis, end.x, end.z), 0.2);
    expect(waiting.mode).toBe('cross');

    const held: { signal: number; carId: number; time: number }[] = [];
    expect(claimSignal(held, edge.crossing, 8, 0, true)).toBe(true);
    expect(claimSignal(held, edge.crossing, 9, 2, true)).toBe(false);
    expect(claimSignal(held, edge.crossing, 8, 3, false)).toBe(true);
    expect(claimSignal(held, edge.crossing, 9, 8.2, true)).toBe(true);
  });

  it('throttles distant traffic and finds neighbors through the spatial hash', () => {
    expect(lodOf(10, false)).toBe('near');
    expect(lodOf(100, false)).toBe('mid');
    expect(lodOf(200, false)).toBe('far');
    expect(lodOf(400, false)).toBe('sleep');
    expect(lodOf(400, true)).toBe('mid');
    const hash = new SpatialHash();
    hash.insert(0, 1536, 576);
    hash.insert(1, 2400, 1600);
    expect(hash.around(1540, 580, 12)).toContain(0);
    expect(hash.around(1540, 580, 12)).not.toContain(1);
    hash.clear();
    expect(hash.around(1540, 580, 12)).toHaveLength(0);
  });

  it('advances pursuit by stars, then loses and cools down without double-counting a crime', () => {
    expect(policyFor(0.2).police).toBe(1);
    expect(policyFor(0.2).military).toBe(0);
    expect(policyFor(2.2).blocks).toBe(1);
    expect(policyFor(4.1).military).toBe(2);
    expect(policyFor(4.1).foot).toBe(4);
    expect(dispatchCommand(1, 'responding').allowSpawn).toBe(false);
    expect(dispatchCommand(3, 'engaged')).toMatchObject({ police: 3, blocks: 1, allowSpawn: true, withdraw: false });
    expect(dispatchCommand(5, 'searching').military).toBe(2);
    expect(dispatchCommand(5, 'cooldown').withdraw).toBe(true);
    expect(spawnBudget(0, 3, true)).toBe(1);
    expect(spawnBudget(3, 3, true)).toBe(0);
    expect(spawnBudget(0, 3, false)).toBe(0);

    let clock = initialPursuit(10, 20);
    clock = stepPursuit(clock, 1, false, false, 10, 20, 0.1);
    expect(clock.phase).toBe('responding');
    clock = stepPursuit(clock, 1, false, false, 12, 22, 4);
    expect(clock.phase).toBe('searching');
    expect(clock.lastX).toBe(10);
    clock = stepPursuit(clock, 1, true, false, 30, 40, 0.2);
    expect(clock.phase).toBe('engaged');
    expect(clock.lastX).toBe(30);
    clock = stepPursuit(clock, 1, false, false, 30, 40, 0.1);
    expect(clock.phase).toBe('searching');
    clock = stepPursuit(clock, 1, false, false, 30, 40, 8);
    expect(clock.phase).toBe('cooldown');
    clock = stepPursuit(clock, 1, false, true, 4, 5, 0.1);
    expect(clock.phase).toBe('responding');
    clock = stepPursuit(clock, 0, true, false, 4, 5, 1);
    expect(clock.phase).toBe('clear');

    const ledger = new CrimeLedger();
    expect(ledger.claim('hijack:4:1')).toBe(true);
    expect(ledger.claim('hijack:4:1')).toBe(false);
    expect(ledger.claim('shot:2')).toBe(true);
    const kept = retainPursuit(
      [{ id: 1, persistent: true, x: 0, z: 0 }, { id: 2, persistent: false, x: 100, z: 0 }],
      0, 0, 40,
    );
    expect(kept.map(unit => unit.id)).toEqual([1]);
  });

  it('runs one dispatcher, keeps chasing cars when the player changes chunk, and steps on a fixed clock', () => {
    const sim = new StreetSim();
    for (let i = 0; i < 240; i++) sim.step(1 / 60, context({ stars: 5 }));
    const police = sim.cars.filter(car => car.kind === 'police' && car.mode !== 'withdraw');
    const military = sim.cars.filter(car => car.kind === 'military' && car.mode !== 'withdraw');
    const blocks = sim.cars.filter(car => car.kind === 'block' && car.mode !== 'withdraw');
    expect(police.length).toBeGreaterThan(0);
    expect(police.length).toBeLessThanOrEqual(3);
    expect(military.length).toBeGreaterThan(0);
    expect(military.length).toBeLessThanOrEqual(2);
    expect(blocks.length).toBeLessThanOrEqual(2);
    const chasing = sim.cars.filter(car => car.persistent).map(car => car.id);
    for (let i = 0; i < 10; i++) sim.step(1 / 60, context({ x: 400, z: 400, stars: 5 }));
    for (const id of chasing) expect(sim.cars.some(car => car.id === id)).toBe(true);

    const clock = new FixedClock();
    let steps = 0;
    clock.advance(0.05, () => { steps += 1; });
    expect(steps).toBe(3);
    const coarse = new StreetSim();
    const fine = new StreetSim();
    for (let i = 0; i < 20; i++) coarse.step(1 / 30, context());
    for (let i = 0; i < 40; i++) fine.step(1 / 60, context());
    const left = coarse.cars.find(car => !car.parked);
    const right = fine.cars.find(car => car.id === left?.id);
    expect(left && right).toBeTruthy();
    if (!left || !right) return;
    expect(Math.hypot(left.x - right.x, left.z - right.z)).toBeLessThan(2);
  });

  it('turns right when the player steers right and leaves the vehicle only with room', () => {
    const body = makeVehicle(1, 'sedan', SPAWN.x, SPAWN.z, vehicleYawFromWorld(0));
    stepVehicle(body, { throttle: 1, steer: 1, handbrake: false }, 0.6);
    const positive = worldYawFromVehicle(body.yaw);
    const other = makeVehicle(2, 'sedan', SPAWN.x, SPAWN.z, vehicleYawFromWorld(0));
    stepVehicle(other, { throttle: 1, steer: -1, handbrake: false }, 0.6);
    expect(worldYawFromVehicle(other.yaw)).toBeGreaterThan(0.05);
    expect(positive).toBeLessThan(-0.05);

    const sim = new StreetSim();
    const car = sim.cars.find(entry => entry.kind === 'civil');
    expect(car).toBeTruthy();
    if (!car) return;
    const lane = nearestLane(sim.edges, SPAWN.x, SPAWN.z)!;
    car.edge = lane.edge.id;
    car.progress = lane.progress;
    car.parked = true;
    car.speed = 0;
    car.occupied = false;
    car.panic = 0;
    car.control = 'ai';
    sim.step(1 / 60, context());
    for (let i = 0; i < 50; i++) sim.step(1 / 60, context({ use: i === 0 }));
    expect(sim.driving).toBe(true);
    const yaw = sim.playerCar?.yaw ?? 0;
    for (let i = 0; i < 40; i++) sim.step(1 / 60, context({ throttle: 1, steer: -1 }));
    expect(sim.playerCar?.yaw ?? 0).toBeGreaterThan(yaw + 0.05);
    for (let i = 0; i < 40; i++) sim.step(1 / 60, context({ throttle: 1, use: i === 39 }));
    expect(sim.driving).toBe(true);
    expect(sim.notice).toContain('속도');
    for (let i = 0; i < 240 && Math.abs(sim.playerCar?.speed ?? 9) > 2.5; i++) {
      sim.step(1 / 60, context({ handbrake: true }));
    }
    sim.step(1 / 60, context({ handbrake: true, use: true, clear: () => false }));
    expect(sim.driving).toBe(true);
    expect(sim.notice).toContain('공간');
    sim.step(1 / 60, context({ handbrake: true, use: true }));
    expect(sim.driving).toBe(false);
    expect(sim.consumeExit()).not.toBeNull();
  });

  it('raises wanted once, panics the driver and a bystander, and dispatches the new response only', () => {
    const roam = new FreeRoam(view);
    const car = roam.cars.find(entry => entry.kind === 'civil' && entry.occupied);
    expect(car).toBeTruthy();
    if (!car) return;
    const lane = nearestLane(buildLanes(), roam.x, roam.z)!;
    car.edge = lane.edge.id;
    car.progress = lane.progress;
    car.parked = true;
    car.speed = 0;
    car.panic = 0;
    car.control = 'ai';
    roam.tick(IDLE_INPUT, 1 / 60);
    const bystander = roam.placePed(car.x, car.z, { cash: 40, health: 40 });
    const before = roam.vitals.wanted;
    for (let i = 0; i < 100; i++) roam.tick({ ...IDLE_INPUT, use: i === 0 }, 1 / 60);
    expect(roam.driving).toBe(true);
    expect(roam.vitals.wanted - before).toBeCloseTo(1.35, 5);
    expect(roam.peds.some(ped => ped.id.startsWith('driver-') && ped.state === 'flee')).toBe(true);
    expect(bystander.state).toBe('flee');
    for (let i = 0; i < 30; i++) roam.tick(IDLE_INPUT, 1 / 60);
    expect(roam.vitals.wanted).toBeCloseTo(1.35, 5);

    const heat = new FreeRoam(view);
    heat.vitals.wanted = 1;
    heat.vitals.invulnerable = 30;
    for (let i = 0; i < 140; i++) heat.tick(IDLE_INPUT, 0.05);
    expect(heat.cars.filter(entry => entry.kind === 'police' && entry.mode !== 'withdraw').length).toBeLessThanOrEqual(1);
    expect(heat.cars.some(entry => entry.kind === 'police')).toBe(true);
    expect(heat.peds.filter(ped => ped.kind === 'police' && ped.health > 0).length).toBeLessThanOrEqual(1);
    expect(heat.vitals.wanted).toBeGreaterThan(0);

    const military = new FreeRoam(view);
    military.vitals.wanted = 5;
    military.vitals.invulnerable = 30;
    for (let i = 0; i < 80; i++) military.tick(IDLE_INPUT, 0.05);
    const ids = military.cars.filter(entry => entry.persistent).map(entry => entry.id);
    expect(military.cars.some(entry => entry.kind === 'military')).toBe(true);
    expect(military.peds.filter(ped => ped.kind === 'police' && ped.health > 0).length).toBeLessThanOrEqual(4);
    military.world.x = 420;
    military.world.z = 420;
    military.tick(IDLE_INPUT, 0.05);
    for (const id of ids) expect(military.cars.some(entry => entry.id === id)).toBe(true);
  });

  it('pools car meshes and disposes them', () => {
    const scene = new T.Scene();
    const garage = new CityGarage(scene);
    const near = makeVehicle(7, 'sedan', 20, 0, 0);
    near.door = 1;
    const chase = makeVehicle(9, 'police', 250, 0, 0);
    garage.sync([near as Ride, chase as Ride]);
    const shown = scene.children.filter(child => child instanceof T.Group);
    expect(shown).toHaveLength(2);
    const door = shown.find(group => Math.hypot(group.position.x - 20, group.position.z) < 1)?.children[1];
    expect(door).toBeTruthy();
    expect(door?.rotation.y).toBeCloseTo(-0.9, 5);
    garage.sync([]);
    expect(scene.children.filter(child => child instanceof T.Group)).toHaveLength(0);
    garage.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
