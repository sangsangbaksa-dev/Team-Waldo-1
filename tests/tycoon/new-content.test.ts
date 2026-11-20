import { describe, expect, it } from 'vitest';
import { createCore } from '../../src/tycoon/core';
import { outfitFor } from '../../src/tycoon/scene/player';

function finish(core: ReturnType<typeof createCore>) {
  for (let i = 0; i < 400 && core.state.activity; i++) core.tick(0.1);
}

describe('HUSTLE city life', () => {
  it('uses civilian models throughout the career', () => {
    for (let stage = 0; stage <= 6; stage++) expect(outfitFor(stage).kind).toMatch(/^civ/);
  });

  it('pays an extra shift and respects working hours', () => {
    const core = createCore({ seed: 42 });
    core.data.stage = 'parttime'; core.data.minute = 8 * 60;
    core.setPresence('job_mart');
    const action = core.actionsAt('job_mart').find(a => a.id === 'extra_shift')!;
    expect(action.enabled).toBe(true);
    expect(core.perform('job_mart', action.id).ok).toBe(true);
    finish(core);
    expect(core.state.cash).toBe(action.reward);
    expect(core.state.energy).toBe(100 - action.energy);
    core.data.minute = 2 * 60;
    expect(core.actionsAt('job_mart').find(a => a.id === 'extra_shift')!.enabled).toBe(false);
  });

  it('lets an owner improve a shop and records promotion spending', () => {
    const core = createCore({ seed: 42 });
    core.data.stage = 'parttime'; core.data.cash = 1000; core.data.minute = 8 * 60;
    core.setPresence('lot_s1');
    expect(core.perform('lot_s1', 'build_stall').ok).toBe(true); finish(core);
    const shop = core.data.lots.lot_s1.shop!;
    const before = shop.rating;
    expect(core.perform('lot_s1', 'clean_shop').ok).toBe(true); finish(core);
    expect(shop.rating).toBeGreaterThan(before);
    const cost = core.actionsAt('lot_s1').find(a => a.id === 'promote_shop')!.cost;
    const upkeep = core.data.ledger.upkeep;
    expect(core.perform('lot_s1', 'promote_shop').ok).toBe(true); finish(core);
    expect(core.data.ledger.upkeep).toBe(upkeep + cost);
    expect(shop.rating).toBeGreaterThan(before + 8);
  });
});
