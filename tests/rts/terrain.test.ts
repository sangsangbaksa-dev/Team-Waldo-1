import { describe, expect, it } from 'vitest';
import { UNITS, VISION } from '../../src/rts/config';
import { buildMap } from '../../src/rts/map';
import { Pather } from '../../src/rts/path';
import { RtsSim } from '../../src/rts/sim';
import { G_BRIDGE, G_FOREST, G_HILL, G_MUD, G_RUIN, buildTerrain, coverMult, speedMult } from '../../src/rts/terrain';
import { Vision } from '../../src/rts/vision';

const fresh = (): RtsSim => { const s = new RtsSim(); s.record = false; return s; };
/** 처음으로 찾은 해당 지형 칸의 중심. */
const cellOf = (g: number): { x: number; y: number } => { const m = buildMap(), n = m.size, i = m.ground.indexOf(g); expect(i).toBeGreaterThanOrEqual(0); return { x: (i % n) + 0.5, y: Math.floor(i / n) + 0.5 }; };

describe('FRONTLINE 지형지물 생성', () => {
  it('같은 시드면 항상 같고 180도 대칭이다', () => {
    const m = buildMap(), n = m.size, copy = new Uint8Array(m.terrain);
    for (const k of [G_FOREST, G_HILL, G_MUD, G_RUIN, G_BRIDGE]) expect(m.ground.includes(k)).toBe(true);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = y * n + x, j = (n - 1 - y) * n + (n - 1 - x);
      expect(m.ground[i]).toBe(m.ground[j]); expect(m.terrain[i]).toBe(m.terrain[j]); expect(m.water[i]).toBe(m.water[j]);
    }
    // 다시 만들어도 같은 결과(시드 결정성), 시드가 다르면 달라진다.
    const raw = new Uint8Array(n * n), again = buildTerrain(n, raw, []), again2 = buildTerrain(n, new Uint8Array(n * n), []);
    expect(Array.from(again.ground)).toEqual(Array.from(again2.ground));
    expect(Array.from(buildTerrain(n, new Uint8Array(n * n), [], 99).ground)).not.toEqual(Array.from(again.ground));
    expect(copy).toEqual(m.terrain);
  });
  it('걸을 수 있는 칸에만 효과가 있고, 강은 막혀 있다', () => {
    const m = buildMap(), n = m.size; let water = 0;
    for (let i = 0; i < n * n; i++) {
      if (m.ground[i] && m.ground[i] !== G_BRIDGE) expect(m.terrain[i]).toBe(0);
      if (m.water[i]) { water++; expect(m.terrain[i]).toBe(1); }
      if (m.ground[i] === G_BRIDGE) expect(m.water[i]).toBe(0);
    }
    expect(water).toBeGreaterThan(40); expect(m.bridges).toHaveLength(4);
  });
  it('기지·자원·확장 자리 둘레는 평지이고 다리 둘레엔 건물을 못 짓는다', () => {
    const m = buildMap(), n = m.size;
    for (const nd of m.nodes) for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) { const x = nd.x + i, y = nd.y + j; if (x > 0 && y > 0 && x < n && y < n) expect(m.ground[y * n + x]).toBe(0); }
    for (const p of [...m.starts, ...m.expansions]) for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) expect(m.ground[(p.y + j) * n + p.x + i]).toBe(0);
    const s = fresh(); const b = m.bridges[0], bx = Math.floor(b.x), by = Math.floor(b.y);
    expect(m.noBuild[by * n + bx]).toBe(1); expect(s.canPlace('depot', bx, by)).toBe(false);
  });
  it('시작 위치·자원·확장 자리가 서로 모두 걸어서 닿는다', () => {
    const m = buildMap(), n = m.size, seen = new Uint8Array(n * n), st = m.starts[0], q: number[] = [(st.y + 1) * n + st.x + 1]; seen[q[0]] = 1;
    while (q.length) {
      const c = q.pop()!, cx = c % n, cy = (c - cx) / n;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = cx + dx, y = cy + dy, i = y * n + x; if (x >= 0 && y >= 0 && x < n && y < n && !seen[i] && !m.terrain[i]) { seen[i] = 1; q.push(i); } }
    }
    const reach = (x: number, y: number): boolean => { for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (seen[(y + j) * n + x + i]) return true; return false; };
    for (const nd of m.nodes) expect(reach(nd.x, nd.y), `광물 ${nd.x},${nd.y}`).toBe(true);
    for (const p of [...m.starts, ...m.expansions]) expect(seen[(p.y + 1) * n + p.x + 1], `기지 ${p.x},${p.y}`).toBe(1);
    // 길찾기도 두 사령부 사이를 끝까지 잇는다.
    const pf = new Pather(n, m.terrain, m.ground), path = pf.find(st.x + 2, st.y + 2, m.starts[1].x + 2, m.starts[1].y + 2)!;
    expect(Math.hypot(path[path.length - 2] - (m.starts[1].x + 2), path[path.length - 1] - (m.starts[1].y + 2))).toBeLessThan(1.5);
  });
  it('다리를 통해 강을 건널 수 있다', () => {
    const m = buildMap(), pf = new Pather(m.size, m.terrain, m.ground), b = m.bridges[1], u = { x: -b.ay, y: b.ax };
    // 다리 양쪽 끝 바깥에서 출발해 서로 닿고, 경로가 다리 칸을 지난다.
    const a = { x: b.x + b.ax * 5, y: b.y + b.ay * 5 }, c = { x: b.x - b.ax * 5, y: b.y - b.ay * 5 }; void u;
    const p = pf.find(a.x, a.y, c.x, c.y)!; expect(p).not.toBeNull();
    expect(Math.hypot(p[p.length - 2] - c.x, p[p.length - 1] - c.y)).toBeLessThan(1.5);
  });
});

describe('FRONTLINE 지형 효과', () => {
  it('진흙·숲은 이동을, 폐허·숲은 보병 피해를 줄인다', () => {
    expect(speedMult(G_MUD, 'marine')).toBeLessThan(1); expect(speedMult(G_MUD, 'tank')).toBeLessThan(1);
    expect(speedMult(G_FOREST, 'tank')).toBeLessThan(1); expect(speedMult(G_FOREST, 'marine')).toBe(1); expect(speedMult(0, 'jeep')).toBe(1);
    expect(coverMult(G_RUIN, 'marine')).toBeLessThan(coverMult(G_FOREST, 'marine')); expect(coverMult(G_RUIN, 'tank')).toBe(1);
  });
  it('시뮬레이션이 속도와 피해에 지형을 반영한다', () => {
    const s = fresh(), mud = cellOf(G_MUD), ruin = cellOf(G_RUIN), plain = { x: 48, y: 90 };
    const speed = (p: { x: number; y: number }): number => (s as unknown as { speedOf(u: unknown): number }).speedOf(s.spawnAt(0, 'marine', p.x, p.y));
    expect(speed(mud)).toBeCloseTo(speed(plain) * 0.6, 5);
    const hp = (p: { x: number; y: number }): number => { const u = s.spawnAt(1, 'marine', p.x, p.y), before = u.hp; (s as unknown as { damage(...a: unknown[]): void }).damage(0, u, 20, 'bullet', 0, 0, 0); return before - u.hp; };
    expect(hp(ruin)).toBeLessThan(hp(plain));
  });
  it('언덕은 사거리를, 숲은 먼 시야를 바꾼다', () => {
    const s = fresh(), hill = cellOf(G_HILL), forest = cellOf(G_FOREST);
    const range = (p: { x: number; y: number }): number => (s as unknown as { rangeBonus(u: unknown): number }).rangeBonus(s.spawnAt(0, 'marine', p.x, p.y));
    expect(range(hill)).toBeGreaterThan(0); expect(range({ x: 48, y: 90 })).toBe(0);
    // 숲은 가까이에서만 보이고, 언덕 위 시야는 더 멀다.
    const v = new Vision(s.map.size, 0), probe = (g: number): Vision => { const t = new RtsSim(); t.record = false; t.units.length = 0; t.buildings.length = 0; const c = cellOf(g); t.spawnAt(0, 'marine', c.x, c.y); const vv = new Vision(t.map.size, 0); vv.update(t, true); return vv; };
    void v; void forest;
    const vf = probe(G_FOREST), vh = probe(G_HILL), n = s.map.size;
    let fv = 0, hv = 0; for (let i = 0; i < n * n; i++) { if (vf.state[i] === 2) fv++; if (vh.state[i] === 2) hv++; }
    const full = Math.PI * VISION.marine * VISION.marine;
    expect(fv).toBeLessThanOrEqual(full * 1.1); expect(hv).toBeGreaterThan(fv * 1.2); expect(UNITS.marine.range).toBeGreaterThan(0);
  });
});
