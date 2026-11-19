import { describe, expect, it } from 'vitest';
import { RtsAi } from '../../src/rts/ai';
import { LEVELS, RESEARCH, TICK, UNITS } from '../../src/rts/config';
import { RtsSim } from '../../src/rts/sim';

const fresh = (): RtsSim => { const s = new RtsSim(); s.record = false; return s; };
const run = (s: RtsSim, ticks: number): void => { for (let i = 0; i < ticks; i++) s.step(); };
/** 사령부 옆 빈 자리에 완성된 건물을 바로 세웁니다. */
function give(s: RtsSim, owner: number, kind: 'barracks' | 'factory') {
  const hq = s.buildings.find(b => b.owner === owner && b.kind === 'hq')!;
  const site = s.findSite(kind, hq.x + 2, hq.y + 2)!; return s.addBuilding(owner, kind, site.x, site.y, true);
}

describe('FRONTLINE 새 유닛: 정찰 지프와 의무병', () => {
  it('의무병은 병영, 지프는 공장에서 뽑고 사전 건물이 필요하다', () => {
    expect(UNITS.medic.from).toBe('barracks'); expect(UNITS.jeep.from).toBe('factory');
    const s = fresh(); s.players[0].minerals = 2000;
    const hq = s.buildings.find(b => b.owner === 0 && b.kind === 'hq')!;
    expect(s.apply(0, { k: 'train', b: hq.id, u: 'medic' })).toBe(false);
    const bar = give(s, 0, 'barracks'); expect(s.apply(0, { k: 'train', b: bar.id, u: 'medic' })).toBe(true);
    expect(s.apply(0, { k: 'train', b: bar.id, u: 'jeep' })).toBe(false);
    const fac = give(s, 0, 'factory'); expect(s.apply(0, { k: 'train', b: fac.id, u: 'jeep' })).toBe(true);
  });
  it('의무병은 다친 아군 보병을 고치지만 전차·지프와 건물은 고치지 않는다', () => {
    const s = fresh(), bar = give(s, 0, 'barracks'), medic = s.spawn(0, 'medic', bar), marine = s.spawn(0, 'marine', bar), tank = s.spawn(0, 'tank', bar);
    for (const u of [medic, marine, tank]) { u.x = 40; u.y = 40; u.o.t = 'idle'; }
    marine.x = 41.5; tank.x = 38.5; marine.hp = 20; tank.hp = 50;
    run(s, 2 * TICK);
    expect(marine.hp).toBeGreaterThan(20 + 8); expect(tank.hp).toBe(50); expect(marine.hp).toBeLessThanOrEqual(UNITS.marine.hp);
    run(s, 10 * TICK); expect(marine.hp).toBe(UNITS.marine.hp);
  });
  it('쉬는 의무병은 가까이 다친 아군을 찾아가 고친다', () => {
    const s = fresh(), bar = give(s, 0, 'barracks'), medic = s.spawn(0, 'medic', bar), marine = s.spawn(0, 'marine', bar);
    medic.x = 30; medic.y = 30; marine.x = 36; marine.y = 30; marine.hp = 10; medic.o.t = 'idle'; marine.o.t = 'idle';
    run(s, 8 * TICK); expect(Math.hypot(medic.x - marine.x, medic.y - marine.y)).toBeLessThan(UNITS.medic.range + 0.1);
    expect(marine.hp).toBeGreaterThan(10);
  });
  it('의무병은 적에게 피해를 주지 못한다', () => {
    const s = fresh(), bar = give(s, 0, 'barracks'), medic = s.spawn(0, 'medic', bar), foe = s.spawn(1, 'marine', bar);
    medic.x = 30; medic.y = 30; foe.x = 31.5; foe.y = 30; foe.o.t = 'idle'; medic.o.t = 'idle'; const hp = foe.hp;
    s.apply(0, { k: 'attack', ids: [medic.id], target: foe.id }); run(s, 3 * TICK);
    expect(foe.hp).toBe(hp);
  });
  it('기동 훈련을 마치면 지프·보병은 빨라지고 일꾼은 그대로다', () => {
    const s = fresh(), fac = give(s, 0, 'factory'); s.players[0].minerals = 999;
    expect(s.apply(0, { k: 'research', b: fac.id, r: 'speed' })).toBe(true); expect(s.players[0].minerals).toBe(999 - RESEARCH.speed.cost);
    const dist = (up: boolean): number => {
      const t = fresh(); t.players[0].up.speed = up; const f = give(t, 0, 'factory'), j = t.spawn(0, 'jeep', f); j.x = 20; j.y = 40; t.apply(0, { k: 'move', ids: [j.id], x: 60, y: 40 }); run(t, 3 * TICK); return j.x - 20;
    };
    expect(dist(true) / dist(false)).toBeGreaterThan(1.1);
    run(s, RESEARCH.speed.time + 2); expect(s.players[0].up.speed).toBe(true);
  });
  it('지프는 보병보다 빠르고 일꾼은 기동 훈련의 영향을 받지 않는다', () => {
    expect(UNITS.jeep.speed).toBeGreaterThan(UNITS.marine.speed * 1.4);
    const walk = (up: boolean): number => {
      const t = fresh(); t.players[0].up.speed = up; const w = t.units.find(u => u.owner === 0 && u.kind === 'worker')!; w.x = 30; w.y = 40; t.apply(0, { k: 'move', ids: [w.id], x: 50, y: 40 }); run(t, TICK); return w.x - 30;
    };
    expect(walk(true)).toBeCloseTo(walk(false), 5);
  });
});

describe('FRONTLINE AI와 새 유닛', () => {
  it('보통 이상 난이도는 지프와 의무병을 섞고, 쉬움은 보병만 쓴다', () => {
    expect(LEVELS.easy.mix.jeep + LEVELS.easy.mix.medic + LEVELS.easy.mix.rocket + LEVELS.easy.mix.tank).toBe(0);
    for (const d of ['normal', 'hard', 'brutal'] as const) { expect(LEVELS[d].mix.jeep).toBeGreaterThan(0); expect(LEVELS[d].mix.medic).toBeGreaterThan(0); }
  });
  it('어려움 AI끼리 10분을 싸우면 공장을 지어 전차·지프와 의무병까지 모두 쓴다', () => {
    const s = new RtsSim({ income: [1, 1] }); s.record = false; const ais = [new RtsAi(0, 'hard'), new RtsAi(1, 'hard')]; const seen = new Set<string>();
    while (s.tick < 10 * 60 * TICK && s.winner === -1) { s.step(); for (const ai of ais) if (s.tick % ai.interval === (ai.me * 3) % ai.interval) ai.think(s); for (const u of s.units) seen.add(u.kind); }
    for (const k of ['marine', 'rocket', 'tank', 'jeep', 'medic']) expect(seen.has(k), k).toBe(true);
  });
  it('동기화 해시에 기동 훈련 여부가 반영된다', () => {
    const a = fresh(), b = fresh(); expect(a.hash()).toBe(b.hash()); b.players[0].up.speed = true; expect(a.hash()).not.toBe(b.hash());
  });
});
