import { describe, expect, it } from 'vitest';
import { createWaveObjective, settleObjective, objectiveFailed } from '../../src/sky/domain/wave-objective';
describe('wave objectives', () => {
  it('rewards a clean wave once, with a player kill', () => {
    const o = createWaveObjective(1, 0); o.kills = 1;
    expect(settleObjective(o, 60)).toBe(true);
    expect(settleObjective(o, 60)).toBe(false);
  });
  it('rejects damage, timeout, and waves without player kills', () => {
    const clean = createWaveObjective(1, 0); clean.damaged = true; clean.kills = 1;
    expect(settleObjective(clean, 1)).toBe(false);
    const fast = createWaveObjective(2, 10); fast.kills = 1;
    expect(objectiveFailed(fast, 55)).toBe(false);
    expect(settleObjective(fast, 55.01)).toBe(false);
    expect(settleObjective(createWaveObjective(1, 0), 2)).toBe(false);
  });
});
