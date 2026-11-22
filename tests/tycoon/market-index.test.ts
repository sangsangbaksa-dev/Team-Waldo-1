import { describe, expect, it } from 'vitest';
import { newGame, SPOT_BY_ID, playerShops } from '../../src/tycoon/core/model';
import { newShop } from '../../src/tycoon/core/actions';
import { advanceMinute, shopMinute } from '../../src/tycoon/core/sim';

describe('HUSTLE market competition index', () => {
  it('preserves exact revenue, customer counts, rating and inventory versus isolated shop-minute updates', () => {
    const original = newGame(27);
    original.stage = 'world'; original.cash = 100000; original.minute = 12 * 60;
    for (const id of ['lot_m1','lot_m2','lot_s1','lot_h1']) {
      const spot = SPOT_BY_ID.get(id)!;
      original.lots[id] = { owner: 'player', shop: newShop(original, spot, 'stall', 1, 500) };
      original.lots[id].shop!.stock = 75;
    }
    original.lots.lot_h2 = { owner: 'rival', rivalId: 'daebak', rivalKind: 'stall', rivalLevel: 3 };
    const indexed = structuredClone(original), baseline = structuredClone(original);
    const events: unknown[] = [];
    advanceMinute(indexed, {presence:'lot_m1',asleep:false},e=>{events.push(e);});
    const hour = baseline.minute/60;
    for(const {id,spot,shop} of playerShops(baseline)){
      shopMinute(baseline,id,spot,shop,id==='lot_m1',hour);
    }
    baseline.minute++;
    expect(indexed).toEqual(baseline);
    expect(events).toEqual([]);
  });
  it('stays consistent for competing same-kind shops in a shared district and staff-driven stores', () => {
    const original = newGame(29);
    original.stage = 'world'; original.cash = 15000; original.minute = 10 * 60;
    for (const id of ['lot_m1','lot_m2']) {
      const spot = SPOT_BY_ID.get(id)!;
      original.lots[id] = {owner:'player',shop:newShop(original,spot,'stall',1,500)};
      original.lots[id].shop!.staff.push({id:`st-${id}`, name:'Staff',role:'manager',skill:1});
      original.lots[id].shop!.stock = 0;
    }
    const indexed=structuredClone(original), baseline=structuredClone(original);
    advanceMinute(indexed,{presence:null,asleep:false},()=>undefined);
    for(const {id,spot,shop} of playerShops(baseline)) shopMinute(baseline,id,spot,shop,false,10);
    baseline.minute++;
    expect(indexed).toEqual(baseline);
  });
});
