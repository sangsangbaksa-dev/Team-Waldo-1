import { describe, expect, it } from 'vitest';
import { ARENA_BOUNDS, ARENA_COUNT, arenaInfo, arenaOf, generateArena } from '../../src/city/arena';
import { BLOCKS, NAV, NAVN, SIZE } from '../../src/city/defs';
import { clearLine, resolveCircle, solidAt } from '../../src/city/map';
import { World } from '../../src/city/world';

const ids = Array.from({ length: ARENA_COUNT }, (_, i) => i);
const make = (side: 0 | 1, arena: number, seed = 11): World => new World({ seed, difficulty: 'd4', klass: 'warlord', tutorial: true, duel: { side, name: '상대', arena } });

describe('LAST CITY 1대1 전용 맵', () => {
  it('맵이 2개 이상이고 시드로 고른 번호는 항상 범위 안이다', () => {
    expect(ARENA_COUNT).toBeGreaterThanOrEqual(2);
    for (const seed of [1, 2, 3, 99, 2 ** 31 - 1]) { expect(arenaOf(seed)).toBeGreaterThanOrEqual(0); expect(arenaOf(seed)).toBeLessThan(ARENA_COUNT); }
    expect(new Set([1, 2, 3, 4].map(arenaOf)).size).toBe(ARENA_COUNT);
    expect(arenaOf(7)).toBe(arenaOf(7));
  });

  for (const id of ids) describe(`${arenaInfo(id).name}`, () => {
    const map = generateArena(id), { x0, y0, x1, y1 } = ARENA_BOUNDS;

    it('같은 번호면 두 클라이언트가 똑같은 맵을 만든다', () => {
      const again = generateArena(id), key = (m: typeof map): unknown => [m.solids.map(s => [s.x, s.y, s.w, s.h, s.height, s.wall]), m.biz, m.loot, m.trees, m.bases];
      expect(key(again)).toEqual(key(map));
    });

    it('모든 건물과 소품은 맵 중심에 대해 점대칭이다', () => {
      const has = (x: number, y: number, w: number, h: number, height: number): boolean => map.solids.some(s => s.x === x && s.y === y && s.w === w && s.h === h && s.height === height);
      for (const s of map.solids) expect(has(SIZE - s.x - s.w, SIZE - s.y - s.h, s.w, s.h, s.height), `solid ${s.x},${s.y}`).toBe(true);
      const lootKey = (l: { x: number; y: number; tier: number }): string => `${l.x},${l.y},${l.tier}`, loot = new Set(map.loot.map(lootKey));
      for (const l of map.loot) expect(loot.has(lootKey({ x: SIZE - l.x, y: SIZE - l.y, tier: l.tier }))).toBe(true);
      expect(map.bases).toHaveLength(2);
      expect(map.bases[0].x + map.bases[1].x).toBe(SIZE); expect(map.bases[0].y + map.bases[1].y).toBe(SIZE);
      expect(map.bases[0].face).toBe(-map.bases[1].face!);
      for (const z of map.biz) { const o = map.biz.find(q => q.kind === z.kind && q.x === SIZE - z.x && q.y === SIZE - z.y); expect(o, `biz ${z.kind}`).toBeTruthy(); }
      expect(map.biz.some(z => z.kind === 'gunshop')).toBe(true);
    });

    it('블록은 9×9 전부 있고 경기장 밖은 void 다', () => {
      expect(map.blocks).toHaveLength(BLOCKS * BLOCKS);
      expect(map.blocks.filter(b => b.type !== 'void')).toHaveLength(9);
      expect(map.blocks.filter(b => b.type === 'base')).toHaveLength(2);
    });

    it('건물끼리 겹치지 않고 모두 경기장(외벽 포함) 안에 있다', () => {
      const T = 140;
      for (const s of map.solids) { expect(s.x).toBeGreaterThanOrEqual(x0 - T); expect(s.y).toBeGreaterThanOrEqual(y0 - T); expect(s.x + s.w).toBeLessThanOrEqual(x1 + T); expect(s.y + s.h).toBeLessThanOrEqual(y1 + T); }
      for (let i = 0; i < map.solids.length; i++) for (let j = i + 1; j < map.solids.length; j++) {
        const a = map.solids[i], b = map.solids[j], hit = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        expect(hit, `solids ${i} and ${j} overlap`).toBe(false);
      }
    });

    it('밖으로 나갈 수 없다: 경기장 둘레는 빈틈없는 벽이다', () => {
      for (let t = x0; t <= x1; t += 10) for (const [px, py] of [[t, y0 - 20], [t, y1 + 20], [x0 - 20, t], [x1 + 20, t]]) expect(solidAt(map, px, py), `${px},${py}`).not.toBeNull();
      const o = { x: x0 + 2, y: y0 + 2 }; resolveCircle(map, o, 13); expect(o.x).toBeGreaterThanOrEqual(x0 - 1);
    });

    it('두 본부는 서로 직접 보이지 않고 적당한 거리에 있다', () => {
      const w = make(0, id), a = w.boss(0)!, b = w.boss(1)!, d = Math.hypot(a.x - b.x, a.y - b.y);
      expect(w.canSee(a.x, a.y, b.x, b.y)).toBe(false);
      expect(d).toBeGreaterThan(800); expect(d).toBeLessThan(1700);
      expect(w.map.solids.some(s => s.alive && !s.struct && a.x > s.x - 13 && a.x < s.x + s.w + 13 && a.y > s.y - 13 && a.y < s.y + s.h + 13)).toBe(false);
    });

    it('두 스폰이 길로 이어지고, 모든 출입문 패드와 전리품에 걸어서 닿을 수 있다', () => {
      const w = make(0, id), seen = new Uint8Array(NAVN * NAVN), a = w.boss(0)!, cell = (x: number, y: number): number => Math.floor(y / NAV) * NAVN + Math.floor(x / NAV);
      const queue = [cell(a.x, a.y)]; seen[queue[0]] = 1;
      for (let q = 0; q < queue.length; q++) { const c = queue[q], cx = c % NAVN, cy = (c / NAVN) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy, n = ny * NAVN + nx; if (nx < 0 || ny < 0 || nx >= NAVN || ny >= NAVN || seen[n] || w.map.nav[n]) continue; seen[n] = 1; queue.push(n); } }
      const b = w.boss(1)!; expect(seen[cell(b.x, b.y)]).toBe(1);
      const near = (x: number, y: number): boolean => { for (let dy = -100; dy <= 100; dy += NAV) for (let dx = -100; dx <= 100; dx += NAV) if (seen[cell(x + dx, y + dy)]) return true; return false; };
      for (const z of w.map.biz) expect(near(z.x, z.y), `${z.kind} pad`).toBe(true);
      for (const l of w.map.loot) { expect(solidAt(w.map, l.x, l.y), `loot ${l.x},${l.y}`).toBeNull(); expect(near(l.x, l.y)).toBe(true); }
    });

    it('가장 긴 무기(레일건 1150)보다 길게 트인 저격 직선은 드물다(전체의 5% 미만)', () => {
      let lanes = 0, total = 0;
      for (let y = y0 + 30; y < y1; y += 60) for (let x = x0 + 30; x < x1; x += 60) {
        if (solidAt(map, x, y)) continue;
        for (let a = 0; a < 8; a++) { const ang = a * Math.PI / 4; let d = 0; while (d < 1800 && !solidAt(map, x + Math.cos(ang) * (d + 40), y + Math.sin(ang) * (d + 40))) d += 40; total++; if (d >= 1150) lanes++; }
      }
      expect(lanes / total).toBeLessThan(0.05);
    });
  });

  it('1대1 세계: 호스트·게스트가 같은 맵에서 서로의 본부를 맞바꿔 시작한다', () => {
    for (const id of ids) {
      const host = make(0, id), guest = make(1, id), at = (w: World, f: number): [number, number] => { const b = w.boss(f)!; return [b.x, b.y]; };
      expect(at(host, 0)).toEqual(at(guest, 1)); expect(at(host, 1)).toEqual(at(guest, 0)); expect(at(host, 0)).not.toEqual(at(host, 1));
      expect(host.loot.map(l => [l.x, l.y, l.type, l.weapon])).toEqual(guest.loot.map(l => [l.x, l.y, l.type, l.weapon]));
      expect(host.map.arena?.name).toBe(arenaInfo(id).name);
      expect(host.vehicles).toHaveLength(0); expect(host.actors.filter(a => a.alive)).toHaveLength(2);
      expect(host.businesses.length).toBe(host.map.biz.length);
    }
  });

  it('두 본부의 스폰 거리·주변 엄폐 조건이 대칭이라 공정하다', () => {
    for (const id of ids) {
      const w = make(0, id), a = w.boss(0)!, b = w.boss(1)!;
      expect(a.x + b.x).toBeCloseTo(SIZE); expect(a.y + b.y).toBeCloseTo(SIZE);
      const ring = (p: { x: number; y: number }): number => { let n = 0; for (let k = 0; k < 16; k++) { const an = k * Math.PI / 8; if (!clearLine(w.map, p.x, p.y, p.x + Math.cos(an) * 260, p.y + Math.sin(an) * 260, true)) n++; } return n; };
      expect(ring(a)).toBe(ring(b));
    }
  });

  it('도시 모드(arena 없음)는 기존 큰 도시를 그대로 쓴다', () => {
    const w = new World({ seed: 11, difficulty: 'd4', klass: 'warlord', tutorial: true, duel: { side: 0, name: '상대' } });
    expect(w.map.arena).toBeUndefined(); expect(w.map.bases).toHaveLength(8); expect(w.map.blocks.some(b => b.type === 'void')).toBe(false);
  });
});
