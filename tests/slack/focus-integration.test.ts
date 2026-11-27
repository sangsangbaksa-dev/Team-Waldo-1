import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/slack/sim';
describe('focus integration', () => {
  it('boosts fun at the cost of suspicion and ends on cover', () => {
    for (const stage of ['class', 'dorm'] as const) {
      const normal = createSim(stage, 123, 2), focused = createSim(stage, 123, 2);
      for (const sim of [normal, focused]) {
        sim.start(); sim.doActivity('game'); sim.setCover(false);
      }
      expect(focused.activateFocus()).toBe(true);
      normal.update(1); focused.update(1);
      expect(focused.state.fun).toBeGreaterThan(normal.state.fun);
      expect(focused.state.sus).toBeGreaterThan(normal.state.sus);
      focused.setCover(true);
      expect(focused.focus.remaining).toBe(0);
      expect(focused.activateFocus()).toBe(false);
      expect(focused.focus.uses).toBe(2);
    }
  });
});
