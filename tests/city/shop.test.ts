import { describe, expect, it } from 'vitest';
import { WEAPONS } from '../../src/city/defs';
import { SHOP, canBuy, purchase } from '../../src/city/shop';
import { World } from '../../src/city/world';

const make = () => new World({ seed: 42, difficulty: 'd4', klass: 'warlord', tutorial: true });
const item = (kind: keyof typeof SHOP, id: string) => SHOP[kind].find(x => x.id === id)!;

describe('LAST CITY shop availability and receipts', () => {
  it('disables ammo packs when every weapon is fully loaded, then refills the magazine', () => {
    const w = make(), f = w.factions[0], ammo = item('store', 'ammo');
    f.cash = 1000;
    for (const s of f.slots) { const d = WEAPONS[s.id]; s.mag = d.mag; s.ammo = d.ammo; }
    expect(canBuy(w, 0, ammo)).toBe(false);
    f.slots[0].mag--;
    expect(canBuy(w, 0, ammo)).toBe(true);
    const store = w.businesses.find(b => b.kind === 'store')!;
    expect(purchase(w, 0, store, 'ammo').ok).toBe(true);
    expect(f.slots[0].mag).toBe(WEAPONS[f.slots[0].id].mag);
    expect(canBuy(w, 0, ammo)).toBe(false);
  });

  it('refills a finite-ammo magazine even when reserve ammo is full', () => {
    const w = make(), f = w.factions[0], ammo = item('store', 'ammo');
    f.cash = 1000;
    f.slots = [{ id: 'rocket', ammo: WEAPONS.rocket.ammo, mag: 0 }];
    expect(canBuy(w, 0, ammo)).toBe(true);
    const store = w.businesses.find(b => b.kind === 'store')!;
    expect(purchase(w, 0, store, 'ammo').ok).toBe(true);
    expect(f.slots[0].mag).toBe(WEAPONS.rocket.mag);
  });

  it('does not offer a second full armor vest or hire above the mercenary cap', () => {
    const w = make(), f = w.factions[0];
    f.cash = 10000; f.armor = 100;
    expect(canBuy(w, 0, item('gunshop', 'armor'))).toBe(false);
    f.armor = 20;
    expect(canBuy(w, 0, item('gunshop', 'armor'))).toBe(true);
    for (let i = 0; i < 7; i++) w.spawnUnit('merc', 0, w.boss(0)!.x + i * 3, w.boss(0)!.y);
    expect(canBuy(w, 0, item('club', 'mercs'))).toBe(false);
  });

  it('reports actual crystals sold when a 50-unit sale consumes a smaller balance', () => {
    const w = make(), f = w.factions[0];
    const bank = w.businesses.find(b => b.kind === 'bank')!;
    f.crystal = 7;
    expect(canBuy(w, 0, item('bank', 'sell:50'))).toBe(true);
    const receipt = purchase(w, 0, bank, 'sell:50');
    expect(receipt.ok).toBe(true);
    expect(receipt.msg).toContain('7개 환전');
    expect(f.crystal).toBe(0);
  });
});
