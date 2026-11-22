import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/outlaw/sim';
import { VEHICLES } from '../../src/outlaw/types';
import { nearestLane, isOpen } from '../../src/outlaw/world';
import { nearestWalkPoints, startMission, stepMissions } from '../../src/outlaw/missions';

describe('OUTLAW mission target selection and lifecycle', () => {
  it('chooses the nearest nonoverlapping sidewalks without sorting the source array', () => {
    const points = [
      {x:1,z:1}, {x:1.1,z:1}, {x:10,z:0}, {x:5,z:0}, {x:0,z:6},
      {x:-1,z:-1}, {x:7,z:0},
    ];
    const original = points.slice();
    expect(nearestWalkPoints(points,0,0,3)).toEqual([
      {x:1,z:1}, {x:5,z:0}, {x:0,z:6},
    ]);
    expect(points).toEqual(original);
    expect(nearestWalkPoints([],0,0,9)).toEqual([]);
  });
  it('does not count a missing scripted chase vehicle as mission success', () => {
    const sim = new Sim(13);
    sim.mission.completed = ['m_delivery','m_theft','m_debt'];
    expect(startMission(sim,'m_chase')).toBe(true);
    const v = sim.vehicle(sim.mission.ids.car)!;
    expect(v).toBeDefined();
    sim.drain();
    sim.removeVehicle(v);
    stepMissions(sim,.016);
    expect(sim.mission.active).toBe('');
    expect(sim.mission.completed).not.toContain('m_chase');
    expect(sim.drain().some(e=>e.t==='mission' && e.what==='fail')).toBe(true);
  });
});

it('places the scripted theft target on an empty, safe road instead of inside traffic', () => {
  const sim = new Sim(71);
  sim.mission.completed = ['m_delivery'];
  const closest = sim.map.lanes[nearestLane(sim.map, 0, 0)]!;
  const blocker = sim.spawnVehicle('truck',closest.x,closest.z,closest.h);
  expect(startMission(sim,'m_theft')).toBe(true);
  const car = sim.vehicle(sim.mission.ids.car)!;
  const radius = Math.hypot(VEHICLES.truck.halfL,VEHICLES.truck.halfW) + Math.hypot(VEHICLES.sports.halfL,VEHICLES.sports.halfW);
  expect(Math.hypot(car.x-blocker.x,car.z-blocker.z)).toBeGreaterThan(radius);
  expect(isOpen(sim.map,car.x,car.z,Math.hypot(VEHICLES.sports.halfL,VEHICLES.sports.halfW))).toBe(true);
});
it('rejects mission-start vehicle placement cleanly when the road graph is empty', () => {
  const sim = new Sim(72);
  sim.mission.completed = ['m_delivery'];
  sim.map.lanes = [];
  expect(startMission(sim,'m_theft')).toBe(false);
  expect(sim.mission.active).toBe('');
  expect(sim.vehicles.every(v=>v.tag!=='m_theft')).toBe(true);
});
