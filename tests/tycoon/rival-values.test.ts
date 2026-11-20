import { expect, it } from 'vitest';
import { createCore } from '../../src/tycoon/core';
import { rivalValues, rivalValue, takeoverCost, takeoverCostForValue } from '../../src/tycoon/core/actions';
import { RIVALS } from '../../src/tycoon/core/data';
import { LOT_IDS } from '../../src/tycoon/core/model';
it('one-pass rival stats and prices match individual lookup after ownership changes', () => {
  const core = createCore({ seed: 3 }), g = core.data;
  for (let i = 0; i < 3; i++) {
    g.lots[LOT_IDS[i]] = { owner: 'rival', rivalId: RIVALS[i % RIVALS.length].id, rivalKind: 'cafe', rivalLevel: i + 1 };
  }
  for (let pass = 0; pass < 2; pass++) {
    const stats = rivalValues(g);
    for (const rival of RIVALS) {
      const value = stats.get(rival.id) ?? { shops: 0, value: 0 };
      expect(value).toEqual(rivalValue(g, rival.id));
      expect(takeoverCostForValue(value.value)).toBe(takeoverCost(g, rival.id));
    }
    g.lots[LOT_IDS[0]] = { owner: 'free' } as (typeof g.lots)[string];
  }
});
