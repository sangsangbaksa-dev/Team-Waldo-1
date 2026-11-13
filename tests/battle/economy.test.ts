import { describe, expect, it } from 'vitest';
import { createWar, getIncome, stepWar, economicVictoryReady, stormStartFor, trainSquad, maxUnitsFor } from '../../src/battle/war';
import {
  createEconomy, population, populationCap, assignWorker, recruitWorker, construct, cancelConstruction,
  dispatchExport, acceptContract, fulfillContract, setTax, storageCap, CONTRACTS, validEconomy,
} from '../../src/battle/economy';
import { decodeWar, encodeWar } from '../../src/battle/save';

function scenario() {
  const w = createWar({ economyCampaign: true });
  w.factions.slice(1).forEach(f => { f.aiTimer = 99999; });
  w.factions[0].gold = 1000; w.factions[0].food = 1000;
  return w;
}
function advance(w: ReturnType<typeof createWar>, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 10); i++) stepWar(w, .1);
}

describe('civil production and city development', () => {
  it('preserves the starting economy and reallocates real production without creating workers', () => {
    const w = scenario(), e = w.economy[0];
    expect(e).toEqual(createEconomy()); expect(population(e)).toBe(12);
    expect(getIncome(w, 0)).toEqual({ gold: 1.5, food: 1.3 });
    expect(assignWorker(w, 0, 'mine', 1)).toBe(false);
    expect(assignWorker(w, 0, 'farm', -1)).toBe(true);
    expect(assignWorker(w, 0, 'mine', 1)).toBe(true);
    expect(getIncome(w, 0).gold).toBeCloseTo(1.75);
    expect(getIncome(w, 0).food).toBeCloseTo(1.3 * 5 / 6);
    expect(population(e)).toBe(12);
    expect(assignWorker(w, 0, 'trade', 1)).toBe(false);
  });

  it('charges for new citizens, adds idle workers, and enforces city capacity', () => {
    const w = scenario(), e = w.economy[0], f = w.factions[0];
    for (let i = 0; i < 6; i++) expect(recruitWorker(w, 0)).toBe(true);
    expect(f.gold).toBe(880); expect(f.food).toBe(820);
    expect(e.workers.idle).toBe(6); expect(population(e)).toBe(populationCap(e));
    expect(recruitWorker(w, 0)).toBe(false);
    const before = f.food; advance(w, 1);
    expect(f.food - before).toBeCloseTo(1.3 - .12 * 6);
  });

  it('finishes construction with elapsed simulation time, not at purchase, and grows supply', () => {
    const w = scenario(), e = w.economy[0], f = w.factions[0];
    expect(construct(w, 0, 'city')).toBe(true);
    expect(f.gold).toBe(860); expect(f.food).toBe(910); expect(e.city).toBe(1);
    expect(construct(w, 0, 'market')).toBe(false);
    advance(w, 24); expect(e.city).toBe(1);
    advance(w, 1); expect(e.city).toBe(2); expect(e.construction).toBeNull();
    expect(populationCap(e)).toBe(24); expect(maxUnitsFor(w)).toBe(24);
    expect(w.stats[0].upgrades).toBe(1);
  });

  it('refunds only 75% on cancellation and never counts refunds as earned income', () => {
    const w = scenario(), f = w.factions[0];
    expect(construct(w, 0, 'market')).toBe(true);
    expect(cancelConstruction(w, 0)).toBe(true);
    expect(f.gold).toBe(972.5); expect(f.food).toBe(985);
    expect(w.stats[0].goldEarned).toBe(0); expect(cancelConstruction(w, 0)).toBe(false);
  });

  it('changes happiness, taxes, and productivity, while famine never makes food negative', () => {
    const low = scenario(), high = scenario();
    recruitWorker(low, 0); recruitWorker(high, 0);
    setTax(low, 0, 'low'); setTax(high, 0, 'high');
    advance(low, 10); advance(high, 10);
    expect(low.economy[0].happiness).toBeGreaterThan(high.economy[0].happiness);
    expect(low.factions[0].gold).toBeLessThan(high.factions[0].gold);
    for (let i = 0; i < 6; i++) assignWorker(high, 0, 'farm', -1);
    high.factions[0].food = 0; const happy = high.economy[0].happiness;
    advance(high, 1);
    expect(high.factions[0].food).toBe(0); expect(high.economy[0].happiness).toBeLessThan(happy);
    expect(high.stats[0].foodEarned).toBeGreaterThanOrEqual(0);
  });

  it('stops production at storage capacity and increases it after warehouse construction', () => {
    const w = scenario(), f = w.factions[0];
    f.gold = 1199.99; f.food = 1199.99; advance(w, 1);
    expect(f.gold).toBe(1200); expect(f.food).toBe(1200);
    construct(w, 0, 'warehouse'); advance(w, 15);
    expect(storageCap(w, 0)).toBe(2200);
    f.gold = 2199.99; advance(w, 1); expect(f.gold).toBe(2200);
  });

  it('extends preparation in the management campaign and preserves the grand battle opening', () => {
    expect(stormStartFor(createWar({ economyCampaign: true }))).toBe(900);
    expect(stormStartFor(createWar({ economyCampaign: true, difficulty: 'easy' }))).toBe(1080);
    expect(stormStartFor(createWar())).toBe(130);
    const w = createWar({ grandBattle: true });
    expect(w.units).toHaveLength(600); expect(storageCap(w, 0)).toBe(10000);
  });
});

describe('exports and delivery contracts', () => {
  it('requires a market and merchant, debits cargo once, then credits income once', () => {
    const w = scenario(), e = w.economy[0], f = w.factions[0];
    expect(dispatchExport(w, 0, 'caravan')).toBe(false);
    construct(w, 0, 'market'); advance(w, 20);
    expect(dispatchExport(w, 0, 'caravan')).toBe(false);
    assignWorker(w, 0, 'farm', -1); assignWorker(w, 0, 'trade', 1);
    const food = f.food; expect(dispatchExport(w, 0, 'caravan')).toBe(true);
    expect(f.food).toBe(food - 40); expect(dispatchExport(w, 0, 'caravan')).toBe(false);
    const production = getIncome(w, 0).gold, gold = f.gold;
    advance(w, 20);
    expect(f.gold - gold).toBeCloseTo(production * 20 + 58);
    expect(e.exports).toBe(1); expect(e.tradeGold).toBe(58); expect(e.shipment).toBeNull();
    advance(w, 1); expect(e.exports).toBe(1);
  });

  it('pauses overseas transport after losing its strategic port and resumes without losing cargo', () => {
    const w = scenario(), e = w.economy[0]; e.city = 2; e.market = 1;
    expect(construct(w, 0, 'port')).toBe(true); advance(w, 30);
    assignWorker(w, 0, 'mine', -1); assignWorker(w, 0, 'trade', 1);
    expect(dispatchExport(w, 0, 'overseas')).toBe(false);
    w.outposts[3].owner = 0; expect(dispatchExport(w, 0, 'overseas')).toBe(true);
    advance(w, 5); const remaining = e.shipment!.remaining;
    w.outposts[3].owner = null; advance(w, 10);
    expect(e.shipment!.remaining).toBe(remaining);
    w.outposts[8].owner = 0; advance(w, 30);
    expect(e.shipment).toBeNull(); expect(e.exports).toBe(1);
  });

  it('returns escrow on successful delivery, consumes goods, and enforces contract cooldowns', () => {
    const w = scenario(), e = w.economy[0], f = w.factions[0]; e.market = 1;
    expect(acceptContract(w, 0, 'provisions')).toBe(true);
    expect(f.gold).toBe(980); expect(acceptContract(w, 0, 'bullion')).toBe(false);
    expect(fulfillContract(w, 0)).toBe(true);
    expect(f.food).toBe(880); expect(f.gold).toBe(1200); // excess 10 gold is limited by storage
    expect(e.completed).toBe(1); expect(e.reputation).toBe(60); expect(e.tradeGold).toBe(200);
    expect(fulfillContract(w, 0)).toBe(false); expect(acceptContract(w, 0, 'provisions')).toBe(false);
    advance(w, 120.1); expect(acceptContract(w, 0, 'provisions')).toBe(true);
  });

  it('expires contracts at the deadline, forfeits the escrow, and penalizes reputation once', () => {
    const w = scenario(), e = w.economy[0]; e.market = 1;
    acceptContract(w, 0, 'provisions'); w.factions[0].food = 0;
    advance(w, 75.1);
    expect(e.contract).toBeNull(); expect(e.failed).toBe(1); expect(e.reputation).toBe(40);
    expect(e.tradeGold).toBe(0); expect(fulfillContract(w, 0)).toBe(false);
    advance(w, 10); expect(e.failed).toBe(1);
  });

  it('rejects invalid and unaffordable commands without mutating the world', () => {
    const w = scenario(); w.factions[0].gold = 0; w.factions[0].food = 0;
    const before = encodeWar(w);
    expect(construct(w, 0, '__proto__' as never)).toBe(false);
    expect(construct(w, 0, 'market')).toBe(false);
    expect(construct(w, 99, 'market')).toBe(false);
    expect(assignWorker(w, 0, 'mine', Infinity)).toBe(false);
    expect(setTax(w, 0, 'constructor' as never)).toBe(false);
    expect(acceptContract(w, 0, 'invalid' as never)).toBe(false);
    expect(dispatchExport(w, 0, 'invalid' as never)).toBe(false);
    expect(recruitWorker(w, 0)).toBe(false); expect(encodeWar(w)).toBe(before);
    w.over = true; expect(construct(w, 0, 'city')).toBe(false);
  });
});

describe('economic saves and victory', () => {
  it('resumes a construction, shipment and active contract at the exact saved progress', () => {
    const w = scenario(), e = w.economy[0]; e.market = 1;
    assignWorker(w, 0, 'mine', -1); assignWorker(w, 0, 'trade', 1);
    construct(w, 0, 'city'); dispatchExport(w, 0, 'caravan'); acceptContract(w, 0, 'provisions');
    advance(w, 5);
    const restored = decodeWar(encodeWar(w)); expect(restored).toEqual(w);
    advance(w, 20); advance(restored!, 20); expect(restored).toEqual(w);
  });

  it('migrates old v2 saves without changing resources, armies or campaign rules', () => {
    const w = createWar(), old = JSON.parse(encodeWar(w)); old.version = 2;
    delete old.war.economy; delete old.war.economyCampaign;
    const restored = decodeWar(JSON.stringify(old));
    expect(restored?.economy).toEqual(Array.from({ length: 4 }, createEconomy));
    expect(restored?.factions).toEqual(w.factions); expect(restored?.units).toEqual(w.units);
    expect(stormStartFor(restored!)).toBe(130);
  });

  it('rejects missing or inconsistent civil data, forged shipments and impossible build queues', () => {
    const mutations = [
      (e: ReturnType<typeof createEconomy>) => { e.workers.mine = 100; },
      (e: ReturnType<typeof createEconomy>) => { e.workers.mine = 0; },
      (e: ReturnType<typeof createEconomy>) => { e.port = 1; },
      (e: ReturnType<typeof createEconomy>) => { e.happiness = NaN; },
      (e: ReturnType<typeof createEconomy>) => { e.market = 1; e.shipment = { route: 'caravan', remaining: 20, reward: 999, loads: 1 }; },
      (e: ReturnType<typeof createEconomy>) => { e.city = 4; e.construction = { key: 'city', remaining: 10 }; },
      (e: ReturnType<typeof createEconomy>) => { e.construction = { key: 'warehouse', remaining: 100 }; },
      (e: ReturnType<typeof createEconomy>) => { e.contract = { key: 'harvest', deadline: 10 }; },
    ];
    for (const mutate of mutations) {
      const w = scenario(); mutate(w.economy[0]);
      expect(validEconomy(w.economy[0], w.time)).toBe(false); expect(decodeWar(encodeWar(w))).toBeNull();
    }
    const parsed = JSON.parse(encodeWar(scenario())); delete parsed.war.economy;
    expect(decodeWar(JSON.stringify(parsed))).toBeNull();
  });

  it('wins through city growth, fulfilled contracts and territory while rival HQs remain alive', () => {
    const w = scenario(), e = w.economy[0]; e.city = 4; e.market = 1;
    for (let i = 0; i < 3; i++) {
      w.factions[0].gold = 1000; w.factions[0].food = 1000;
      const key = i % 2 ? 'bullion' : 'provisions';
      if (e.availableAt[key] > w.time) advance(w, 120.1);
      expect(acceptContract(w, 0, key)).toBe(true); expect(fulfillContract(w, 0)).toBe(true);
    }
    expect(e.completed).toBe(3); expect(e.reputation).toBe(80);
    expect(economicVictoryReady(w, 0)).toBe(false);
    w.outposts.slice(0, 3).forEach(p => { p.owner = 0; }); stepWar(w, .1);
    expect(w.over).toBe(true); expect(w.winner).toBe(0); expect(w.victory).toBe('economic');
    expect(w.factions.every(f => f.alive)).toBe(true); expect(decodeWar(encodeWar(w))).toEqual(w);
    const previous = encodeWar(w); stepWar(w, .1); expect(encodeWar(w)).toBe(previous);
  });

  it('lets rivals achieve economic victory and validates the upgraded army supply per faction', () => {
    const w = scenario(), e = w.economy[1]; e.city = 4; e.completed = 3; e.reputation = 80;
    w.outposts.slice(0, 3).forEach(p => { p.owner = 1; });
    stepWar(w, .1); expect(w.winner).toBe(1); expect(decodeWar(encodeWar(w))).toEqual(w);
    const army = scenario(); army.economy[0].city = 2;
    army.factions[0].gold = 10000; army.factions[0].food = 10000;
    for (let i = 0; i < 4; i++) expect(trainSquad(army, 0, 'infantry', 5)).toBe(true);
    expect(army.units.filter(u => u.owner === 0)).toHaveLength(4);
    expect(army.recruitment[0].queue.reduce((sum,item)=>sum+item.amount,0)).toBe(20);
    advance(army,80);
    expect(army.units.filter(u => u.owner === 0)).toHaveLength(24);
    expect(trainSquad(army, 0, 'infantry', 1)).toBe(false);
    expect(decodeWar(encodeWar(army))).not.toBeNull();
    army.economy[0].city = 1; expect(decodeWar(encodeWar(army))).toBeNull();
    expect(CONTRACTS.harvest.market).toBe(2);
  });
});
