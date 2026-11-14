import { describe, expect, it } from 'vitest';
import { World } from '../../src/city/world';
import { findPath, generateCity, makeRng, navBlocked } from '../../src/city/map';
import { BIZ, FACTION_COUNT, SIZE, STRUCTS, UNITS } from '../../src/city/defs';

const make = (seed = 7): World => new World({ seed, difficulty: 'd4', klass: 'tycoon' });
const run = (w: World, seconds: number): void => { for (let i = 0; i < seconds * 30 && !w.over; i++) { w.step(1 / 30); w.events.length = 0; } };

describe('LAST CITY map', () => {
  it('generates the same playable city for the same seed', () => {
    const a = generateCity(makeRng(42)), b = generateCity(makeRng(42));
    expect(a.solids.length).toBe(b.solids.length); expect(a.biz).toEqual(b.biz);
    expect(a.bases).toHaveLength(FACTION_COUNT); expect(a.biz.filter(z => z.kind === 'bank')).toHaveLength(1);
    expect(a.biz.length).toBeGreaterThan(30); expect(a.biz.some(z => z.kind === 'gunshop')).toBe(true);
    for (const z of a.biz) expect(navBlocked(a, z.x, z.y)).toBe(false);
  });
  it('connects every base to the central bank by foot', () => {
    const m = generateCity(makeRng(3)), bank = m.biz.find(z => z.kind === 'bank')!;
    for (const base of m.bases) { const path = findPath(m, base.x, base.y + 100, bank.x, bank.y); expect(path && path.length).toBeTruthy(); }
  });
});

describe('LAST CITY rules', () => {
  it('starts eight kingdoms with a boss, an HQ and workers that mine crystal', () => {
    const w = make(); expect(w.factions).toHaveLength(8);
    for (const f of w.factions) { expect(w.boss(f.id)).not.toBeNull(); expect(w.hq(f.id)).not.toBeNull(); }
    const before = w.factions[0].crystal; run(w, 30); expect(w.factions[0].crystal).toBeGreaterThan(before);
  });
  it('turns a purchased business into steady income and lets it be upgraded', () => {
    const w = make(), f = w.factions[0], shop = w.businesses.find(z => z.kind === 'store')!;
    f.cash = 5000; expect(w.buyBiz(0, shop)).toBe(''); expect(shop.owner).toBe(0);
    expect(w.buyBiz(0, shop)).not.toBe('');
    w.everySecond(); expect(f.income).toBeGreaterThan(BIZ.store.income);
    const cash = f.cash; expect(w.upgradeBiz(0, shop)).toBe(''); expect(shop.level).toBe(2); expect(f.cash).toBeLessThan(cash);
  });
  it('builds a barracks near the HQ and trains riflemen within the supply cap', () => {
    const w = make(), f = w.factions[0], hq = w.hq(0)!; f.crystal = 2000;
    expect(w.train(0, 'rifle')).toContain('병영');
    let placed = false; for (let k = 0; k < 400 && !placed; k++) placed = w.build(0, 'barracks', hq.x + 60 + (w.rng() - 0.5) * 380, hq.y + 60 + (w.rng() - 0.5) * 380) === '';
    expect(placed).toBe(true); expect(w.build(0, 'barracks', SIZE / 2, SIZE / 2)).not.toBe('');
    run(w, STRUCTS.barracks.time + 1); expect(w.train(0, 'rifle')).toBe('');
    run(w, UNITS.rifle.time + 1); expect(w.actors.some(a => a.alive && a.f === 0 && a.kind === 'rifle')).toBe(true);
    for (let k = 0; k < 40; k++) w.train(0, 'rifle');
    expect(f.supply).toBeLessThanOrEqual(f.supplyMax);
  });
  it('trades crystal on a market whose price moves against large orders', () => {
    const w = make(), f = w.factions[0]; f.crystal = 1000; const p = w.price, cash = f.cash;
    expect(w.market(0, true, 500)).toBe(''); expect(f.cash).toBeGreaterThan(cash); expect(w.price).toBeLessThan(p);
    f.cash = 0; expect(w.market(0, false, 100)).not.toBe('');
  });
  it('rejects invalid trade amounts and sells only whole crystals', () => {
    const w = make(), f = w.factions[0];
    f.cash = 1000; f.crystal = 102.75;
    const before = { cash: f.cash, crystal: f.crystal, price: w.price };
    for (const amount of [-100, -Infinity, 0, 0.9, NaN, Infinity]) {
      expect(w.market(0, true, amount)).not.toBe('');
      expect(w.market(0, false, amount)).not.toBe('');
    }
    expect(f.cash).toBe(before.cash);
    expect(f.crystal).toBe(before.crystal);
    expect(w.price).toBe(before.price);
    expect(w.market(0, true, f.crystal)).toBe('');
    expect(f.crystal).toBeCloseTo(0.75);
  });
  it('never recruits past the nine-mercenary cap or charges for a rejected call', () => {
    const w = make(), f = w.factions[0], boss = w.boss(0)!;
    f.cash = 3000;
    for (let i = 0; i < 8; i++) w.spawnUnit('merc', 0, boss.x + i, boss.y);
    const cash = f.cash;
    expect(w.hireMercs(0)).toContain('최대 9명');
    expect(f.cash).toBe(cash);
    expect(w.actors.filter(a => a.alive && a.f === 0 && a.kind === 'merc')).toHaveLength(8);
  });
  it('does not load more bullets than a limited-ammo pickup owns', () => {
    const w = make(), f = w.factions[0];
    w.giveWeapon(f, 'railgun', 2);
    const rail = f.slots.find(s => s.id === 'railgun')!;
    expect(rail.ammo).toBe(2);
    expect(rail.mag).toBe(2);
    w.giveWeapon(f, 'railgun', 1);
    expect(rail.ammo).toBe(3);
    expect(rail.mag).toBe(3);
  });
  it('does not drop a depleted rare weapon with free ammunition', () => {
    const w = make(), f = w.factions[3], boss = w.boss(3)!;
    w.giveWeapon(f, 'rocket', 2);
    f.slots.find(s => s.id === 'rocket')!.ammo = 0;
    const existing = w.loot.filter(l => l.alive && l.type === 'weapon' && l.weapon === 'rocket').length;
    w.killActor(boss, 0);
    // The world can contain a pre-generated rocket pickup; the death must add none.
    expect(w.loot.filter(l => l.alive && l.type === 'weapon' && l.weapon === 'rocket')).toHaveLength(existing);
  });
  it('lets the boss steal a parked car and drive it', () => {
    const w = make(), b = w.boss(0)!, car = w.vehicles.find(v => !v.driver && v.kind !== 'tank')!;
    b.x = car.x + 30; b.y = car.y; w.toggleVehicle(0); expect(b.inVeh).toBe(car.id);
    const x = car.x, y = car.y; w.input.mx = Math.cos(car.ang); w.input.my = Math.sin(car.ang); run(w, 2);
    expect(Math.hypot(car.x - x, car.y - y)).toBeGreaterThan(40);
    w.toggleVehicle(0); expect(b.inVeh).toBe(0);
  });
  it('eliminates a kingdom only after its HQ falls and its boss dies', () => {
    const w = make(), enemy = w.factions[3], boss = w.boss(3)!;
    w.killActor(boss, -1); w.checkElimination(); expect(enemy.alive).toBe(true); expect(enemy.respawnT).toBeGreaterThan(0);
    w.hurtStruct(w.hq(3)!, 1e6, -1); run(w, 20); expect(enemy.alive).toBe(false); expect(enemy.place).toBe(8);
    expect(w.businesses.some(z => z.owner === 3)).toBe(false);
  });
});

describe('LAST CITY full match', () => {
  it('runs a long match stably with finite state', () => {
    const w = new World({ seed: 11, difficulty: 'd4', klass: 'warlord', autoPlayer: true });
    run(w, 600);
    expect(w.time).toBeGreaterThan(240);
    for (const a of w.actors) expect(Number.isFinite(a.x + a.y + a.hp)).toBe(true);
    if (w.over) { expect(w.winner).toBeGreaterThanOrEqual(0); expect(new Set(w.factions.map(f => f.place)).size).toBe(8); }
  }, 120000);
  it('has no time limit: elapsed time alone never ends the match', () => {
    const w = new World({ seed: 11, difficulty: 'd4', klass: 'warlord', autoPlayer: true });
    w.time = 100000; w.checkElimination();
    expect(w.over).toBe(false);
  });
});

describe('분대 편성', () => {
  it('5개 분대로 나누고 선택한 분대만 명령을 받는다', () => {
    const w = make();
    for (let k = 0; k < 10; k++) w.spawnUnit('rifle', 0, 100 + k * 5, 100);
    w.splitSquads(0, 5);
    for (let i = 1; i <= 5; i++) expect(w.squadMembers(0, i).length).toBeGreaterThanOrEqual(2);
    w.selectSquad(2); w.order(0, 'amove', 900, 900);
    for (const a of w.squadMembers(0, 0)) expect(a.order.type === 'amove').toBe(a.sq === 2);
    w.selectSquad(0); w.splitSquads(0, 1);
    expect(w.squadMembers(0, 0).every(a => a.sq === 0)).toBe(true);
  });
  it('새 병력은 선택한 분대에 들어간다', () => {
    const w = make(); w.selectSquad(3);
    expect(w.spawnUnit('rifle', 0, 50, 50).sq).toBe(3);
  });
});
