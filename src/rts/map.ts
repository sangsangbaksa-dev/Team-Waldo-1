// FRONTLINE — 맵. 두 진영이 180도 회전 대칭이라 어느 쪽에서 시작해도 같은 조건입니다.
import { MAP_SIZE } from './config';

export interface Pt { x: number; y: number }
export interface RtsMap {
  size: number;
  /** 1 이면 지형이 막은 칸. 바깥 한 줄은 항상 막혀 있습니다. */
  terrain: Uint8Array;
  /** 진영별 사령부 왼쪽 위 칸. */
  starts: [Pt, Pt];
  /** 시작 광물(진영별)과 확장 기지 광물. */
  nodes: Array<Pt & { base: number }>;
  /** 확장 사령부를 지을 수 있는 자리(왼쪽 위 칸). */
  expansions: Pt[];
  /** 장식용 바위 군집 중심 — 막힌 칸의 연결된 덩어리. */
  rocks: Array<Pt & { r: number }>;
}

const flip = (p: Pt): Pt => ({ x: MAP_SIZE - 1 - p.x, y: MAP_SIZE - 1 - p.y });

// 모두 한쪽 절반만 적고 반대편은 회전해서 만듭니다.
const CIRCLES: Array<[number, number, number]> = [[48, 48, 5.2], [30, 62, 4], [27, 40, 3.5], [41, 24, 3], [60, 70, 2.6]];
const RECTS: Array<[number, number, number, number]> = [[33, 50, 2, 12], [38, 66, 8, 2]];
const START_NODES: Pt[] = [{ x: 10, y: 72 }, { x: 10, y: 75 }, { x: 10, y: 78 }, { x: 12, y: 81 }, { x: 15, y: 82 }, { x: 18, y: 82 }, { x: 21, y: 81 }];
const EXPAND_NODES: Pt[] = [{ x: 14, y: 16 }, { x: 14, y: 19 }, { x: 14, y: 22 }, { x: 16, y: 25 }, { x: 19, y: 26 }, { x: 22, y: 26 }];

let cached: RtsMap | null = null;
export function buildMap(): RtsMap {
  if (cached) return cached;
  const n = MAP_SIZE, terrain = new Uint8Array(n * n);
  const block = (x: number, y: number): void => { if (x >= 0 && y >= 0 && x < n && y < n) terrain[y * n + x] = 1; };
  for (let i = 0; i < n; i++) { block(i, 0); block(i, n - 1); block(0, i); block(n - 1, i); }
  const rocks: RtsMap['rocks'] = [];
  for (const [cx, cy, r] of CIRCLES) {
    for (const [px, py] of [[cx, cy], [n - cx, n - cy]] as const) {
      rocks.push({ x: px, y: py, r });
      for (let y = Math.floor(py - r); y <= Math.ceil(py + r); y++) for (let x = Math.floor(px - r); x <= Math.ceil(px + r); x++) if ((x + 0.5 - px) ** 2 + (y + 0.5 - py) ** 2 <= r * r) block(x, y);
    }
  }
  for (const [x, y, w, h] of RECTS) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { block(x + i, y + j); block(n - 1 - (x + i), n - 1 - (y + j)); }
    rocks.push({ x: x + w / 2, y: y + h / 2, r: Math.max(w, h) / 2 }, { x: n - (x + w / 2), y: n - (y + h / 2), r: Math.max(w, h) / 2 });
  }
  const nodes: RtsMap['nodes'] = [];
  START_NODES.forEach(p => { nodes.push({ ...p, base: 0 }); const q = flip(p); nodes.push({ ...q, base: 1 }); });
  EXPAND_NODES.forEach(p => { nodes.push({ ...p, base: 2 }); const q = flip(p); nodes.push({ ...q, base: 3 }); });
  const starts: [Pt, Pt] = [{ x: 14, y: 74 }, { x: n - 14 - 4, y: n - 74 - 4 }];
  const expansions: Pt[] = [{ x: 18, y: 18 }, { x: n - 18 - 4, y: n - 18 - 4 }];
  cached = { size: n, terrain, starts, nodes, expansions, rocks };
  return cached;
}
