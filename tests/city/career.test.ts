import { describe, expect, it } from 'vitest';
import { World } from '../../src/city/world';
import { SIDE_MILESTONES, startEvent, streakMult, type CityEventKind } from '../../src/city/events';
import { UPGRADE_COST, UPGRADE_MAX, buyCareer, creditsFor, emptyCareer, nextCost, sanitizeCareer, zeroLevels } from '../../src/city/career';

describe('블랙마켓 보급 (영구 강화)', () => {
  it('크레딧이 모자라면 살 수 없고 충분하면 차감된다', () => {
    expect(buyCareer(emptyCareer(), 'hp')).toBeNull();
    const c = buyCareer({ credits: 200, levels: zeroLevels() }, 'hp')!;
    expect(c.credits).toBe(200 - UPGRADE_COST[0]); expect(c.levels.hp).toBe(1); expect(c.levels.dmg).toBe(0);
  });
  it('최대 단계 이후에는 살 수 없다', () => {
    let c = { credits: 99999, levels: zeroLevels() };
    for (let i = 0; i < UPGRADE_MAX; i++) c = buyCareer(c, 'dmg')!;
    expect(nextCost(c, 'dmg')).toBeNull(); expect(buyCareer(c, 'dmg')).toBeNull();
  });
  it('보상은 순위·난이도·부업 실적에 따라 늘어난다', () => {
    const base = { place: 4, win: false, kills: 5, eventsDone: 0, earned: 1000, difficulty: 'd3' as const };
    expect(creditsFor({ ...base, place: 1, win: true })).toBeGreaterThan(creditsFor(base));
    expect(creditsFor({ ...base, difficulty: 'd5' })).toBeGreaterThan(creditsFor(base));
    expect(creditsFor({ ...base, eventsDone: 6 })).toBeGreaterThan(creditsFor(base));
  });
  it('깨진 저장값은 안전한 상태로 되돌린다', () => {
    expect(sanitizeCareer('x')).toEqual(emptyCareer());
    const c = sanitizeCareer({ credits: -3, levels: { hp: 99, dmg: 'a' } });
    expect(c.credits).toBe(0); expect(c.levels.hp).toBe(UPGRADE_MAX); expect(c.levels.dmg).toBe(0);
  });
  it('강화는 솔로 서바이벌 보스에만 적용된다', () => {
    const lv = { ...zeroLevels(), hp: 3, cash: 2, dmg: 1 };
    const base = new World({ seed: 7, difficulty: 'd3', klass: 'warlord' }), up = new World({ seed: 7, difficulty: 'd3', klass: 'warlord', career: lv });
    expect(up.boss(0)!.maxHp).toBeGreaterThan(base.boss(0)!.maxHp);
    expect(up.factions[0].cash).toBe(base.factions[0].cash + 300); expect(up.factions[0].mods.dmg).toBeCloseTo(base.factions[0].mods.dmg + 0.05);
    expect(up.factions[1].mods.hp).toBe(base.factions[1].mods.hp);
    const tut = new World({ seed: 7, difficulty: 'd3', klass: 'warlord', career: lv, tutorial: true });
    expect(tut.factions[0].cash).toBe(base.factions[0].cash);
  });
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
    w.killActor(w.byId.get(ids[0])!, 0); tick(w, 40);
    expect(w.eventsDone).toBe(1); expect(w.factions[0].cash).toBeGreaterThanOrEqual(cash0 + 500);
    for (const id of ids.slice(1)) expect(w.byId.get(id)).toBeUndefined();
  });
  it('시간을 넘기면 연속 보너스가 초기화된다', () => {
    const w = fresh('rescue'); w.eventStreak = 3; tick(w, 30 * 95);
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
