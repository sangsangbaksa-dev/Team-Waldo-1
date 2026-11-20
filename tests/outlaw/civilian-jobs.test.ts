import { expect, it } from 'vitest';
import { Sim } from '../../src/outlaw/sim';
import { startJob, stepJobs } from '../../src/outlaw/jobs';

it.each(['cleanup', 'photos'])('%s requires arriving on foot and pays after three stops', id => {
  const sim = new Sim(42); const cash = sim.cash;
  expect(startJob(sim, id)).toBe('');
  sim.player.vehicle = 999;
  sim.player.x = sim.job.data.x0!; sim.player.z = sim.job.data.z0!;
  stepJobs(sim, 1); expect(sim.job.stage).toBe(0);
  sim.player.vehicle = 0;
  for (let i = 0; i < 3; i++) { sim.player.x = sim.job.data[`x${i}`]!; sim.player.z = sim.job.data[`z${i}`]!; stepJobs(sim, 1); }
  expect(sim.job.active).toBe(''); expect(sim.cash).toBeGreaterThan(cash);
  expect(sim.life.counters[id]).toBe(1);
  expect(new Sim(42, sim.exportSave()).life.counters[id]).toBe(1);
});

it('roadside repair requires five uninterrupted seconds and a report to the garage', () => {
  const sim = new Sim(42); const cash = sim.cash;
  expect(startJob(sim, 'roadside')).toBe('');
  const car = sim.vehicle(sim.job.ids.car!)!;
  sim.player.x = car.x; sim.player.z = car.z;
  stepJobs(sim, 3); sim.player.x += 20; stepJobs(sim, 1);
  sim.player.x = car.x; stepJobs(sim, 4); expect(sim.job.stage).toBe(0);
  stepJobs(sim, 1); expect(sim.job.stage).toBe(1); expect(car.hp).toBe(car.maxHp);
  const garage = sim.map.pois.find(p => p.id === 'garage0') ?? sim.map.pois[0]!;
  sim.player.x = garage.x; sim.player.z = garage.z; stepJobs(sim, 1);
  expect(sim.job.active).toBe(''); expect(sim.cash).toBeGreaterThan(cash);
});

it('fails roadside work when the vehicle is destroyed', () => {
  const sim = new Sim(42); const cash = sim.cash;
  startJob(sim, 'roadside'); sim.vehicle(sim.job.ids.car!)!.wrecked = true;
  stepJobs(sim, 1); expect(sim.job.active).toBe(''); expect(sim.cash).toBe(cash);
});
