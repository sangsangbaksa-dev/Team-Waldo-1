// TYCOON — 도시 배치(순수 계산). 7×7 구획 격자, 구획마다 2×2 필지. 구역(district)마다 구획을 묶어 두고, 단계가 오르면 구역이 열립니다.
import type { District, SpotDef, Stage } from '../core/types';
import { DISTRICTS, stageIndex } from '../core/data';

export const GRID = 7, PITCH = 48, BLOCK = 36, ROAD = 12, LOT = 14, LOT_OFF = 8, WALK_EDGE = 16.5, HALF = 3;
/** 도시 전체의 반 너비(바깥 도로 바깥 끝까지). */
export const WORLD_HALF = HALF * PITCH + BLOCK / 2 + ROAD;
export const START = { i: -3, j: 3 };
export type Zone = District | 'fringe';

/** 구획 → 구역. 시작(뒷골목)은 남서쪽 끝, 항구는 남쪽 바다 쪽, 도심은 한가운데, 부촌은 북동쪽 끝. 나머지는 외곽(fringe). */
const ZONE_BLOCKS: Record<District, Array<[number, number]>> = {
  slum: [[-3, 3], [-2, 3], [-3, 2], [-2, 2]],
  market: [[-1, 3], [-1, 2], [-1, 1], [-2, 1], [-3, 1]],
  harbor: [[0, 3], [1, 3], [2, 3], [3, 3], [3, 2]],
  downtown: [[0, 2], [1, 2], [0, 1], [1, 1], [0, 0], [-1, 0], [1, 0]],
  uptown: [[3, -3], [2, -3], [3, -2], [2, -2], [3, -1]],
};
const ZONE_MAP = new Map<string, District>();
for (const [z, list] of Object.entries(ZONE_BLOCKS) as Array<[District, Array<[number, number]>]>) for (const [i, j] of list) ZONE_MAP.set(`${i},${j}`, z);
export const zoneOf = (i: number, j: number): Zone => ZONE_MAP.get(`${i},${j}`) ?? 'fringe';

export interface Block { i: number; j: number; cx: number; cz: number; ring: number; zone: Zone; lots: Lot[] }
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
const asIdx = (s: Stage | number): number => (typeof s === 'number' ? s : stageIndex(s));
/** 외곽은 사업가 단계부터 가까운 곳부터 열립니다. */
export function blockUnlocked(b: Block, stage: Stage | number): boolean {
  const s = asIdx(stage);
  if (b.zone === 'fringe') return s >= (b.ring <= 4 ? 3 : b.ring <= 5 ? 4 : 5);
  return s >= stageIndex(DISTRICTS[b.zone].minStage);
}
const ZONE_BASE: Record<Zone, number> = { slum: 0, market: 1, harbor: 1, downtown: 2, uptown: 3, fringe: 1 };
/** 구획의 발전 정도 0(판자촌)~4(초고층). 단계가 오르면 도시 전체가 자랍니다. */
export function blockTier(b: Block, stage: Stage | number): number {
  const s = asIdx(stage), open = b.zone === 'fringe' ? 3 : stageIndex(DISTRICTS[b.zone].minStage);
  return Math.max(0, Math.min(4, ZONE_BASE[b.zone] + Math.floor(Math.max(0, s - open) * 0.55)));
}

export function buildLayout(spots: readonly SpotDef[]): Layout {
  const blocks: Block[] = [], lots: Lot[] = [];
  for (let i = -HALF; i <= HALF; i++) for (let j = -HALF; j <= HALF; j++) {
    const b: Block = { i, j, cx: blockCenter(i), cz: blockCenter(j), ring: ringOf(i, j), zone: zoneOf(i, j), lots: [] };
    for (const sx of [-1, 1] as const) for (const sz of [-1, 1] as const) {
      const id = lots.length, seed = hash01(`${i},${j},${sx},${sz}`), alongX = hash01(id, 7) < 0.5;
      const fx = alongX ? sx : 0, fz = alongX ? 0 : sz;
      const cx = b.cx + sx * LOT_OFF, cz = b.cz + sz * LOT_OFF;
      const lot: Lot = { id, block: b, sx, sz, cx, cz, fx: fx as 0 | 1 | -1, fz: fz as 0 | 1 | -1, doorX: b.cx + (fx ? fx * WALK_EDGE : cx - b.cx), doorZ: b.cz + (fz ? fz * WALK_EDGE : cz - b.cz), kind: b.zone !== 'slum' && seed < 0.12 ? 'park' : 'building', seed };
      b.lots.push(lot); lots.push(lot);
    }
    blocks.push(b);
  }
  // 장소 배정: 같은 구역의 필지 중에서 결정적으로 고르되 한 구획에 몰리지 않게 퍼뜨립니다.
  const spotLots = new Map<string, Lot>(), used = new Set<number>(), perBlock = new Map<Block, number>();
  for (const s of spots) {
    let best: Lot | null = null, bs = Infinity;
    for (const l of lots) {
      if (used.has(l.id) || l.block.zone !== s.district) continue;
      const sc = hash01(s.id, l.id) + (perBlock.get(l.block) ?? 0) * 0.6 + (l.kind === 'park' ? 0.4 : 0);
      if (sc < bs) { bs = sc; best = l; }
    }
    if (!best) for (const l of lots) if (!used.has(l.id)) { best = l; break; }
    if (!best) continue;
    best.kind = 'building'; best.spot = s; used.add(best.id); spotLots.set(s.id, best); perBlock.set(best.block, (perBlock.get(best.block) ?? 0) + 1);
  }
  const home = spotLots.get('bench') ?? [...spotLots.values()].find(l => l.spot?.kind === 'home');
  const sb = blocks.find(b => b.i === START.i && b.j === START.j)!;
  const spawn = home ? { x: home.doorX + (home.fx ? home.fx * 2 : 3), z: home.doorZ + (home.fz ? home.fz * 2 : 3), yaw: Math.atan2(-home.fx, -home.fz) } : { x: sb.cx + 16.5, z: sb.cz + 16.5, yaw: 0 };
  return { blocks, lots, spotLots, spawn };
}

export interface Box { x0: number; x1: number; z0: number; z1: number }
/** 충돌 상자 모음: 구획 단위로 모아 두고 플레이어 주변만 검사합니다. */
export class Colliders {
  private byBlock = new Map<string, Box[]>();
  private treeBoxes = new Map<string, Box[]>();
  private crowns = new Map<string, Array<{ x: number; y: number; z: number; r: number }>>();
  set(b: Block, boxes: Box[]): void { this.byBlock.set(`${b.i},${b.j}`, boxes); }
  /** 가로수: 줄기는 걸어서 못 지나가는 작은 상자, 수관(잎 덩어리)은 카메라만 피하는 구로 등록합니다. 매번 통째로 갈아 끼웁니다. */
  setTrees(trees: Array<{ x: number; z: number; s: number }>): void {
    this.treeBoxes.clear(); this.crowns.clear();
    for (const t of trees) {
      const key = `${Math.round(t.x / PITCH)},${Math.round(t.z / PITCH)}`, w = 0.3 * t.s;
      (this.treeBoxes.get(key) ?? this.treeBoxes.set(key, []).get(key)!).push({ x0: t.x - w, x1: t.x + w, z0: t.z - w, z1: t.z + w });
      (this.crowns.get(key) ?? this.crowns.set(key, []).get(key)!).push({ x: t.x, y: 0.18 + 3.6 * t.s, z: t.z, r: 1.7 * t.s });
    }
  }
  /** 점(x,y,z) 이 나무 수관 안(또는 margin 이내)인가? 3인칭 카메라가 잎 속으로 파고드는 것을 막는 데 씁니다. */
  crownHit(x: number, y: number, z: number, margin: number): boolean {
    const bi = Math.round(x / PITCH), bj = Math.round(z / PITCH);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      for (const c of this.crowns.get(`${bi + di},${bj + dj}`) ?? []) { const dx = x - c.x, dy = y - c.y, dz = z - c.z, r = c.r + margin; if (dx * dx + dy * dy + dz * dz < r * r) return true; }
    }
    return false;
  }
  /** 원(반지름 r)을 상자 밖으로 밀어냅니다. 밀린 결과를 out 에 담고 충돌했는지 돌려줍니다. */
  resolve(x: number, z: number, r: number, out: { x: number; z: number }): boolean {
    let hit = false;
    const bi = Math.round(x / PITCH), bj = Math.round(z / PITCH);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const key = `${bi + di},${bj + dj}`, boxes = this.byBlock.get(key), trees = this.treeBoxes.get(key); if (!boxes && !trees) continue;
      for (const b of trees ? (boxes ? [...boxes, ...trees] : trees) : boxes!) {
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
