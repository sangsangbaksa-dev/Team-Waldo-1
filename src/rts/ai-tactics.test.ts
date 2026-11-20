import { describe, expect, it } from 'vitest';
import { RtsAi } from './ai';
import { RtsSim } from './sim';
import { STIM_COST, UNITS } from './config';

function fixture() {
  const sim = new RtsSim();
  sim.tick = 400;
  const m = sim.spawnAt(0, 'marine', 30, 30);
  sim.spawnAt(1, 'marine', m.x + 1, m.y);
  return { sim, m };
}

describe('FRONTLINE tactical AI', () => {
  it('uses stim against a nearby enemy on hard difficulty', () => {
    const { sim, m } = fixture();
    new RtsAi(0, 'hard').think(sim);
    expect(m.ab).toBeGreaterThan(sim.tick);
    expect(m.hp).toBe(UNITS.marine.hp - STIM_COST);
  });

  it('does not spend stim health when a marine is already injured', () => {
    const { sim, m } = fixture();
    m.hp = STIM_COST + 1;
    new RtsAi(0, 'hard').think(sim);
    expect(m.ab).toBe(0);
    expect(m.hp).toBe(STIM_COST + 1);
  });

  it('keeps easy AI free of tactical ability automation', () => {
    const { sim, m } = fixture();
    new RtsAi(0, 'easy').think(sim);
    expect(m.ab).toBe(0);
  });
});
