// FRONTLINE — 지형지물(게임플레이). 숲·언덕·진흙 늪·폐허는 걸을 수 있는 칸에 효과만 주고,
// 강과 바위는 막힌 칸(terrain)이며, 강에는 다리(좁은 통로)가 뚫려 있습니다. 모두 180도 대칭·시드 결정적입니다.
// 시뮬레이션(락스텝)이 읽으므로 + - * / 만 씁니다(Math.random·sin 은 강 모양 계산에만, 모든 브라우저에서 같은 값).
import type { UnitKind } from './config';

export const G_PLAIN = 0, G_FOREST = 1, G_HILL = 2, G_MUD = 3, G_RUIN = 4, G_BRIDGE = 5;
export const GROUND_INFO: Array<{ name: string; tip: string; color: string }> = [
  { name: '평지', tip: '효과 없음', color: '#c9a76d' },
  { name: '숲', tip: '시야 차단 · 보병 받는 피해 -20% · 차량 이동 -30%', color: '#4f7a3a' },
  { name: '언덕', tip: '사거리 +1.5 · 시야 +3', color: '#a8895a' },
  { name: '진흙 늪', tip: '모든 유닛 이동 -40%', color: '#6b5a3a' },
  { name: '폐허', tip: '보병 받는 피해 -35% (엄폐)', color: '#8c8c84' },
  { name: '다리', tip: '강을 건너는 좁은 통로(주변 건설 불가)', color: '#9b6a3c' },
];
export const RULES = { forestVehicleSpeed: 0.7, mudSpeed: 0.6, forestCover: 0.8, ruinCover: 0.65, hillRange: 1.5, hillVision: 3, forestSight: 2.5, pathMud: 1.0, pathForest: 0.3 } as const;

const isVehicle = (k: UnitKind): boolean => k === 'tank' || k === 'jeep';
/** 이 지형에서의 이동 속도 배율. */
export function speedMult(g: number, kind: UnitKind): number {
  if (g === G_MUD) return RULES.mudSpeed;
  if (g === G_FOREST && isVehicle(kind)) return RULES.forestVehicleSpeed;
  return 1;
}
/** 이 지형에 선 유닛이 받는 피해 배율(보병·일꾼·의무병·공병만 엄폐). */
export function coverMult(g: number, kind: UnitKind): number {
  if (isVehicle(kind)) return 1;
  return g === G_RUIN ? RULES.ruinCover : g === G_FOREST ? RULES.forestCover : 1;
}

export interface Bridge { x: number; y: number; /** 다리가 놓인 방향(강을 가로지르는 쪽, 라디안은 쓰지 않고 단위벡터). */ ax: number; ay: number }
export interface TerrainLayers { ground: Uint8Array; water: Uint8Array; noBuild: Uint8Array; bridges: Bridge[]; river: Array<{ x: number; y: number }> }

/** 가운데 대각선을 살짝 휘게 그린 강의 중심선(36 구간). 점대칭(중심 48,48)입니다. */
export function riverLine(): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= 36; i++) { const t = i / 36, p = 30.5 + t * 35, w = Math.sin(t * Math.PI * 2) * 2.4; out.push({ x: p + w * 0.7, y: p - w * 0.7 }); }
  return out;
}
const BRIDGE_AT = [3, 11, 25, 33]; // riverLine 인덱스 — 3↔33, 11↔25 가 서로 맞은편

// [중심x, 중심y, 반지름]. 맞은편은 자동으로 만듭니다.
const SPECS: Array<[number, Array<[number, number, number]>]> = [
  [G_FOREST, [[24, 58, 4.4], [52, 71, 3.8], [20, 44, 3.4], [61, 55, 3.2], [36, 80, 3]]],
  [G_HILL, [[70, 77, 3.8], [24, 51, 3.2], [58, 38, 3.4], [44, 62, 2.6]]],
  [G_MUD, [[56, 45, 3.6], [67, 86, 3.8], [30, 70, 2.8], [47, 30, 3]]],
  [G_RUIN, [[34, 74, 2.4], [52, 58, 2.6], [18, 62, 2.1], [63, 68, 2.2], [40, 52, 2]]],
];

const hash = (x: number, y: number, seed: number): number => {
  let h = Math.imul(x * 73856093 ^ y * 19349663 ^ seed * 83492791, 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};

/** terrain 에 강을 뚫고(다리 자리는 비움) 그 위에 지형 효과 칸을 얹습니다. 기지·자원·시작 자리 둘레는 평지로 남깁니다. */
export function buildTerrain(n: number, terrain: Uint8Array, keepClear: Array<{ x: number; y: number; w: number; h: number }>, seed = 7): TerrainLayers {
  const ground = new Uint8Array(n * n), water = new Uint8Array(n * n), noBuild = new Uint8Array(n * n), bridges: Bridge[] = [];
  const river = riverLine(), at = (x: number, y: number): number => y * n + x, inb = (x: number, y: number): boolean => x > 0 && y > 0 && x < n - 1 && y < n - 1;
  // 다리: 강 방향(u)과 수직인 v 쪽으로 길게 놓입니다.
  for (const i of BRIDGE_AT) {
    const a = river[Math.max(0, i - 1)], b = river[Math.min(river.length - 1, i + 1)], l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    bridges.push({ x: river[i].x, y: river[i].y, ax: -(b.y - a.y) / l, ay: (b.x - a.x) / l });
  }
  const bridgeOf = (px: number, py: number): { along: number; across: number } | null => {
    for (const br of bridges) { const dx = px - br.x, dy = py - br.y, across = dx * br.ax + dy * br.ay, along = dx * -br.ay + dy * br.ax; if (Math.abs(along) <= 1.6 && Math.abs(across) <= 3.4) return { along, across }; }
    return null;
  };
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
    const px = x + 0.5, py = y + 0.5;
    let near = false; for (const r of river) if ((r.x - px) ** 2 + (r.y - py) ** 2 <= 2.25) { near = true; break; }
    if (!near) continue;
    if (bridgeOf(px, py)) { ground[at(x, y)] = G_BRIDGE; continue; }
    terrain[at(x, y)] = 1; water[at(x, y)] = 1;
  }
  // 다리 둘레는 건설 금지(길목을 건물로 막지 못하게).
  for (const br of bridges) for (let y = Math.floor(br.y - 8); y <= Math.ceil(br.y + 8); y++) for (let x = Math.floor(br.x - 8); x <= Math.ceil(br.x + 8); x++) {
    if (!inb(x, y)) continue; const dx = x + 0.5 - br.x, dy = y + 0.5 - br.y;
    if (Math.abs(dx * -br.ay + dy * br.ax) <= 3.6 && Math.abs(dx * br.ax + dy * br.ay) <= 5.4) noBuild[at(x, y)] = 1;
  }
  const clear = (x: number, y: number): boolean => keepClear.some(k => x >= k.x - 3 && x < k.x + k.w + 3 && y >= k.y - 3 && y < k.y + k.h + 3);
  const put = (x: number, y: number, g: number): void => { if (inb(x, y) && !terrain[at(x, y)] && ground[at(x, y)] !== G_BRIDGE && !clear(x, y)) ground[at(x, y)] = g; };
  for (const [g, list] of SPECS) for (const [cx, cy, r] of list) {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const d = Math.sqrt((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2); if (d > r * (0.8 + 0.4 * hash(x, y, seed + g))) continue;
      put(x, y, g); put(n - 1 - x, n - 1 - y, g); // 맞은편 칸도 똑같이
    }
  }
  return { ground, water, noBuild, bridges, river };
}
