import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/outlaw/sim';
import { nearestWalkPoints, startMission, stepMissions } from '../../src/outlaw/missions';

describe('OUTLAW mission target selection and lifecycle', () => {
  it('chooses the nearest nonoverlapping sidewalks without sorting the source array', () => {
    const points = [
      {x:1,z:1}, {x:1.1,z:1}, {x:10,z:0}, {x:5,z:0}, {x:0,z:6},
      {x:-1,z:-1}, {x:7,z:0},
    ];
    const original = points.slice();
    expect(nearestWalkPoints(points,0,0,3)).toEqual([
      {x:-1,z:-1}, {x:5,z:0}, {x:0,z:6},
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
