import { describe, expect, it } from 'vitest';
import { createCore } from '../../src/tycoon/core';
import { restoreGame } from '../../src/tycoon/core/save';
import { newGame } from '../../src/tycoon/core/model';
import { BOTTLE_CAP, BOTTLE_PRICE, JOBS, SHOP_KINDS } from '../../src/tycoon/core/data';

describe('HUSTLE economic regression', () => {
  it('saves only the completed transaction during an overnight sleep', () => {
    const g = newGame(7);
    g.minute = 23 * 60 + 30;
    g.energy = 10;
    const core = createCore({ save: g });
    core.setPresence('bench');
    let savedEnergy = -1;
    core.onEvent(e => {
      if (e.type === 'day') savedEnergy = Number(core.serialize().energy);
    });
    expect(core.perform('bench', 'sleep').ok).toBe(true);
    for (let i = 0; i < 12; i++) core.tick(0.25);
    expect(core.data.day).toBe(2);
    expect(savedEnergy).toBe(100);
    expect(core.state.activity).toBeNull();
  });

  it('records bottle sales in the daily income ledger', () => {
    const g = newGame(7);
    g.bottles = 5;
    const core = createCore({ save: g });
    core.setPresence('junkyard');
    expect(core.perform('junkyard', 'sell_bottles').ok).toBe(true);
    expect(core.data.ledger.jobIncome).toBe(5 * BOTTLE_PRICE);
    expect(core.data.bottles).toBe(0);
  });

  it('allows clearing cargo even after every shop is sold', () => {
    const g = newGame(7);
    g.stage = 'parttime';
    g.cargo = { kind: 'stall', units: 12 };
    const core = createCore({ save: g });
    core.setPresence('wholesale');
    expect(core.perform('wholesale', 'discard_cargo').ok).toBe(true);
    expect(core.state.cargo).toBeNull();
    expect(core.state.cash).toBe(0);
  });

  it('normalizes corrupt storage without throwing or overstocking', () => {
    const g = newGame(7);
    const saved = {
      ...g, cash: -50, debt: 10, bottles: 999,
      lots: {
        ...g.lots,
        lot_s1: { owner: 'player', shop: { kind: 'stall', level: 99, stock: 999, name: { toString: null } } },
        lot_h1: { owner: 'player', shop: { kind: 'cafe' } },
      },
      cargo: { kind: 'factory', units: 99 },
      events: [{ id: 'rain', daysLeft: 100 }, { id: 'rain', daysLeft: 100 }],
      task: { id: 'task1', jobId: 'delivery', from: 'job_delivery', target: 'bench', reward: 999, deadline: 600 },
    };
    const restored = restoreGame(saved)!;
    expect(restored.cash).toBe(0);
    expect(restored.debt).toBe(60);
    expect(restored.bottles).toBe(BOTTLE_CAP);
    expect(restored.lots.lot_s1.shop?.level).toBe(SHOP_KINDS.stall.maxLevel);
    expect(restored.lots.lot_s1.shop?.stock).toBe(144);
    expect(restored.lots.lot_h1.owner).toBe('none');
    expect(restored.events).toHaveLength(1);
    expect(restored.cargo).toBeNull();
    expect(restored.task?.reward).toBe(JOBS.delivery.pay);
  });
});
