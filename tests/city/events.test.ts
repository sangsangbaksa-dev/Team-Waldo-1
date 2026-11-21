import { describe, expect, it } from 'vitest';
import { World } from '../../src/city/world';
import { quickEventBonus, startEvent } from '../../src/city/events';

function run(seed: number, until: (w: World) => boolean, max = 30 * 1200): World {
  const w = new World({ seed, difficulty: 'd3', klass: 'warlord', autoPlayer: true });
  for (let i = 0; i < max && !until(w); i++) { w.step(1 / 30); w.events.length = 0; }
  return w;
}

describe('도시 사건', () => {
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
