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
const CIRCLES: Array<[number, number, number]> = [
  [80, 80, 8.7], [50, 103, 6.7], [45, 67, 5.8], [68, 40, 5], [100, 117, 4.3], [65, 95, 3.2], [95, 65, 3.2], [80, 58, 3],
];
const RECTS: Array<[number, number, number, number]> = [
  [55, 83, 3, 20], [63, 110, 13, 3], [55, 80, 3, 14], [78, 55, 14, 3], [88, 88, 4, 4],
];
const START_NODES: Pt[] = [{ x: 17, y: 120 }, { x: 17, y: 125 }, { x: 17, y: 130 }, { x: 20, y: 135 }, { x: 25, y: 136 }, { x: 30, y: 136 }, { x: 35, y: 135 }];
const EXPAND_NODES: Pt[] = [{ x: 23, y: 27 }, { x: 23, y: 32 }, { x: 23, y: 37 }, { x: 26, y: 42 }, { x: 29, y: 43 }, { x: 32, y: 43 }];
const THIRD_NODES: Pt[] = [{ x: 28, y: 65 }, { x: 28, y: 68 }, { x: 28, y: 71 }, { x: 31, y: 74 }, { x: 34, y: 75 }, { x: 37, y: 75 }];
const FOURTH_NODES: Pt[] = [{ x: 85, y: 28 }, { x: 88, y: 28 }, { x: 91, y: 28 }, { x: 94, y: 31 }, { x: 95, y: 34 }, { x: 95, y: 37 }];
const EXPANSION_SITES: Pt[] = [{ x: 30, y: 30 }, { x: 32, y: 66 }, { x: 78, y: 32 }];

const pushNodes = (nodes: RtsMap['nodes'], pts: Pt[], baseA: number, baseB: number): void => {
  for (const p of pts) { nodes.push({ ...p, base: baseA }); nodes.push({ ...flip(p), base: baseB }); }
};

let cached: RtsMap | null = null;
let cachedSize = -1;
export function clearBuildMapCache(): void { cached = null; cachedSize = -1; }

export function buildMap(): RtsMap {
  if (cached && cachedSize === MAP_SIZE) return cached;
  cached = null;
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
  pushNodes(nodes, START_NODES, 0, 1);
  pushNodes(nodes, EXPAND_NODES, 2, 3);
  pushNodes(nodes, THIRD_NODES, 4, 5);
  pushNodes(nodes, FOURTH_NODES, 6, 7);
  const starts: [Pt, Pt] = [{ x: 23, y: 123 }, { x: n - 23 - 4, y: n - 123 - 4 }];
  const expansions: Pt[] = [];
  for (const p of EXPANSION_SITES) { expansions.push(p); expansions.push({ x: n - p.x - 4, y: n - p.y - 4 }); }
  cached = { size: n, terrain, starts, nodes, expansions, rocks };
  cachedSize = MAP_SIZE;
  return cached;
}
