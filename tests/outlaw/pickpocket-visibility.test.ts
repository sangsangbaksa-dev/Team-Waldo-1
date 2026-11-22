import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/outlaw/sim';
import { pickpocket, pickpocketTarget } from '../../src/outlaw/jobs';

describe('OUTLAW City interaction visibility', () => {
  it('does not target civilians on another floor or behind a wall', () => {
    const sim = new Sim(17), p = sim.player;
    const q = sim.spawnPed('civ', p.x + 0.8, p.z, { y: p.y, mode: 'idle' });
    sim.canSee = () => true;
    expect(pickpocketTarget(sim)?.ped.id).toBe(q.id);
    q.y = p.y + 4;
    expect(pickpocketTarget(sim)).toBeNull();
    q.y = p.y;
    sim.canSee = () => false;
    expect(pickpocketTarget(sim)).toBeNull();
    const cash = sim.cash;
    expect(pickpocket(sim)).toContain('대상이 없습니다');
    expect(sim.cash).toBe(cash);
  });
});
