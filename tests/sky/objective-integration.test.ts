import { describe, expect, it } from 'vitest';
import { SkySim, DIFFS, type Input } from '../../src/sky/sim';
const input: Input = { pitch: 0, roll: 0, throttle: 0.55, fire: false, missile: false, flare: false };
describe('objective integration', () => {
  it('awards a clean-wave bonus only once', () => {
    const sim = new SkySim(DIFFS[1]!);
    sim.intermission = 0; sim.step(0.01, input);
    expect(sim.objective?.kind).toBe('clean');
    for (const e of sim.enemies()) sim.kill(e, sim.player.id);
    const before = sim.score;
    sim.step(0.01, input);
    expect(sim.score - before).toBe(275);
    expect(sim.shield).toBe(15);
    sim.step(0.01, input);
    expect(sim.score - before).toBe(275);
  });
  it('fails the clean objective if a hit is absorbed by a shield', () => {
    const sim = new SkySim(DIFFS[1]!);
    sim.intermission = 0; sim.step(0.01, input);
    sim.shield = 20;
    sim.damage(sim.player, 1, 0, sim.player.pos);
    expect(sim.objective?.damaged).toBe(true);
    for (const e of sim.enemies()) sim.kill(e, sim.player.id);
    const before = sim.score;
    sim.step(0.01, input);
    expect(sim.score).toBe(before);
  });
});
