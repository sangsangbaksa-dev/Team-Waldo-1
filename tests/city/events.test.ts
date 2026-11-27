import { describe, expect, it } from 'vitest';
import { World } from '../../src/city/world';
import { quickEventBonus, startEvent, relayProgress, RELAY_TIME, updateCityEvents } from '../../src/city/events';

function run(seed: number, until: (w: World) => boolean, max = 30 * 1200): World {
  const w = new World({ seed, difficulty: 'd3', klass: 'warlord', autoPlayer: true });
  for (let i = 0; i < max && !until(w); i++) { w.step(1 / 30); w.events.length = 0; }
  return w;
}

describe('도시 사건', () => {
  it('거점 확보는 보스가 지상에 있고 적이 없을 때만 진행된다', () => {
    expect(relayProgress(4, true, false)).toBe(5);
    expect(relayProgress(4, true, true)).toBe(3);
    expect(relayProgress(4, false, false)).toBe(3);
    expect(relayProgress(0, false, true)).toBe(0);
    expect(relayProgress(RELAY_TIME, true, false)).toBe(RELAY_TIME);
  });
  it('거점 확보 보상은 한 번만 지급된다', () => {
    const w = new World({ seed: 2, difficulty: 'd3', klass: 'warlord' });
    const b = w.boss(0)!;
    w.event = { kind: 'relay', x: b.x, y: b.y, t: 50, total: 120, prog: RELAY_TIME - 1, stage: 0, ids: [], vid: 0, tx: 0, ty: 0, pay: 520 };
    for (const a of w.actors) if (w.hostile(0, a.f)) a.alive = false;
    const before = w.factions[0].cash;
    updateCityEvents(w);
    expect(w.event).toBeNull();
    expect(w.eventsDone).toBe(1);
    expect(w.factions[0].cash).toBeGreaterThan(before);
    const after = w.factions[0].cash;
    updateCityEvents(w);
    expect(w.factions[0].cash).toBe(after);
  });
  it('남은 시간이 많을수록 신속 보상이 커지고 범위를 넘지 않는다', () => {
    expect(quickEventBonus(0, 100)).toBe(0);
    expect(quickEventBonus(50, 100)).toBe(100);
    expect(quickEventBonus(120, 100)).toBe(200);
    expect(quickEventBonus(5, 0)).toBe(0);
  });
  it('시작 후 일정 시간 안에 사건이 생긴다', () => {
    const w = run(1, x => !!x.event);
    expect(w.event).not.toBeNull();
  });
  it('수송차를 격파하면 현금 전리품이 떨어진다', () => {
    const w = new World({ seed: 1, difficulty: 'd3', klass: 'warlord' }), pb = w.boss(0)!;
    for (let k = 0; k < 20 && !w.event; k++) startEvent(w, 'convoy', pb.x, pb.y);
    expect(w.event?.kind).toBe('convoy');
    const before = w.loot.filter(l => l.type === 'cash').length;
    const v = w.vehicles.find(q => q.id === w.event!.vid)!; v.hp = -1;
    for (let i = 0; i < 40; i++) { w.step(1 / 30); w.events.length = 0; }
    expect(w.eventsDone).toBe(1);
    expect(w.loot.filter(l => l.type === 'cash').length).toBeGreaterThan(before);
  });
  it('연습·결투에서는 사건이 없다', () => {
    const w = new World({ seed: 1, difficulty: 'd3', klass: 'warlord', tutorial: true });
    for (let i = 0; i < 30 * 120; i++) { w.step(1 / 30); w.events.length = 0; }
    expect(w.event).toBeNull();
  });
});
