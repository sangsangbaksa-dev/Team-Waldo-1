import { describe, expect, it } from 'vitest';
import { World } from '../../src/city/world';
import { SIDE_MILESTONES, startEvent, streakMult, updateCityEvents, type CityEventKind } from '../../src/city/events';

it('이전 영구 강화 옵션을 전달해도 시작 능력치와 자금은 동일하다', () => {
  const opts = { seed: 7, difficulty: 'd3', klass: 'warlord' } as const;
  const base = new World(opts), legacy = new World({ ...opts, career: { hp: 3, dmg: 3, speed: 3, income: 3, cash: 3, armor: 3 } } as never);
  expect(legacy.factions[0].mods).toEqual(base.factions[0].mods);
  expect(legacy.factions[0].cash).toBe(base.factions[0].cash);
  expect(legacy.boss(0)!.maxHp).toBe(base.boss(0)!.maxHp);
});

const tick = (w: World, n: number): void => { for (let i = 0; i < n; i++) { w.step(1 / 30); w.events.length = 0; } };
const fresh = (kind: CityEventKind): World => { const w = new World({ seed: 11, difficulty: 'd3', klass: 'warlord' }), b = w.boss(0)!; for (let k = 0; k < 20 && !w.event; k++) startEvent(w, kind, b.x, b.y); return w; };

describe('새 도시 사건', () => {
  it('배달: 수령지 → 목적지에 닿으면 현금을 받는다', () => {
    const w = fresh('delivery'), ev = w.event!, b = w.boss(0)!, cash0 = w.factions[0].cash;
    expect(ev.kind).toBe('delivery');
    b.x = ev.x; b.y = ev.y; tick(w, 40); expect(w.event?.stage).toBe(1);
    b.x = w.event!.tx; b.y = w.event!.ty; tick(w, 40);
    expect(w.eventsDone).toBe(1); expect(w.event).toBeNull(); expect(w.factions[0].cash).toBeGreaterThan(cash0 + 250);
  });
  it('현상금: 우두머리를 쓰러뜨리면 보수를 받고 경호는 사라진다', () => {
    const w = fresh('bounty'), ids = [...w.event!.ids], cash0 = w.factions[0].cash;
    expect(ids).toHaveLength(3);
    const target = w.byId.get(ids[0])!;
    target.x += 30;
    w.hurtActor(target, 1000, 0);
    updateCityEvents(w);
    expect(w.eventsDone).toBe(1); expect(w.factions[0].cash).toBe(cash0 + 700);
    expect(w.loot.some(l => l.x === target.x && l.y === target.y && (l.type === 'armor' || l.type === 'medkit'))).toBe(true);
    for (const id of ids.slice(1)) expect(w.byId.get(id)).toBeUndefined();
  });
  it.each(['rival', 'zone'])('다른 조직이나 자기장이 현상금 목표를 처치하면 보상이 없다 (%s)', source => {
    const w = fresh('bounty'), [targetId, ...guards] = w.event!.ids, cash = w.factions[0].cash;
    const target = w.byId.get(targetId)!;
    const rival = w.factions.find(f => f.id !== 0 && f.id !== target.f)!;
    w.eventStreak = 2;
    w.hurtActor(target, 1000, source === 'rival' ? rival.id : -1);
    updateCityEvents(w);
    expect(w.event).toBeNull();
    expect(w.eventsDone).toBe(0);
    expect(w.eventStreak).toBe(0);
    expect(w.factions[0].cash).toBe(cash);
    for (const id of guards) expect(w.byId.has(id)).toBe(false);
  });
  it('실내에 있으면 구조가 진행되지 않고 밖에 나오면 진행된다', () => {
    const w = fresh('rescue'), b = w.boss(0)!, ev = w.event!;
    b.x = ev.x; b.y = ev.y;
    updateCityEvents(w);
    expect(ev.prog).toBe(1);
    expect(w.enterBiz(0, w.businesses.find(z => z.owner < 0)!)).toBe('');
    for (let i = 0; i < 3; i++) updateCityEvents(w);
    expect(ev.prog).toBe(0);
    expect(w.eventsDone).toBe(0);
    w.exitBiz(0);
    b.x = ev.x; b.y = ev.y;
    for (let i = 0; i < 3; i++) updateCityEvents(w);
    expect(w.eventsDone).toBe(1);
  });
  it('구조할 생존자가 없으면 사건이 실패한다', () => {
    const w = fresh('rescue'), b = w.boss(0)!, ev = w.event!;
    b.x = ev.x; b.y = ev.y;
    updateCityEvents(w);
    updateCityEvents(w);
    for (const id of ev.ids) w.killActor(w.byId.get(id)!, -1);
    updateCityEvents(w);
    expect(w.event).toBeNull();
    expect(w.eventsDone).toBe(0);
  });
  it('시간을 넘기면 연속 보너스가 초기화된다', () => {
    const w = fresh('rescue'); w.eventStreak = 3; w.event!.t = 1;
    updateCityEvents(w);
    expect(w.event).toBeNull(); expect(w.eventStreak).toBe(0); expect(w.eventsDone).toBe(0);
  });
  it('연속 보너스 배율과 이정표 보너스가 지급된다', () => {
    expect(streakMult(0)).toBe(1); expect(streakMult(3)).toBeCloseTo(1.3); expect(streakMult(99)).toBeCloseTo(1.5);
    const w = fresh('rescue'), b = w.boss(0)!, cash0 = w.factions[0].cash;
    w.eventsDone = SIDE_MILESTONES[0].n - 1; w.eventStreak = 1;
    b.x = w.event!.x; b.y = w.event!.y; tick(w, 30 * 6);
    expect(w.eventsDone).toBe(SIDE_MILESTONES[0].n); expect(w.sideClaimed).toBe(1);
    expect(w.factions[0].cash).toBeGreaterThanOrEqual(cash0 + Math.round(350 * 1.1) + SIDE_MILESTONES[0].reward);
  });
});
