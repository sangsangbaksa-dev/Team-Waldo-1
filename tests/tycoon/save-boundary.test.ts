import { describe, expect, it } from 'vitest';
import { createCore } from '../../src/tycoon/core/application';
import { restoreGame, serializeGame } from '../../src/tycoon/core/save-codec';
import { summarizeSave } from '../../src/tycoon/core/summary-model';
import { TYCOON_SAVE_KEY, loadTycoon, saveTycoon, readTycoonSummary, clearTycoon } from '../../src/tycoon/infrastructure/local-save';

function memoryStore(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: key => data.get(key) ?? null,
    key: index => [...data.keys()][index] ?? null,
    removeItem: key => { data.delete(key); },
    setItem: (key, value) => { data.set(key, value); },
  };
}
describe('Hustle save boundary', () => {
  it('round trips versioned simulation state without browser dependencies', () => {
    const core = createCore({ seed: 42 });
    const saved = core.serialize();
    const restored = restoreGame(saved);
    expect(restored).not.toBeNull();
    if (restored) expect(serializeGame(restored)).toEqual(saved);
    expect(createCore({ save: saved }).state.cash).toBe(core.state.cash);
  });
  it('uses the same save key and lightweight summary', () => {
    const store = memoryStore();
    const core = createCore({ seed: 42 });
    expect(saveTycoon(core, store)).toBe(true);
    expect(store.getItem(TYCOON_SAVE_KEY)).not.toBeNull();
    expect(readTycoonSummary(store)).toEqual(summarizeSave(loadTycoon(store)));
    expect(readTycoonSummary(store).has).toBe(true);
    clearTycoon(store);
    expect(readTycoonSummary(store).has).toBe(false);
  });
  it('rejects invalid save versions and provides defaults', () => {
    expect(restoreGame({ v: 99 })).toBeNull();
    expect(summarizeSave({ v: 99 }).has).toBe(false);
    const store = memoryStore();
    store.setItem(TYCOON_SAVE_KEY, 'invalid json');
    expect(loadTycoon(store)).toBeNull();
    expect(readTycoonSummary(store).has).toBe(false);
  });
});
