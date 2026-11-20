import { describe, expect, it } from 'vitest';
import { PLAYER, makeRng } from '../../src/shooter/config';
import { circleHits, generateMap, slideMove, type Box } from '../../src/shooter/world';

const SEEDS = [1, 2, 3, 4, 5, 7, 11, 13];
const rectOverlap = (a: { x0: number; z0: number; x1: number; z1: number }, b: { x0: number; z0: number; x1: number; z1: number }, pad = 0): boolean => a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.z0 < b.z1 + pad && a.z1 > b.z0 - pad;

describe('ZERO ZONE 지형과 건물 겹침', () => {
  it('구릉·절벽·숲·호수는 건물 발자국과 겹치지 않는다', () => {
    for (const mode of ['br', 'duel'] as const) for (const seed of SEEDS) {
      const m = generateMap(seed, mode), t = m.terrain;
      const terrainRects = [...t.hills.map(h => ({ x0: h.x - h.r, x1: h.x + h.r, z0: h.z - h.r, z1: h.z + h.r })), ...t.cliffs];
      for (const b of m.buildings) {
        const f = { x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 };
        for (const r of terrainRects) expect(rectOverlap(f, r, 1)).toBe(false);
        for (const fo of t.forests) { const dx = Math.max(f.x0 - fo.x, 0, fo.x - f.x1), dz = Math.max(f.z0 - fo.z, 0, fo.z - f.z1); expect(Math.hypot(dx, dz)).toBeGreaterThan(fo.r); }
        for (const p of t.ponds) expect(Math.hypot(b.x - p.x, b.z - p.z)).toBeGreaterThan(Math.max(p.rx, p.rz) + Math.max(b.w, b.d) / 2);
      }
    }
  });
  it('지형 충돌 상자는 건물 벽·상자와 겹치지 않는다', () => {
    for (const mode of ['br', 'duel'] as const) for (const seed of SEEDS) {
      const m = generateMap(seed, mode), t = m.terrain, terrainBoxes: Box[] = [];
      for (const h of t.hills) for (const bx of m.boxes) if (bx.kind === 'rock' && bx.y1 === h.h && Math.abs((bx.x0 + bx.x1) / 2 - h.x) < 1e-6 && Math.abs((bx.z0 + bx.z1) / 2 - h.z) < 1e-6) terrainBoxes.push(bx);
      for (const c of t.cliffs) for (const bx of m.boxes) if (bx.kind === 'rock' && bx.x0 === c.x0 && bx.z1 === c.z1) terrainBoxes.push(bx);
      expect(terrainBoxes.length).toBeGreaterThanOrEqual(t.hills.length * 3 + t.cliffs.length);
      const tset = new Set(terrainBoxes), others = m.boxes.filter(bx => !tset.has(bx) && bx.kind !== 'trunk');
      let overlaps = 0; for (const tb of terrainBoxes) for (const bx of others) if (rectOverlap(tb, bx, 0)) overlaps++;
      expect(overlaps).toBe(0);
    }
  }, 30000);
});

describe('ZERO ZONE 벽 충돌', () => {
  it('아무 데서나 전속력으로 뛰어도 몸이 막히는 상자 속으로 들어가지 않는다', () => {
    const rng = makeRng(5);
    for (const mode of ['br', 'duel'] as const) for (const seed of [1, 2, 3]) {
      const m = generateMap(seed, mode), H = m.half - 1;
      for (let n = 0; n < 150; n++) {
        const p = { x: (rng() * 2 - 1) * H, z: (rng() * 2 - 1) * H }; let ang = rng() * 6.28; slideMove(m, p, 0, 0, PLAYER.radius); if (circleHits(m, p.x, p.z, PLAYER.radius)) continue; // 상자에 완전히 갇힌 무작위 출발점은 건너뜁니다
        for (let i = 0; i < 300; i++) {
          if (i % 40 === 0) ang += (rng() - 0.5) * 3;
          // 프레임 지연(0.05초)까지 시험합니다
          slideMove(m, p, Math.cos(ang) * PLAYER.sprint * (i % 7 === 0 ? 0.05 : 1 / 60), Math.sin(ang) * PLAYER.sprint * (i % 7 === 0 ? 0.05 : 1 / 60), PLAYER.radius);
          expect(circleHits(m, p.x, p.z, PLAYER.radius)).toBe(false);
        }
      }
    }
  });
  it('건물 벽을 정면으로 들이받아도 건물 안으로 새지 않는다', () => {
    const m = generateMap(2, 'br');
    for (const b of m.buildings.slice(0, 40)) {
      const walls = m.boxes.filter(w => w.kind === 'wall' && w.y0 === 0 && w.x0 >= b.x - b.w / 2 - 0.3 && w.x1 <= b.x + b.w / 2 + 0.3 && w.z0 >= b.z - b.d / 2 - 0.3 && w.z1 <= b.z + b.d / 2 + 0.3);
      for (const w of walls) {
        const cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2, out = Math.hypot(cx - b.x, cz - b.z) > 0 ? { x: Math.sign(cx - b.x) || 0, z: Math.sign(cz - b.z) || 0 } : { x: 1, z: 0 };
        const horizontal = w.x1 - w.x0 > w.z1 - w.z0, nx = horizontal ? 0 : out.x, nz = horizontal ? out.z : 0, p = { x: cx + nx * 2.5, z: cz + nz * 2.5 };
        if (circleHits(m, p.x, p.z, PLAYER.radius)) continue;
        for (let i = 0; i < 120; i++) slideMove(m, p, -nx * PLAYER.sprint * 0.05, -nz * PLAYER.sprint * 0.05, PLAYER.radius);
        expect(rectOverlap({ x0: p.x - 0.1, x1: p.x + 0.1, z0: p.z - 0.1, z1: p.z + 0.1 }, w)).toBe(false);
      }
    }
  });
});
