import { describe, expect, it } from 'vitest';
import { createCore, readTycoonSummary, saveTycoon, loadTycoon, TYCOON_SAVE_KEY } from '../../src/tycoon/core';
import { ENERGY_MAX, OWNER_SERVE_PER_MIN } from '../../src/tycoon/core/data';
import { readTycoonPosition } from '../../src/tycoon/core/save';

class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.get(k) ?? null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

function playedCore() {
  const core = createCore({ seed: 21 });
  Object.assign(core.data, { stage: 'parttime', cash: 3000, minute: 10 * 60 });
  core.setPresence('lot_m1');
  core.perform('lot_m1', 'build_stall');
  for (let i = 0; i < 20; i++) core.tick(0.25);
  core.perform('lot_m1', 'hire_clerk');
  for (let i = 0; i < 400; i++) core.tick(0.25);
  return core;
}

describe('타이쿤 저장', () => {
  it('serialize → createCore 로 되살리면 같은 판이다', () => {
    const core = playedCore();
    const save = core.serialize();
    const again = createCore({ save: JSON.parse(JSON.stringify(save)) });
    expect(again.serialize()).toEqual(save);
    expect(again.state.owned[0].staff).toHaveLength(1);
  });

  it('허브 카드는 최상위 cash/stage/day 만으로 요약을 읽는다', () => {
    const core = playedCore();
    const storage = new MemStorage() as unknown as Storage;
    expect(readTycoonSummary(storage).has).toBe(false);
    expect(saveTycoon(core, storage)).toBe(true);
    const raw = JSON.parse(storage.getItem(TYCOON_SAVE_KEY)!);
    expect(raw).toMatchObject({ v: 1, stage: 'smallshop', day: 1 });
    expect(typeof raw.cash).toBe('number');
    const sum = readTycoonSummary(storage);
    expect(sum).toMatchObject({ has: true, stage: 'smallshop', day: 1 });
    expect(createCore({ save: loadTycoon(storage) }).state.owned).toHaveLength(1);
  });

  it('깨진 저장은 새 게임으로, 범위를 벗어난 값은 잘라낸다', () => {
    expect(createCore({ save: 'garbage' }).state.stage).toBe('broke');
    expect(createCore({ save: { v: 2 } }).state.cash).toBe(0);
    const core = playedCore();
    const save = core.serialize() as Record<string, unknown>;
    const lots = save.lots as Record<string, Record<string, unknown>>;
    (lots.lot_m1.shop as Record<string, unknown>).level = 99;
    (lots.lot_m1.shop as Record<string, unknown>).priceMult = 50;
    save.energy = 9999;
    save.stage = 'emperor';
    const g = createCore({ save });
    expect(g.state.owned[0].level).toBe(2);
    expect(g.state.owned[0].priceMult).toBe(2);
    expect(g.state.energy).toBe(100);
    expect(g.state.stage).toBe('broke');
  });

  it('잘못된 업종과 이벤트 및 결산 수치를 정리한다', () => {
    const save = playedCore().serialize() as Record<string, unknown>;
    const lots = save.lots as Record<string, Record<string, unknown>>;
    (lots.lot_m1.shop as Record<string, unknown>).kind = 'constructor';
    save.lastReport = { day: 1, revenue: '<img src=x>', profit: -20, customers: null };
    save.events = [{ id: 'unknown', daysLeft: 2 }];
    const g = createCore({ save });
    expect(g.state.owned).toHaveLength(0);
    expect(g.state.events).toHaveLength(0);
    expect(g.state.lastReport).toMatchObject({ day: 1, revenue: 0, profit: -20, customers: 0 });
  });

  it('영구 능력치 업그레이드는 없다: 알 수 없는 필드는 버리고 에너지 최대치는 고정이다', () => {
    const core = playedCore();
    const save = { ...core.serialize(), perks: { energy: 5 }, skills: { charm: 3 }, maxEnergy: 200, upgrades: ['speed'] };
    const g = createCore({ save });
    const out = g.serialize() as Record<string, unknown>;
    for (const k of ['perks', 'skills', 'maxEnergy', 'upgrades']) expect(out).not.toHaveProperty(k);
    g.data.energy = 0;
    g.data.cash = 1e6;
    g.setPresence('snack');
    for (let i = 0; i < 5; i++) { g.perform('snack', 'eat_feast'); for (let j = 0; j < 40; j++) g.tick(0.1); }
    expect(g.state.energy).toBe(ENERGY_MAX);
    expect(OWNER_SERVE_PER_MIN).toBeGreaterThan(0);
    // 어떤 스폿의 어떤 행동도 플레이어 자신을 강화하지 않는다
    const ids = g.spots().flatMap(s => g.actionsAt(s.id).map(a => `${a.id} ${a.label}`)).join('\n');
    expect(ids).not.toMatch(/upgrade|perk|skill|업그레이드|능력치/i);
  });
  it('탑승 중 저장은 차량 위치만 복원하며 경제 데이터는 그대로 유지한다', () => {
    const core = createCore({ seed: 9 });
    const storage = new MemStorage() as unknown as Storage;
    const position = {
      x: 20, z: -30, facing: 0, yaw: -1.57, pitch: 0.3, distance: 9, firstPerson: false,
      ride: { name: '시티 세단', x: 20, z: -30, heading: 0 },
    };
    expect(saveTycoon(core, storage, position)).toBe(true);
    const raw = loadTycoon(storage);
    expect(readTycoonPosition(raw)).toMatchObject(position);
    expect(createCore({ save: raw }).serialize()).toEqual(core.serialize());
  });

  it('손상되거나 유효하지 않은 차량 저장 상태는 무시한다', () => {
    const core = createCore({ seed: 9 });
    const base = { ...core.serialize(), position: { x: 0, z: 0, facing: 0, yaw: 0, pitch: 0.28, distance: 7.5, firstPerson: false } };
    expect(readTycoonPosition(base)?.ride).toBeUndefined();
    expect(readTycoonPosition({ ...base, position: { ...base.position, ride: { name: '시티 세단', x: 'invalid', z: 0, heading: 0 } } })?.ride).toBeNull();
    expect(readTycoonPosition({ ...base, position: { ...base.position, ride: { name: '시티 세단', x: 12, z: 15, heading: 999 } } })?.ride?.heading).toBeLessThanOrEqual(Math.PI * 2);
  });

});
