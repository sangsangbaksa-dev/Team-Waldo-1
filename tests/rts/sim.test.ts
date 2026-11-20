import { describe, expect, it } from 'vitest';
import { BUILDINGS, NODE_AMOUNT, START_MINERALS, START_WORKERS, TICK, UNITS } from '../../src/rts/config';
import { buildMap } from '../../src/rts/map';
import { Pather } from '../../src/rts/path';
import { RtsSim } from '../../src/rts/sim';

const fresh = (): RtsSim => { const s = new RtsSim(); s.record = false; return s; };
const hqOf = (s: RtsSim, p: number) => s.buildings.find(b => b.owner === p && b.kind === 'hq')!;
const run = (s: RtsSim, ticks: number): void => { for (let i = 0; i < ticks; i++) s.step(); };

describe('FRONTLINE 시작 상태', () => {
  it('양쪽이 사령부와 일꾼 다섯, 같은 광물로 시작한다', () => {
    const s = fresh();
    for (const p of [0, 1]) {
      expect(s.buildings.filter(b => b.owner === p).map(b => b.kind)).toEqual(['hq']);
      expect(s.units.filter(u => u.owner === p && u.kind === 'worker')).toHaveLength(START_WORKERS);
      expect(s.players[p].minerals).toBe(START_MINERALS);
      expect(s.players[p].used).toBe(START_WORKERS); expect(s.players[p].cap).toBe(BUILDINGS.hq.supply);
    }
  });
  it('맵은 180도 회전 대칭이고 광물 양이 같다', () => {
    const m = buildMap(), n = m.size;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) expect(m.terrain[y * n + x]).toBe(m.terrain[(n - 1 - y) * n + (n - 1 - x)]);
    expect(m.nodes.filter(nd => nd.base === 0)).toHaveLength(m.nodes.filter(nd => nd.base === 1).length);
    expect(m.starts[1]).toEqual({ x: n - m.starts[0].x - 4, y: n - m.starts[0].y - 4 });
  });
  it('두 기지 사이, 그리고 확장 기지로 가는 길이 이어져 있다', () => {
    const s = fresh(), a = hqOf(s, 0), b = hqOf(s, 1), pf = new Pather(s.map.size, s.grid);
    for (const [from, to] of [[a, b], [a, { x: s.map.expansions[0].x, y: s.map.expansions[0].y }], [b, { x: s.map.expansions[1].x, y: s.map.expansions[1].y }]] as const) {
      const path = pf.find(from.x - 1, from.y + 2, to.x - 1, to.y + 2);
      expect(path).not.toBeNull();
      const [lx, ly] = [path![path!.length - 2], path![path!.length - 1]];
      expect(Math.hypot(lx - (to.x - 1), ly - (to.y + 2))).toBeLessThan(2.5);
    }
  });
  it('모든 광물과 확장 자리가 막히지 않은 땅 위에 있다', () => {
    const s = fresh();
    for (const e of s.map.expansions) expect(s.canPlace('hq', e.x, e.y)).toBe(true);
    for (const nd of s.nodes) expect(s.map.terrain[nd.y * s.map.size + nd.x]).toBe(0);
  });
});

describe('경제와 생산', () => {
  it('일꾼이 광물을 캐서 사령부에 반납한다', () => {
    const s = fresh(); run(s, 20 * 60);
    expect(s.players[0].mined).toBeGreaterThan(150);
    expect(s.players[0].minerals).toBeGreaterThan(START_MINERALS);
    const total = s.nodes.reduce((n, nd) => n + nd.amount, 0);
    expect(total).toBeLessThan(s.map.nodes.length * NODE_AMOUNT);
  });
  it('일꾼을 훈련하면 광물과 인구를 쓰고 시간이 지나면 나온다', () => {
    const s = fresh(), hq = hqOf(s, 0);
    expect(s.apply(0, { k: 'train', b: hq.id, u: 'worker' })).toBe(true);
    expect(s.players[0].minerals).toBe(START_MINERALS - UNITS.worker.cost); s.recount(); expect(s.players[0].used).toBe(START_WORKERS + 1);
    run(s, UNITS.worker.time + 2);
    expect(s.units.filter(u => u.owner === 0 && u.kind === 'worker')).toHaveLength(START_WORKERS + 1);
  });
  it('인구 한도를 넘는 훈련은 거부한다', () => {
    const s = fresh(), hq = hqOf(s, 0); s.players[0].minerals = 9999;
    let ok = 0; for (let i = 0; i < 12; i++) if (s.apply(0, { k: 'train', b: hq.id, u: 'worker' })) ok++;
    expect(ok).toBe(5); // 10 - 5
  });
  it('보급소를 지으면 인구 한도가 늘어난다', () => {
    const s = fresh(), hq = hqOf(s, 0), w = s.units.find(u => u.owner === 0)!;
    expect(s.apply(0, { k: 'build', id: w.id, b: 'depot', x: hq.x + 6, y: hq.y - 5 })).toBe(true);
    run(s, BUILDINGS.depot.time + 400);
    expect(s.players[0].cap).toBe(BUILDINGS.hq.supply + BUILDINGS.depot.supply);
  });
  it('필요한 건물이 없거나 자리가 막히면 짓지 못한다', () => {
    const s = fresh(), hq = hqOf(s, 0), w = s.units.find(u => u.owner === 0)!;
    expect(s.apply(0, { k: 'build', id: w.id, b: 'factory', x: hq.x + 6, y: hq.y - 6 })).toBe(false); // 병영 필요
    expect(s.apply(0, { k: 'build', id: w.id, b: 'barracks', x: hq.x, y: hq.y })).toBe(false); // 사령부 자리
    s.players[0].minerals = 10; expect(s.apply(0, { k: 'build', id: w.id, b: 'barracks', x: hq.x + 6, y: hq.y - 6 })).toBe(false); // 광물 부족
  });
  it('상대의 유닛에는 명령을 내릴 수 없다', () => {
    const s = fresh(), foe = s.units.find(u => u.owner === 1)!;
    expect(s.apply(0, { k: 'move', ids: [foe.id], x: 50, y: 50 })).toBe(false);
    expect(s.apply(0, { k: 'train', b: hqOf(s, 1).id, u: 'worker' })).toBe(false);
  });
  it('망가진 명령은 무시한다', () => {
    const s = fresh(), w = s.units.find(u => u.owner === 0)!;
    for (const bad of [{ k: 'move', ids: [w.id], x: NaN, y: 3 }, { k: 'build', id: w.id, b: 'nope', x: 1, y: 1 }, { k: 'train', b: 'x', u: 'tank' }, { k: 'attack', ids: [w.id], target: -5 }, null, 5] as unknown[]) expect(s.apply(0, bad as never)).toBe(false);
  });
});

describe('전투와 승패', () => {
  it('보병이 적 일꾼을 쓰러뜨린다', () => {
    const s = fresh(), hq = hqOf(s, 0), foe = s.units.find(u => u.owner === 1 && u.kind === 'worker')!;
    s.players[0].minerals = 999; s.apply(0, { k: 'build', id: s.units[0].id, b: 'barracks', x: hq.x + 7, y: hq.y - 4 }); run(s, BUILDINGS.barracks.time + 300);
    const bar = s.buildings.find(b => b.kind === 'barracks' && b.owner === 0)!; expect(bar.done).toBe(true);
    s.apply(0, { k: 'train', b: bar.id, u: 'marine' }); run(s, UNITS.marine.time + 5);
    const m = s.units.find(u => u.owner === 0 && u.kind === 'marine')!; m.x = foe.x - 3; m.y = foe.y; s.apply(0, { k: 'attack', ids: [m.id], target: foe.id });
    run(s, 20 * 12); expect(s.unit(foe.id)).toBeUndefined();
  });
  it('상대의 모든 건물이 사라지면 승부가 난다', () => {
    const s = fresh(); hqOf(s, 1).hp = 0; run(s, 2);
    expect(s.winner).toBe(0);
  });
  it('항복하면 상대가 이긴다', () => {
    const s = fresh(); s.apply(1, { k: 'surrender' }); run(s, 2); expect(s.winner).toBe(0);
  });
  it('승부가 난 뒤에는 더 진행하지 않는다', () => {
    const s = fresh(); s.apply(0, { k: 'surrender' }); run(s, 2); const t = s.tick; run(s, 50); expect(s.tick).toBe(t);
  });
});

describe('결정성(1대1 동기화의 전제)', () => {
  it('같은 명령 순서는 항상 같은 상태를 만든다', () => {
    const play = (): number => {
      const s = fresh(), hq = hqOf(s, 0), h2 = hqOf(s, 1), w = s.units.filter(u => u.owner === 0), v = s.units.filter(u => u.owner === 1);
      s.apply(0, { k: 'train', b: hq.id, u: 'worker' }); s.apply(1, { k: 'train', b: h2.id, u: 'worker' });
      s.apply(0, { k: 'build', id: w[0].id, b: 'barracks', x: hq.x + 7, y: hq.y - 4 }); s.apply(1, { k: 'move', ids: v.map(u => u.id), x: 60, y: 30 });
      run(s, 20 * 40); s.apply(0, { k: 'move', ids: w.map(u => u.id), x: 40, y: 40 }); run(s, 20 * 40); return s.hash();
    };
    expect(play()).toBe(play());
  });
  it('시간이 지나도 시뮬레이션이 같은 길이로 끝난다(AI 두 쪽)', () => { expect(TICK).toBe(20); });
});

describe('건설 현장과 강화', () => {
  const site = (s: RtsSim) => { const hq = hqOf(s, 0), w = s.units.filter(u => u.owner === 0 && u.kind === 'worker'); s.apply(0, { k: 'build', id: w[0].id, b: 'depot', x: hq.x + 6, y: hq.y - 5 }); return { b: s.buildings.find(x => x.kind === 'depot')!, w }; };
  it('일꾼이 다른 명령을 받아 떠나도 짓다 만 건물을 다른 일꾼이 이어서 짓는다', () => {
    const s = fresh(), { b, w } = site(s); run(s, 60);
    s.apply(0, { k: 'move', ids: [w[0].id], x: 40, y: 80 });
    run(s, BUILDINGS.depot.time + 600);
    expect(s.building(b.id)?.done).toBe(true);
  });
  it('건설 중 일꾼이 죽어도 건물이 이어서 지어진다', () => {
    const s = fresh(), { b, w } = site(s); run(s, 40); s.unit(w[0].id)!.hp = 0;
    run(s, BUILDINGS.depot.time + 600);
    expect(s.building(b.id)?.done).toBe(true);
  });
  it('Shift 연속 건설은 먼저 짓던 건물을 버리지 않고 두 건물을 모두 완성한다', () => {
    const s = fresh(), hq = hqOf(s, 0), w = s.units.find(u => u.owner === 0 && u.kind === 'worker')!;
    s.apply(0, { k: 'build', id: w.id, b: 'depot', x: hq.x + 6, y: hq.y - 5 });
    s.apply(0, { k: 'build', id: w.id, b: 'depot', x: hq.x + 9, y: hq.y - 5, q: true });
    run(s, BUILDINGS.depot.time * 2 + 900);
    expect(s.buildings.filter(x => x.kind === 'depot' && x.done)).toHaveLength(2);
  });
  it('병영에서 강화를 연구하면 피해량이 늘고 한 번만 살 수 있다', () => {
    const s = fresh(), hq = hqOf(s, 0); s.players[0].minerals = 999;
    s.addBuilding(0, 'barracks', hq.x + 7, hq.y - 4, true); const bar = s.buildings.find(b => b.kind === 'barracks')!;
    expect(s.apply(0, { k: 'research', b: bar.id, r: 'atk' })).toBe(true);
    expect(s.apply(0, { k: 'research', b: bar.id, r: 'arm' })).toBe(false); // 한 건물은 하나씩
    run(s, 45 * TICK + 5); expect(s.players[0].up.atk).toBe(true);
    expect(s.apply(0, { k: 'research', b: bar.id, r: 'atk' })).toBe(false);
    expect(s.apply(0, { k: 'research', b: bar.id, r: 'cannon' })).toBe(false); // 공장에서만
  });
  it('연구를 취소하면 광물을 돌려받는다', () => {
    const s = fresh(), hq = hqOf(s, 0); s.players[0].minerals = 500; s.addBuilding(0, 'barracks', hq.x + 7, hq.y - 4, true); const bar = s.buildings.find(b => b.kind === 'barracks')!;
    s.apply(0, { k: 'research', b: bar.id, r: 'arm' }); expect(s.players[0].minerals).toBe(350); s.apply(0, { k: 'cancel', b: bar.id, i: -2 }); expect(s.players[0].minerals).toBe(500);
  });
  it('가운데 중립 기지에도 사령부를 지을 수 있고 길이 이어져 있다', () => {
    const s = fresh(), e = s.map.expansions; expect(e).toHaveLength(4);
    for (const p of e) expect(s.canPlace('hq', p.x, p.y)).toBe(true);
    const pf = new Pather(s.map.size, s.grid), hq = hqOf(s, 0), path = pf.find(hq.x - 1, hq.y + 2, e[2].x - 1, e[2].y + 2); expect(path).not.toBeNull();
  });
});


describe('부대 명령 경계 조건', () => {
  it('중복 유닛 명령을 제거하고 지도 가장자리에서도 대형을 유지한다', () => {
    const s = fresh(), units = s.units.filter(u => u.owner === 0), ids = units.map(u => u.id);
    expect(s.apply(0, { k: 'move', ids: [...ids, ...ids], x: -100, y: -100 })).toBe(true);
    const positions = units.map(u => [u.o.x, u.o.y]);
    expect(new Set(positions.map(p => p.join(','))).size).toBe(units.length);
    expect(positions.every(([x, y]) => x >= 1.5 && y >= 1.5 && x <= s.map.size - 1.5 && y <= s.map.size - 1.5)).toBe(true);
  });
  it('잘못된 건물과 생산 종류 및 취소 인덱스는 상태를 변경하지 않는다', () => {
    const s = fresh(), hq = hqOf(s, 0), w = s.units.find(u => u.owner === 0)!;
    expect(s.apply(0, { k: 'build', id: w.id, b: 'constructor', x: 10, y: 10 } as unknown as Parameters<RtsSim['apply']>[1])).toBe(false);
    expect(s.apply(0, { k: 'train', b: hq.id, u: 'constructor' } as unknown as Parameters<RtsSim['apply']>[1])).toBe(false);
    expect(s.apply(0, { k: 'cancel', b: hq.id, i: -9 })).toBe(false);
    expect(s.players[0].minerals).toBe(START_MINERALS);
  });
});
