import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/outlaw/sim';
import { startJob, stepJobs, jobSpawnLane } from '../../src/outlaw/jobs';
import { isOpen, nearestLane } from '../../src/outlaw/world';
import { blankPedInput, blankCarInput, VEHICLES, WEAPON_ORDER } from '../../src/outlaw/types';

describe('Outlaw job regression', () => {
  it('counts one collision once for fragile cargo, independent of tick rate', () => {
    const run = (steps: number) => {
      const sim = new Sim(7);
      expect(startJob(sim, 'cargo')).toBe('');
      const car = sim.vehicle(sim.job.ids.car)!;
      sim.player.vehicle = car.id; car.driver = sim.player.id;
      stepJobs(sim, 0);
      car.hp -= car.maxHp * 0.1; car.crashT = 0.22;
      for (let i = 0; i < steps; i++) stepJobs(sim, 0.2 / steps);
      return sim.job.data.hp;
    };
    expect(run(12)).toBeCloseTo(85, 5);
    expect(run(1)).toBeCloseTo(run(12), 5);
  });
  it('keeps the getaway destination fixed as the player moves', () => {
    const sim = new Sim(7);
    expect(startJob(sim, 'getaway')).toBe('');
    sim.job.stage = 1;
    stepJobs(sim, 0);
    const a = sim.job.markers[0];
    sim.player.x += 200; sim.player.z -= 200;
    stepJobs(sim, 0);
    expect(sim.job.markers[0]).toEqual(a);
  });
  it('fails a vigilante job if a civilian dies during the final takedown', () => {
    const sim = new Sim(7);
    expect(startJob(sim, 'vigilante')).toBe('');
    const before = sim.cash;
    for (let i = 0; i < sim.job.data.count; i++) sim.ped(sim.job.ids[`e${i}`])!.alive = false;
    sim.civKills++;
    stepJobs(sim, 0);
    expect(sim.job.active).toBe('');
    expect(sim.cash).toBe(before);
    expect(sim.drain()).toContainEqual(expect.objectContaining({ t: 'activity', kind: 'vigilante', what: 'fail' }));
  });
  it('blocks firearm selection before shooting in the arena', () => {
    const sim = new Sim(7), p = sim.player;
    const arena = sim.map.pois.find(q => q.kind === 'arena')!; p.x = arena.x; p.z = arena.z; sim.cash = 1000;
    expect(startJob(sim, 'fight')).toBe('');
    const slot = WEAPON_ORDER.indexOf('pistol'), gun = p.guns[slot]!;
    const mag = gun.mag; p.cur = slot; p.cd = 0;
    sim.step(1 / 60, { ...blankPedInput(), slot, fire: true }, blankCarInput());
    expect(p.cur).toBe(0);
    expect(gun.mag).toBe(mag);
  });
});

it('ambulance patient loses health only once for each damage amount', () => {
  const sim = new Sim(7);
  expect(startJob(sim, 'paramedic')).toBe('');
  const car = sim.vehicle(sim.job.ids.car)!;
  sim.job.stage = 1; sim.job.data.carHp = car.hp;
  car.hp -= car.maxHp * 0.1; car.crashT = 0.22;
  for (let i = 0; i < 60; i++) stepJobs(sim, 1 / 60);
  expect(sim.job.data.hp).toBeCloseTo(84.35, 5);
});

describe('OUTLAW procedural gang encounter spawn safety', () => {
  it('places all four guards on accessible ground instead of inside map props', () => {
    for (const seed of [1, 7, 13, 19, 37]) for (const mission of ['vigilante', 'contract']) {
      const sim = new Sim(seed);
      expect(startJob(sim, mission)).toBe('');
      const guards = sim.peds.filter(p => p.tag === 'job');
      expect(guards, mission).toHaveLength(4);
      for (const guard of guards) expect(isOpen(sim.map, guard.x, guard.z, .65), `${mission} / seed ${seed} / guard ${guard.id}`).toBe(true);
      for (let i = 0; i < guards.length; i++) for (let j = i + 1; j < guards.length; j++) {
        expect(Math.hypot(guards[i].x-guards[j].x,guards[i].z-guards[j].z), `${mission} / seed ${seed}`).toBeGreaterThanOrEqual(2.4);
      }
    }
  });
});

describe('OUTLAW job vehicle spawn clearance', () => {
  it('picks a different road if the nearest lane is already occupied', () => {
    const sim = new Sim(19);
    const x = sim.player.x + 8, z = sim.player.z;
    const closest = sim.map.lanes[nearestLane(sim.map,x,z)]!;
    const blocker = sim.spawnVehicle('truck', closest.x, closest.z, closest.h);
    const lane = jobSpawnLane(sim, closest.x, closest.z, 'ambulance');
    expect(lane).toBeDefined();
    expect((lane!.x-blocker.x)**2 + (lane!.z-blocker.z)**2)
      .toBeGreaterThan((Math.hypot(VEHICLES.truck.halfL,VEHICLES.truck.halfW) + Math.hypot(VEHICLES.ambulance.halfL,VEHICLES.ambulance.halfW))**2);
    expect(isOpen(sim.map,lane!.x,lane!.z,Math.hypot(VEHICLES.ambulance.halfL,VEHICLES.ambulance.halfW))).toBe(true);
  });
  it('refuses mission initiation when the road graph has no legal spaces', () => {
    const sim = new Sim(20);
    sim.map.lanes = [];
    expect(startJob(sim,'paramedic')).toContain('안전한 도로');
    expect(sim.job.active).toBe('');
    expect(sim.vehicles.every(v=>v.tag!=='job')).toBe(true);
  });
});

it('places the first arena opponent on walkable ground instead of inside the entrance building', () => {
  const sim = new Sim(67), arena = sim.map.pois.find(p=>p.kind==='arena')!;
  sim.player.x = arena.x; sim.player.z = arena.z; sim.cash = 1000;
  expect(startJob(sim,'fight')).toBe('');
  const foe = sim.ped(sim.job.ids.foe)!;
  expect(foe).toBeDefined();
  expect(isOpen(sim.map,foe.x,foe.z,.65)).toBe(true);
  expect(Math.hypot(foe.x-arena.x,foe.z-arena.z)).toBeLessThan(40);
  expect(foe.mode).toBe('attack');
  expect(foe.hp).toBe(90);
});

describe('OUTLAW side job parking and start safety', () => {
  it.each(['smuggle', 'cargo', 'demolish', 'tail'])('%s starts without clipping into city buildings or other cars', id => {
    const sim = new Sim(91);
    expect(startJob(sim,id)).toBe('');
    const cars = sim.vehicles.filter(v=>v.tag==='job');
    expect(cars.length).toBe(id === 'demolish' ? 3 : 1);
    for (const v of cars) {
      const r = Math.hypot(VEHICLES[v.kind].halfL, VEHICLES[v.kind].halfW);
      expect(isOpen(sim.map,v.x,v.z,r),id).toBe(true);
    }
    for(let i=0;i<cars.length;i++) for(let j=i+1;j<cars.length;j++){
      const a=cars[i],b=cars[j];
      const safe=Math.hypot(VEHICLES[a.kind].halfL,VEHICLES[a.kind].halfW)+Math.hypot(VEHICLES[b.kind].halfL,VEHICLES[b.kind].halfW);
      expect(Math.hypot(a.x-b.x,a.z-b.z),id).toBeGreaterThan(safe);
    }
  });
  it.each(['smuggle','cargo','demolish','tail'])('%s refuses to spawn inside an empty road graph', id => {
    const sim = new Sim(92);
    sim.map.lanes = [];
    expect(startJob(sim,id)).toContain('안전한 도로');
    expect(sim.job.active).toBe('');
    expect(sim.vehicles.some(v=>v.tag==='job')).toBe(false);
  });
});
