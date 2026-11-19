// TYCOON — 도시 배치(순수 계산). 7×7 구획 격자, 구획마다 2×2 필지. 단계가 오를수록 바깥 구획이 열리고 시내가 자랍니다.
import { stageIndex, type SpotDef, type StageId } from '../bridge';

export const GRID = 7, PITCH = 48, BLOCK = 36, ROAD = 12, LOT = 14, LOT_OFF = 8, WALK_EDGE = 16.5, HALF = 3;
/** 도시 전체의 반 너비(바깥 도로 바깥 끝까지). */
export const WORLD_HALF = HALF * PITCH + BLOCK / 2 + ROAD;
export const START = { i: -3, j: 3 };
/** 단계별로 열리는 구획 반경(시작 구획에서의 체비셰프 거리). */
export const RING_FOR_STAGE = [1, 2, 3, 4, 5, 6, 6] as const;

export interface Block { i: number; j: number; cx: number; cz: number; ring: number; lots: Lot[] }
export interface Lot {
  id: number; block: Block; sx: 1 | -1; sz: 1 | -1; cx: number; cz: number;
  /** 정면 방향(길 쪽) */ fx: 0 | 1 | -1; fz: 0 | 1 | -1;
  /** 출입구 앞 보도 위 지점 */ doorX: number; doorZ: number;
  kind: 'building' | 'park'; seed: number; spot?: SpotDef;
}
export interface Layout { blocks: Block[]; lots: Lot[]; spotLots: Map<string, Lot>; spawn: { x: number; z: number; yaw: number } }

/** 문자열/정수 → 0~1 (결정적) */
export function hash01(a: number | string, b = 0): number {
  let h = 2166136261 ^ b;
  const s = String(a);
  for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
export const blockCenter = (i: number): number => i * PITCH;
export const ringOf = (i: number, j: number): number => Math.max(Math.abs(i - START.i), Math.abs(j - START.j));
export const blockUnlocked = (b: Block, stage: StageId | number): boolean => b.ring <= RING_FOR_STAGE[typeof stage === 'number' ? stage : stageIndex(stage)];
/** 구획의 발전 정도 0(판자촌)~4(초고층). 플레이어 동네가 먼저 자랍니다. */
export function blockTier(b: Block, stage: StageId | number): number {
  const s = typeof stage === 'number' ? stage : stageIndex(stage);
  return Math.max(0, Math.min(4, Math.floor(s - b.ring * 0.5 + 0.9)));
}

export function buildLayout(spots: SpotDef[]): Layout {
  const blocks: Block[] = [], lots: Lot[] = [];
  for (let i = -HALF; i <= HALF; i++) for (let j = -HALF; j <= HALF; j++) {
    const b: Block = { i, j, cx: blockCenter(i), cz: blockCenter(j), ring: ringOf(i, j), lots: [] };
    for (const sx of [-1, 1] as const) for (const sz of [-1, 1] as const) {
      const id = lots.length, seed = hash01(`${i},${j},${sx},${sz}`), alongX = hash01(id, 7) < 0.5;
      const fx = alongX ? sx : 0, fz = alongX ? 0 : sz;
      const cx = b.cx + sx * LOT_OFF, cz = b.cz + sz * LOT_OFF;
      const lot: Lot = { id, block: b, sx, sz, cx, cz, fx: fx as 0 | 1 | -1, fz: fz as 0 | 1 | -1, doorX: b.cx + (fx ? fx * WALK_EDGE : cx - b.cx), doorZ: b.cz + (fz ? fz * WALK_EDGE : cz - b.cz), kind: b.ring > 0 && seed < 0.1 ? 'park' : 'building', seed };
      b.lots.push(lot); lots.push(lot);
    }
    blocks.push(b);
  }
  // 장소 배정: 열리는 단계 순서대로, 새로 열리는 반경 안에서 결정적으로 고릅니다.
  const spotLots = new Map<string, Lot>(), used = new Set<number>(), perBlock = new Map<Block, number>();
  const ordered = spots.map((s, k) => ({ s, k })).sort((a, b) => stageIndex(a.s.minStage) - stageIndex(b.s.minStage) || a.k - b.k);
  for (const { s } of ordered) {
    const si = stageIndex(s.minStage), maxRing = RING_FOR_STAGE[Math.max(0, si)], minRing = si > 0 ? RING_FOR_STAGE[si - 1] + 1 : 0;
    const wantNear = s.kind === 'home' ? 0 : -1;
    const pick = (lo: number, hi: number): Lot | null => {
      let best: Lot | null = null, bs = Infinity;
      for (const l of lots) {
        if (used.has(l.id) || l.block.ring < lo || l.block.ring > hi) continue;
        if (l.kind === 'park' && hi < 6) continue;
        const sc = hash01(s.id, l.id) + (perBlock.get(l.block) ?? 0) * 0.55 + (wantNear === 0 ? l.block.ring * 3 : 0);
        if (sc < bs) { bs = sc; best = l; }
      }
      return best;
    };
    const lot = pick(minRing, maxRing) ?? pick(0, maxRing) ?? pick(0, 99);
    if (!lot) continue;
    lot.kind = 'building'; lot.spot = s; used.add(lot.id); spotLots.set(s.id, lot); perBlock.set(lot.block, (perBlock.get(lot.block) ?? 0) + 1);
  }
  const home = [...spotLots.values()].find(l => l.spot?.kind === 'home');
  const sb = blocks.find(b => b.i === START.i && b.j === START.j)!;
  const spawn = home ? { x: home.doorX + home.fx * 1.5 + (home.fz ? 2 : 0), z: home.doorZ + home.fz * 1.5 + (home.fx ? 2 : 0), yaw: Math.atan2(-home.fx, -home.fz) } : { x: sb.cx + 16.5, z: sb.cz + 16.5, yaw: 0 };
  return { blocks, lots, spotLots, spawn };
}

export interface Box { x0: number; x1: number; z0: number; z1: number }
/** 충돌 상자 모음: 구획 단위로 모아 두고 플레이어 주변만 검사합니다. */
export class Colliders {
  private byBlock = new Map<string, Box[]>();
  set(b: Block, boxes: Box[]): void { this.byBlock.set(`${b.i},${b.j}`, boxes); }
  /** 원(반지름 r)을 상자 밖으로 밀어냅니다. 밀린 결과를 out 에 담고 충돌했는지 돌려줍니다. */
  resolve(x: number, z: number, r: number, out: { x: number; z: number }): boolean {
    let hit = false;
    const bi = Math.round(x / PITCH), bj = Math.round(z / PITCH);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const boxes = this.byBlock.get(`${bi + di},${bj + dj}`); if (!boxes) continue;
      for (const b of boxes) {
        const nx = Math.max(b.x0, Math.min(x, b.x1)), nz = Math.max(b.z0, Math.min(z, b.z1)), dx = x - nx, dz = z - nz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 > 1e-6) { const d = Math.sqrt(d2), k = (r - d) / d; x += dx * k; z += dz * k; }
        else { // 상자 안: 가장 가까운 면으로
          const l = x - b.x0, rr = b.x1 - x, t = z - b.z0, bt = b.z1 - z, m = Math.min(l, rr, t, bt);
          if (m === l) x = b.x0 - r; else if (m === rr) x = b.x1 + r; else if (m === t) z = b.z0 - r; else z = b.z1 + r;
        }
      }
    }
    out.x = Math.max(-WORLD_HALF + 2, Math.min(WORLD_HALF - 2, x)); out.z = Math.max(-WORLD_HALF + 2, Math.min(WORLD_HALF - 2, z));
    return hit;
  }
}
