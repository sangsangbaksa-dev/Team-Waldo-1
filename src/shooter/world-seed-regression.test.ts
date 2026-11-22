import { describe, expect, it, vi } from 'vitest';
import { makeRng } from './config';
import { generateMap, shuffledTownThemes } from './world';

describe('ZERO ZONE deterministic multiplayer map themes', () => {
  it('uses an engine-independent shuffle without Array.sort random comparisons', () => {
    const spy = vi.spyOn(Array.prototype, 'sort');
    let themes: ReturnType<typeof shuffledTownThemes>;
    try {
      themes = shuffledTownThemes(makeRng(12345));
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
    expect(themes).toHaveLength(5);
    expect(new Set(themes).size).toBe(5);
    expect([...themes].sort()).toEqual(['village', 'urban', 'industrial', 'farm', 'military'].sort());
  });

  it('gives the same permutation from the same seed but can choose different orders', () => {
    expect(shuffledTownThemes(makeRng(9876))).toEqual(shuffledTownThemes(makeRng(9876)));
    expect(shuffledTownThemes(() => 0)).not.toEqual(shuffledTownThemes(() => 0.999));
  });

  it('builds identical town, road and collision layouts for multiplayer peers', () => {
    for (const mode of ['br', 'duel'] as const) {
      const a = generateMap(58023, mode), b = generateMap(58023, mode);
      expect(a.compounds).toEqual(b.compounds);
      expect(a.roads).toEqual(b.roads);
      expect(a.buildings).toEqual(b.buildings);
      expect(a.boxes.slice(0, 100)).toEqual(b.boxes.slice(0, 100));
      expect(a.loot.slice(0, 100)).toEqual(b.loot.slice(0, 100));
      if (mode === 'br') expect(new Set(a.compounds.slice(0, 5).map(t => t.theme)).size).toBe(5);
    }
  });
});
