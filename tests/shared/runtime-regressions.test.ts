import { describe, expect, it } from 'vitest';
import { GhostRecorder, ghostAt, ghostDelta, sanitizeGhost } from '../../src/race/ghost';
import { Sim, type SaveData } from '../../src/outlaw/sim';

describe('runtime persistence regressions', () => {
  it('rejects malformed saves without partially overwriting live state', () => {
    const sim = new Sim(42);
    const before = sim.exportSave();
    sim.applySave({ ...before, cash: 123456, guns: null } as unknown as SaveData);
    expect(sim.exportSave()).toEqual(before);
    sim.applySave({ ...before, cash: 123456, life: { ...sim.life, cars: null } } as unknown as SaveData);
    expect(sim.exportSave()).toEqual(before);
  });
  it('loads a valid save', () => {
    const sim = new Sim(42);
    const saved = { ...sim.exportSave(), cash: 1234 };
    sim.applySave(saved);
    expect(sim.cash).toBe(1234);
  });
  it('rejects nonfinite ghost input and keeps exact-boundary final samples valid', () => {
    const rec = new GhostRecorder();
    const pose = { x: 0, z: 1, h: 0, total: 2 };
    rec.tick(NaN, pose);
    rec.tick(0, { ...pose, x: Infinity });
    expect(rec.data).toEqual([]);
    for (let i = 0; i <= 3; i++) rec.tick(i * 0.1, { ...pose, total: i });
    const ghost = rec.finish(0.3, 1, { ...pose, total: 3 });
    expect(sanitizeGhost(ghost)).not.toBeNull();
    expect(ghostAt(ghost, NaN)).toBeNull();
    expect(ghostDelta(ghost, 2, Infinity)).toBeNull();
  });
});
