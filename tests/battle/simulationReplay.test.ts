import { describe, expect, it } from 'vitest';
import { captureOrder, createWar, stepWar } from '../../src/battle/war';
import { decodeWar, encodeWar } from '../../src/battle/save';
import { activateGeneralAbility, assignGeneral, recruitGeneral } from '../../src/battle/base';

describe('strategy simulation runtime isolation', () => {
  it('reconstructs derived caches after saving and interleaves independent grand battles', () => {
    const original = createWar({ grandBattle: true });
    recruitGeneral(original, 'leon'); assignGeneral(original, 'leon', 0);
    activateGeneralAbility(original, 'leon');
    for (const faction of original.factions) captureOrder(original, faction.id, 4);
    for (let i = 0; i < 120; i++) stepWar(original, .025);
    const restored = decodeWar(encodeWar(original));
    expect(restored).not.toBeNull();
    if (!restored) return;
    const unrelated = createWar();
    for (let i = 0; i < 600; i++) {
      stepWar(original, .025);
      stepWar(unrelated, .05);
      stepWar(restored, .025);
    }
    expect(restored).toEqual(original);
    expect(encodeWar(restored)).toBe(encodeWar(original));
    expect(Object.keys(original)).not.toContain('spatial');
  });
});
