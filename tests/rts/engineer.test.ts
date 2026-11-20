import { describe, expect, it } from 'vitest';
import { BUILDINGS, TICK, UNITS } from '../../src/rts/config';
import { RtsSim } from '../../src/rts/sim';

const fresh = (): RtsSim => { const s = new RtsSim(); s.record = false; return s; };
const run = (s: RtsSim, ticks: number): void => { for (let i = 0; i < ticks; i++) s.step(); };
function give(s: RtsSim, owner: number, kind: 'barracks' | 'factory') {
  const hq = s.buildings.find(b => b.owner === owner && b.kind === 'hq')!;
  const site = s.findSite(kind, hq.x + 2, hq.y + 2)!; return s.addBuilding(owner, kind, site.x, site.y, true);
}

describe('FRONTLINE 공병', () => {
  it('공장에서만 뽑는다', () => {
    expect(UNITS.engineer.from).toBe('factory'); expect(BUILDINGS.factory.trains).toContain('engineer');
    const s = fresh(); s.players[0].minerals = 2000; const bar = give(s, 0, 'barracks');
    expect(s.apply(0, { k: 'train', b: bar.id, u: 'engineer' })).toBe(false);
    const fac = give(s, 0, 'factory'); expect(s.apply(0, { k: 'train', b: fac.id, u: 'engineer' })).toBe(true);
  });
  it('다친 아군 전차를 광물 없이 고치지만 보병은 고치지 않는다', () => {
    const s = fresh(), bar = give(s, 0, 'barracks'), eng = s.spawn(0, 'engineer', bar), tank = s.spawn(0, 'tank', bar), marine = s.spawn(0, 'marine', bar);
    for (const u of [eng, tank, marine]) { u.x = 40; u.y = 40; u.o.t = 'idle'; }
    tank.x = 41.5; marine.x = 38.5; tank.hp = 60; marine.hp = 20; const minerals = s.players[0].minerals;
    run(s, 2 * TICK);
    expect(tank.hp).toBeGreaterThan(60 + 15); expect(marine.hp).toBe(20); expect(s.players[0].minerals).toBe(minerals);
    run(s, 12 * TICK); expect(tank.hp).toBe(UNITS.tank.hp);
  });
  it('완성된 아군 건물은 고치고, 짓는 중인 건물과 적 건물은 고치지 않는다', () => {
    const s = fresh(), fac = give(s, 0, 'factory'), eng = s.spawn(0, 'engineer', fac);
    const hq = s.buildings.find(b => b.owner === 1 && b.kind === 'hq')!;
    fac.hp = fac.maxhp * 0.5; hq.hp = hq.maxhp * 0.5; const foe = hq.hp;
    const a = s.approach(fac, eng.x, eng.y); eng.x = a.x; eng.y = a.y; eng.o.t = 'idle';
    run(s, 3 * TICK); expect(fac.hp).toBeGreaterThan(fac.maxhp * 0.5 + 40); expect(hq.hp).toBe(foe);
  });
  it('쉬는 공병은 멀리 다친 아군 전차를 찾아가 고친다', () => {
    const s = fresh(), bar = give(s, 0, 'barracks'), eng = s.spawn(0, 'engineer', bar), tank = s.spawn(0, 'tank', bar);
    eng.x = 30; eng.y = 30; tank.x = 37; tank.y = 30; tank.hp = 40; eng.o.t = 'idle'; tank.o.t = 'idle';
    run(s, 10 * TICK); expect(Math.hypot(eng.x - tank.x, eng.y - tank.y)).toBeLessThan(UNITS.engineer.range + 1.3); expect(tank.hp).toBeGreaterThan(40);
  });
});
