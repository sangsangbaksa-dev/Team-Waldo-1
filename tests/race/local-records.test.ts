import { describe, expect, it } from 'vitest';
import { GhostRecorder } from '../../src/race/domain/ghost';
import { createDrift, nitroForChain } from '../../src/race/domain/drift-score';
import { emptyGarage } from '../../src/race/domain/garage';
import { DRIFT_KEY, GARAGE_KEY, ghostKey, readDriftBests, readGarage, readGhost, writeDriftBests, writeGarage, writeGhost } from '../../src/race/infrastructure/local-records';

function memoryStore() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}
describe('race storage boundary', () => {
  it('retains the existing garage and drift keys and sanitizes records', () => {
    const store = memoryStore();
    writeGarage({ coins: 23, skins: [] }, store);
    expect(store.getItem(GARAGE_KEY)).not.toBeNull();
    expect(readGarage(store)).toEqual({ coins: 23, skins: [] });
    writeDriftBests({ valid: 123.6, invalid: -1 }, store);
    expect(store.getItem(DRIFT_KEY)).not.toBeNull();
    expect(readDriftBests(store)).toEqual({ valid: 124 });
  });
  it('preserves the ghost format and validates lap counts', () => {
    const recorder = new GhostRecorder();
    recorder.tick(0, { x: 0, z: 0, h: 0, total: 0 });
    recorder.tick(0.1, { x: 1, z: 0, h: 0, total: 1 });
    const ghost = recorder.finish(0.2, 1);
    const store = memoryStore();
    writeGhost('test', 1, 'arc', ghost, store);
    expect(store.getItem(ghostKey('test', 1, 'arc'))).not.toBeNull();
    expect(readGhost('test', 1, 'arc', store)).toEqual(ghost);
    store.setItem(ghostKey('test', 2, 'arc'), JSON.stringify(ghost));
    expect(readGhost('test', 2, 'arc', store)).toBeNull();
  });
  it('keeps domain state usable without browser storage', () => {
    const denied = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(readGarage(denied)).toEqual(emptyGarage());
    expect(readDriftBests(denied)).toEqual({});
    expect(readGhost('test', 1, 'arc', denied)).toBeNull();
    expect(() => writeGarage(emptyGarage(), denied)).not.toThrow();
    expect(createDrift().total).toBe(0);
    expect(nitroForChain(6000)).toBe(0.2);
  });
});
