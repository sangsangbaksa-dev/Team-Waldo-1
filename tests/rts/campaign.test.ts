import { describe, expect, it } from 'vitest';
import { Campaign, MISSIONS, readCampaign, recordResult, unlocked, writeCampaign } from '../../src/rts/campaign';
import { ABILITIES, STIM_COST, TICK, UNITS } from '../../src/rts/config';
import { RtsSim } from '../../src/rts/sim';
import { FOG_HIDDEN, FOG_SEEN, FOG_VISIBLE, Vision } from '../../src/rts/vision';

const fresh = (): RtsSim => { const s = new RtsSim({ scripted: true }); s.record = false; return s; };
const run = (s: RtsSim, ticks: number, c?: Campaign): void => { for (let i = 0; i < ticks; i++) { s.step(); c?.tick(); } };
const mission = (id: number): { s: RtsSim; c: Campaign } => { const s = fresh(), c = new Campaign(MISSIONS.find(m => m.id === id)!, s); return { s, c }; };

describe('유닛 특수 능력', () => {
  it('보병 자극제는 체력을 쓰는 대신 더 빨리 움직이고 쿨다운이 돈다', () => {
    const a = fresh(), b = fresh(), ua = a.spawnAt(0, 'marine', 30, 40), ub = b.spawnAt(0, 'marine', 30, 40);
    expect(b.apply(0, { k: 'ability', ids: [ub.id] })).toBe(true);
    expect(ub.hp).toBe(UNITS.marine.hp - STIM_COST);
    for (const [s, u] of [[a, ua], [b, ub]] as const) s.apply(0, { k: 'move', ids: [u.id], x: 60, y: 40 });
    run(a, 60); run(b, 60);
    expect(ub.x - 30).toBeGreaterThan((ua.x - 30) * 1.2);
    expect(b.apply(0, { k: 'ability', ids: [ub.id] })).toBe(false); // 쿨다운
    run(b, ABILITIES.marine!.cd);
    expect(b.apply(0, { k: 'ability', ids: [ub.id] })).toBe(true);
  });
  it('체력이 너무 낮은 보병은 자극제를 쓰지 못한다', () => {
    const s = fresh(), u = s.spawnAt(0, 'marine', 30, 40); u.hp = STIM_COST;
    expect(s.apply(0, { k: 'ability', ids: [u.id] })).toBe(false); expect(u.hp).toBe(STIM_COST);
  });
  it('전차 포격 태세는 움직이지 못하는 대신 더 멀리 쏜다', () => {
    const duel = (siege: boolean): { hp: number; moved: number } => {
      const s = fresh(), t = s.spawnAt(0, 'tank', 30, 40), e = s.spawnAt(1, 'marine', 30 + UNITS.tank.range + 1.6, 40); e.hp = 500;
      if (siege) s.apply(0, { k: 'ability', ids: [t.id] }); run(s, 40); return { hp: e.hp, moved: t.x - 30 };
    };
    expect(duel(false).moved).toBeGreaterThan(0.5); // 기본 사거리 밖이라 다가가야 쏨
    const sg = duel(true); expect(sg.moved).toBeLessThan(0.01); expect(sg.hp).toBeLessThan(500); // 제자리에서 맞춤
    const s = fresh(), t = s.spawnAt(0, 'tank', 30, 40); s.apply(0, { k: 'ability', ids: [t.id] }); s.apply(0, { k: 'move', ids: [t.id], x: 30, y: 60 }); run(s, 40);
    expect(t.y).toBeCloseTo(40, 1);
  });
  it('지프 질주는 이동 속도를 올리고, 의무병 응급 처치는 주변 보병을 한꺼번에 고친다', () => {
    const a = fresh(), b = fresh(), ja = a.spawnAt(0, 'jeep', 20, 40), jb = b.spawnAt(0, 'jeep', 20, 40);
    b.apply(0, { k: 'ability', ids: [jb.id] }); a.apply(0, { k: 'move', ids: [ja.id], x: 70, y: 40 }); b.apply(0, { k: 'move', ids: [jb.id], x: 70, y: 40 });
    run(a, 40); run(b, 40); expect(jb.x - 20).toBeGreaterThan((ja.x - 20) * 1.5);
    const s = fresh(), m = s.spawnAt(0, 'medic', 40, 40), hurt = [0, 1, 2].map(i => { const u = s.spawnAt(0, 'marine', 41 + i * 0.5, 41); u.hp = 10; return u; }), far = s.spawnAt(0, 'marine', 60, 60); far.hp = 10;
    s.apply(0, { k: 'ability', ids: [m.id] });
    for (const u of hurt) expect(u.hp).toBeGreaterThanOrEqual(10 + UNITS.marine.hp * 0.4 - 0.01); expect(far.hp).toBe(10);
  });
  it('능력이 없는 유닛과 남의 유닛에는 명령이 통하지 않는다', () => {
    const s = fresh(), w = s.spawnAt(0, 'worker', 30, 40), e = s.spawnAt(1, 'marine', 50, 40);
    expect(s.apply(0, { k: 'ability', ids: [w.id] })).toBe(false); expect(s.apply(0, { k: 'ability', ids: [e.id] })).toBe(false);
  });
});

describe('전장의 안개', () => {
  it('시야 안은 보이고, 지나간 곳은 탐색한 곳으로 남고, 먼 곳은 가려져 있다', () => {
    const s = fresh(), v = new Vision(s.map.size, 0); v.update(s, true);
    const hq = s.buildings.find(b => b.owner === 0 && b.kind === 'hq')!;
    expect(v.at(hq.x + 2, hq.y + 2)).toBe(FOG_VISIBLE); expect(v.at(80, 20)).toBe(FOG_HIDDEN);
    const u = s.spawnAt(0, 'jeep', 40, 40); v.update(s, true); expect(v.visible(40, 40)).toBe(true);
    u.x = 60; u.y = 60; v.update(s, true); expect(v.at(40, 40)).toBe(FOG_SEEN); expect(v.explored(40, 40)).toBe(true); expect(v.visible(40, 40)).toBe(false);
  });
  it('갱신 간격 안에서는 다시 계산하지 않는다', () => {
    const s = fresh(), v = new Vision(s.map.size, 0); expect(v.update(s, true)).toBe(true); expect(v.update(s)).toBe(false); run(s, 4); expect(v.update(s)).toBe(true);
  });
});

describe('캠페인 미션', () => {
  it('모든 미션이 만들어지고 지점·도착지·대상이 길 위에 있다', () => {
    for (const m of MISSIONS) {
      const { s, c } = mission(m.id); expect(c.objectives.length).toBeGreaterThan(0); expect(m.brief.length).toBeGreaterThan(0);
      for (const p of c.points) expect(s.pather.freeAt(p.x, p.y)).toBe(true);
      for (const w of c.waves) expect(s.pather.nearestFree(w.from.x, w.from.y)).not.toBeNull();
      expect(s.players[0].used).toBeLessThanOrEqual(s.players[0].cap); // 시작 병력이 인구 한도 안
    }
    expect(mission(4).c.targetsTotal()).toBe(3);
  });
  it('1: 세 거점을 점령해 10초 지키면 승리하고, 적이 들어오면 게이지가 줄어든다', () => {
    const { s, c } = mission(1), pts = c.points;
    const go = (): void => { for (const [i, u] of s.units.filter(x => x.owner === 0 && x.kind === 'marine').entries()) { const p = pts[i % 3]; u.x = p.x; u.y = p.y; } };
    go(); run(s, 8 * TICK, c); expect(pts.every(p => p.owner === 0)).toBe(true); expect(c.result).toBeNull();
    const foe = s.spawnAt(1, 'marine', pts[0].x + 1, pts[0].y); for (const u of s.units.filter(x => x.owner === 0 && x.kind === 'marine')) { u.x = 20; u.y = 70; }
    foe.hp = 9999; run(s, 12 * TICK, c); expect(pts[0].owner).toBe(-1); expect(pts[0].progress).toBeLessThan(50);
    s.units = s.units.filter(u => u !== foe); s.index.delete(foe.id); go(); run(s, 25 * TICK, c);
    expect(c.result).toBe('win'); expect(s.winner).toBe(0); expect(c.stars()).toBeGreaterThanOrEqual(2);
  });
  it('2: 공세가 시간에 맞춰 나타나 경고를 보내고, 사령부가 무너지면 패배한다', () => {
    const { s, c } = mission(2); run(s, 45 * TICK, c);
    expect(c.events.some(e => e.t === 'wave')).toBe(true); expect(c.waves[0].spawned).toBe(false); run(s, 6 * TICK, c);
    expect(c.waves[0].spawned).toBe(true); expect(c.alive(c.waves[0].ids)).toBe(6);
    expect(s.units.filter(u => u.owner === 1 && u.o.t === 'amove')).toHaveLength(6);
    c.hq!.hp = 0; run(s, 10, c); expect(c.result).toBe('lose'); expect(s.winner).toBe(1);
  });
  it('2: 모든 공세를 없애면 승리한다', () => {
    const { s, c } = mission(2);
    for (let i = 0; i < 40 * 20 * TICK && !c.result; i++) { s.step(); c.tick(); for (const u of s.units) if (u.owner === 1 && u.kind !== 'worker') u.hp = 0; }
    expect(c.result).toBe('win');
  });
  it('3: 호위가 없으면 전차가 서 있고, 호위가 붙으면 경로를 따라 도착하며 전차가 죽으면 패배한다', () => {
    const { s, c } = mission(3), v = c.vipUnit()!; expect(v.hp).toBe(300); expect(c.maxHp(v)).toBe(300);
    for (const u of s.units.filter(x => x.owner === 0 && x.kind !== 'worker' && x.id !== v.id)) { u.x = 5; u.y = 90; } run(s, 10 * TICK, c);
    const y0 = v.y; run(s, 6 * TICK, c); expect(v.y).toBeCloseTo(y0, 0);
    // 호위를 전차 가까이에 붙이고 매복은 없앤 채 끝까지 보냅니다.
    for (let i = 0; i < 6 * 60 * TICK && !c.result; i++) {
      s.step(); c.tick(); for (const u of s.units) if (u.owner === 1 && u.kind !== 'worker') u.hp = 0;
      if (i % 10 === 0) for (const u of s.units.filter(x => x.owner === 0 && x.kind === 'marine').slice(0, 3)) { u.x = v.x + 1; u.y = v.y + 1; }
    }
    expect(c.result).toBe('win'); expect(c.objectives.find(o => o.id === 'vip')!.done).toBe(true);
    const r = mission(3); r.c.vipUnit()!.hp = 0; run(r.s, 10, r.c); expect(r.c.result).toBe('lose');
  });
  it('4: 표시된 거점을 모두 부수면 승리한다', () => {
    const { s, c } = mission(4); expect(c.targetsLeft()).toBe(3);
    for (const b of s.buildings.filter(x => x.owner === 1 && x.kind === 'barracks' && x.x < 78 && c.markerList().some(m => m.kind === 'target' && Math.abs(m.x - (x.x + x.size / 2)) < 0.01))) b.hp = 0;
    run(s, 10, c); expect(c.targetsLeft()).toBe(0); expect(c.result).toBe('win');
  });
  it('5: 중앙 통신소를 20초 점령하면 증원군이 오고, 적 건물을 모두 부수면 승리한다', () => {
    const { s, c } = mission(5), before = s.units.filter(u => u.owner === 0).length, p = c.points[0];
    for (let i = 0; i < 40 * TICK && !c.flag.called; i++) { for (const u of s.units.filter(x => x.owner === 0 && x.kind === 'marine')) { u.x = p.x; u.y = p.y; } s.step(); c.tick(); }
    expect(c.flag.called).toBe(1); expect(s.units.filter(u => u.owner === 0).length).toBe(before + 12); expect(c.objectives.find(o => o.id === 'relay')!.done).toBe(true);
    for (const b of s.buildings.filter(x => x.owner === 1)) b.hp = 0; run(s, 10, c); expect(c.result).toBe('win');
  });
  it('6: 창고를 하나 부술 때마다 적 증원이 나오고, 네 곳을 모두 부수면 승리하며, 시간이 지나면 패배한다', () => {
    const { s, c } = mission(6); expect(c.targetsTotal()).toBe(4); const foes = (): number => s.units.filter(u => u.owner === 1 && u.kind !== 'worker').length, f0 = foes();
    const ids = c.markerList().filter(m => m.kind === 'target');
    const burn = (n: number): void => { let k = 0; for (const b of s.buildings.filter(x => x.owner === 1 && x.kind === 'depot')) if (k++ < n) b.hp = 0; };
    burn(1); run(s, 10, c); expect(c.targetsLeft()).toBe(3); expect(foes()).toBeGreaterThan(f0); expect(c.events.some(e => e.t === 'wave')).toBe(true);
    const f1 = foes(); run(s, 10, c); expect(foes()).toBe(f1); // 같은 창고로 두 번 나오지 않음
    burn(4); run(s, 10, c); expect(ids).toHaveLength(4); expect(c.targetsLeft()).toBe(0); expect(c.result).toBe('win'); expect(c.objectives.find(o => o.id === 'lean')!.done).toBe(true);
    const t = mission(6); run(t.s, 10 * 60 * TICK + 20, t.c); expect(t.c.result).toBe('lose');
  });
  it('항복하거나 모든 건물을 잃으면 패배한다', () => {
    const a = mission(1); a.s.apply(0, { k: 'surrender' }); run(a.s, 10, a.c); expect(a.c.result).toBe('lose'); expect(a.c.stars()).toBe(0);
    const b = mission(1); for (const x of b.s.buildings.filter(y => y.owner === 0)) x.hp = 0; run(b.s, 10, b.c); expect(b.c.result).toBe('lose');
  });
});

describe('캠페인 저장', () => {
  it('별과 최단 시간은 더 좋은 값만 남기고, 앞 미션을 깨야 다음이 열린다', () => {
    let save = readCampaign(); expect(unlocked(save, 1)).toBe(true); expect(unlocked(save, 2)).toBe(false);
    save = recordResult(save, 1, 2, 300); save = recordResult(save, 1, 1, 400); expect(save.stars[1]).toBe(2); expect(save.best[1]).toBe(300);
    expect(unlocked(save, 2)).toBe(true); expect(unlocked(save, 3)).toBe(false);
    save = recordResult(save, 1, 3, 250); expect(save.stars[1]).toBe(3); expect(save.best[1]).toBe(250);
  });
  it('저장소가 비었거나 망가져도 기본값으로 읽는다', () => {
    const store = new Map<string, string>(); const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    (globalThis as unknown as { localStorage: typeof ls }).localStorage = ls;
    expect(readCampaign()).toEqual({ stars: {}, best: {} });
    store.set('waldo.rts.campaign.v1', '{broken'); expect(readCampaign()).toEqual({ stars: {}, best: {} });
    store.set('waldo.rts.campaign.v1', JSON.stringify({ stars: { 1: 9, 2: 2, x: 'a' }, best: { 2: -4, 3: 120 } })); expect(readCampaign()).toEqual({ stars: { 2: 2 }, best: { 3: 120 } });
    writeCampaign({ stars: { 1: 3 }, best: { 1: 99 } }); expect(readCampaign().stars[1]).toBe(3);
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
  });
});
