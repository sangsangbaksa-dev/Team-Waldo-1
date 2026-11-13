import { describe, expect, it } from 'vitest';
import { World } from '../../src/city/world';
import { STEPS, advance, newCounters, newTutState, type TutCtx } from '../../src/city/tutorial';

const run = (w: World, seconds: number): void => { for (let i = 0; i < seconds * 30 && !w.over; i++) { w.step(1 / 30); w.events.length = 0; } };
const make = (): World => new World({ seed: 5, difficulty: 'd4', klass: 'warlord', tutorial: true });

describe('튜토리얼 연습장', () => {
  it('자기장·라이벌 AI·보급 투하를 멈춥니다', () => {
    const w = make(), rival = w.boss(2)!, x = rival.x, y = rival.y, r = w.zone.r, ph = w.zone.phase;
    run(w, 240);
    expect(w.zone.r).toBe(r); expect(w.zone.phase).toBe(ph); expect(w.planes).toHaveLength(0);
    expect(Math.hypot(rival.x - x, rival.y - y)).toBeLessThan(40);
    expect(w.factions.filter(f => f.alive)).toHaveLength(8);
    expect(w.quests.every(q => !q.done)).toBe(true);
  }, 30000);

  it('모든 단계를 순서대로 끝까지 완주할 수 있습니다', () => {
    const w = make(), c = newCounters(), s = newTutState(), b = w.boss(0)!, ctx: TutCtx = { w, c, s, yaw: 0 };
    const step = (name: string): void => { expect(STEPS[s.i]?.title, name).toBeDefined(); };
    // 0 환영 (확인 필요)
    expect(advance(ctx)).toBe(false); c.acked = true; expect(advance(ctx)).toBe(true);
    // 1 이동·시점
    step('move'); c.move = 130; expect(advance(ctx)).toBe(false); c.look = 1.5; expect(advance(ctx)).toBe(true);
    // 2 시점
    c.viewSwitches = 3; expect(advance(ctx)).toBe(true);
    // 3 전투: 적 3명이 생기고, 모두 처치하면 통과
    expect(s.enemies).toHaveLength(3);
    for (const id of s.enemies) { const e = w.byId.get(id)!; expect(w.hostile(0, e.f)).toBe(true); expect(Math.hypot(e.x - b.x, e.y - b.y)).toBeGreaterThan(150); }
    expect(STEPS[s.i].marker!(ctx)).not.toBeNull();
    for (const id of s.enemies) w.killActor(w.byId.get(id)!, 0);
    expect(advance(ctx)).toBe(true);
    // 4 무기 줍기
    const loot = w.loot.find(l => l.id === s.lootId)!; expect(loot.weapon).toBe('rifle');
    b.x = loot.x; b.y = loot.y; w.interact(0); expect(advance(ctx)).toBe(true);
    // 5 사업체 매입
    const biz = w.businesses.find(z => z.id === s.bizId)!; expect(biz.owner).toBe(-1);
    b.x = biz.x; b.y = biz.y; expect(w.interact(0)).toBe(''); expect(advance(ctx)).toBe(true);
    // 6 병영 건설
    const hq = w.hq(0)!; let ok = false; for (let k = 0; k < 400 && !ok; k++) ok = w.build(0, 'barracks', hq.x + 60 + (w.rng() - 0.5) * 380, hq.y + 60 + (w.rng() - 0.5) * 380) === '';
    expect(ok).toBe(true); expect(advance(ctx)).toBe(true);
    // 7 병력 훈련 (병영 완공 후 3명)
    run(w, 16); for (let k = 0; k < 3; k++) expect(w.train(0, 'rifle')).toBe('');
    run(w, 40); expect(advance(ctx)).toBe(true);
    // 8 명령 세 번
    w.order(0, 'follow', b.x, b.y); w.order(0, 'hold', b.x, b.y); w.order(0, 'amove', b.x + 100, b.y); c.orders = 3; expect(advance(ctx)).toBe(true);
    // 9 차량: 탑승 → 250m 이동 → 하차
    const car = w.vehicles.find(v => v.id === s.vehId)!; expect(car.driver).toBe(0);
    b.x = car.x + 30; b.y = car.y; w.toggleVehicle(0); expect(b.inVeh).toBe(car.id); c.vehicleDist = 300; expect(advance(ctx)).toBe(false);
    w.toggleVehicle(0); expect(advance(ctx)).toBe(true);
    // 10 시장
    expect(w.factions[0].crystal).toBeGreaterThanOrEqual(50); expect(w.market(0, true, 50)).toBe(''); c.sells = 1; expect(advance(ctx)).toBe(true);
    // 11 안내 후 종료
    expect(advance(ctx)).toBe(false); c.acked = true; expect(advance(ctx)).toBe(true);
    expect(s.i).toBe(STEPS.length);
  });

  it('모든 단계에 한국어 제목·본문이 있고 안내 표식은 월드 안을 가리킵니다', () => {
    const w = make(), c = newCounters(), s = newTutState(), ctx: TutCtx = { w, c, s, yaw: 1 };
    for (const [i, st] of STEPS.entries()) {
      expect(st.title.length, `step ${i}`).toBeGreaterThan(3); expect(st.body.length).toBeGreaterThan(30);
      s.i = i; st.enter?.(ctx); const m = st.marker?.(ctx);
      if (m) { expect(m.x).toBeGreaterThan(0); expect(m.y).toBeGreaterThan(0); expect(m.x).toBeLessThan(5160); expect(m.y).toBeLessThan(5160); }
    }
  });
});
