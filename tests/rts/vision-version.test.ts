import { describe, expect, it } from 'vitest';
import { Vision, FOG_SEEN, FOG_VISIBLE } from '../../src/rts/vision';
import type { RtsSim } from '../../src/rts/sim';
describe('fog version', () => {
  it('keeps the cache version stable when stationary and reveals/dims on movement', () => {
    const unit = { owner: 0, hp: 100, kind: 'marine', x: 5.5, y: 5.5 };
    const sim = { tick: 0, units: [unit], buildings: [] };
    const v = new Vision(64, 0);
    expect(v.update(sim as unknown as RtsSim, true)).toBe(true);
    const version = v.version;
    expect(v.at(5, 5)).toBe(FOG_VISIBLE);
    sim.tick += 4;
    expect(v.update(sim as unknown as RtsSim)).toBe(false);
    expect(v.version).toBe(version);
    unit.x = 40.5; sim.tick += 4;
    expect(v.update(sim as unknown as RtsSim)).toBe(true);
    expect(v.at(5, 5)).toBe(FOG_SEEN);
    expect(v.at(40, 5)).toBe(FOG_VISIBLE);
  });
});
