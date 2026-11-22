import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/outlaw/sim';
import { startJob, stepJobs } from '../../src/outlaw/jobs';
import { blankPedInput, blankCarInput, WEAPON_ORDER } from '../../src/outlaw/types';

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
