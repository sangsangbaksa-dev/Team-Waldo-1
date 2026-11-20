import { describe, expect, it } from 'vitest';
import { GRACE, MAX_MULT, createDrift, driftLive, flushDrift, nitroForChain, readDriftBests, stepDrift, writeDriftBests } from '../../src/race/driftscore';

const sliding = { drifting: true, vf: 50, slip: 0.35 }, straight = { drifting: false, vf: 50, slip: 0 };
const run = (d: ReturnType<typeof createDrift>, car: { drifting: boolean; vf: number; slip: number }, secs: number, crash = false): void => { for (let t = 0; t < secs; t += 1 / 90) stepDrift(d, car, 1 / 90, crash && t === 0); };

describe('SPEED RUSH drift score', () => {
  it('accumulates points while sliding and raises the multiplier the longer the chain lasts', () => {
    const d = createDrift(); run(d, sliding, 1); const first = d.chain;
    expect(first).toBeGreaterThan(100); expect(d.mult).toBe(1);
    run(d, sliding, 4); expect(d.mult).toBe(4); expect(d.chain).toBeGreaterThan(first * 5);
    run(d, sliding, 20); expect(d.mult).toBe(MAX_MULT);
  });
  it('banks the chain after the grace period and keeps it if the drift resumes in time', () => {
    const d = createDrift(); run(d, sliding, 2); const chain = d.chain;
    run(d, straight, GRACE * 0.6); expect(d.total).toBe(0); expect(driftLive(d)).toBe(true);
    run(d, sliding, 1); expect(d.chain).toBeGreaterThan(chain);
    let bank = null as ReturnType<typeof stepDrift>; for (let t = 0; t < GRACE + 0.2; t += 1 / 90) bank = stepDrift(d, straight, 1 / 90, false) ?? bank;
    expect(bank?.type).toBe('bank'); expect(d.total).toBeGreaterThan(300); expect(d.chain).toBe(0); expect(d.bestChain).toBe(d.total);
  });
  it('loses the chain when the car crashes and ignores slow slides', () => {
    const d = createDrift(); run(d, sliding, 2);
    const ev = stepDrift(d, sliding, 1 / 90, true); expect(ev?.type).toBe('lost'); expect(d.total).toBe(0); expect(d.chain).toBe(0);
    const slow = createDrift(); run(slow, { drifting: true, vf: 10, slip: 0.4 }, 3); expect(slow.chain).toBe(0);
  });
  it('flushes an unfinished chain at the finish line and caps the nitro refund', () => {
    const d = createDrift(); run(d, sliding, 3); const ev = flushDrift(d);
    expect(ev?.type).toBe('bank'); expect(d.total).toBeGreaterThan(0); expect(flushDrift(d)).toBeNull();
    expect(nitroForChain(600)).toBeCloseTo(0.1); expect(nitroForChain(99999)).toBe(0.2);
  });
  it('reads only sane best scores from storage and survives broken storage', () => {
    const store = new Map<string, string>(); const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    writeDriftBests({ sunset: 1234, bad: -5 }, fake); expect(readDriftBests(fake)).toEqual({ sunset: 1234 });
    store.set('waldo.race.drift.v1', '{oops'); expect(readDriftBests(fake)).toEqual({});
    expect(readDriftBests({ getItem: () => { throw new Error('blocked'); } })).toEqual({});
    expect(() => writeDriftBests({ a: 1 }, { setItem: () => { throw new Error('full'); } })).not.toThrow();
  });
});

it('does not start a chain on the crash frame or accept invalid time/speed', () => {
  const d = createDrift();
  expect(stepDrift(d, sliding, 0.1, true)).toBeNull();
  stepDrift(d, sliding, NaN, false); stepDrift(d, { ...sliding, vf: Infinity }, 0.1, false);
  expect(d).toEqual(createDrift());
  expect(nitroForChain(-100)).toBe(0); expect(nitroForChain(NaN)).toBe(0);
});
it('integrates multiplier changes independently of step length', () => {
  const a = createDrift(), b = createDrift();
  stepDrift(a, sliding, 7, false);
  for (let i = 0; i < 70; i++) stepDrift(b, sliding, 0.1, false);
  expect(a.chain).toBeCloseTo(b.chain, 6);
});
