// LAST CITY 1대1 전용 맵(아레나). 큰 도시(9×9 블록) 한가운데 3×3 블록만 쓰고, 둘레를 건물 벽으로 막습니다.
// 모든 배치는 맵 중심에 대한 점대칭(180° 회전)이라 두 플레이어에게 똑같이 공정합니다.
// 월드 좌표계(SIZE)는 그대로라서 렌더러·충돌·사업체 코드는 도시와 같은 방식으로 동작하고, 영역 밖 블록은 'void' 입니다.
import { BLOCKS, PITCH, ROAD, SIZE, type BizKind } from './defs';
import { addSolid, emptyMap, type BlockType, type CityMap } from './map';

const ARENA_LO = 3, ARENA_HI = 5;
/** 경기장 영역(도로 포함). 중심은 월드 중심 SIZE/2 입니다. */
export const ARENA_BOUNDS = { x0: ARENA_LO * PITCH, y0: ARENA_LO * PITCH, x1: (ARENA_HI + 1) * PITCH + ROAD, y1: (ARENA_HI + 1) * PITCH + ROAD };
const WALL_T = 140;
/** 경기장 안 도로 4줄(바깥 둘레 2 + 안쪽 2)의 시작 좌표. 북쪽·서쪽 줄만 적으면 남쪽·동쪽은 대칭입니다. */
const ROADS = [ARENA_BOUNDS.x0, ARENA_BOUNDS.x0 + PITCH];

type Pad = { x: number; y: number };
const pt = (p: Pad): Pad => ({ x: SIZE - p.x, y: SIZE - p.y });

class Builder {
  readonly m = emptyMap(); private n = 0;
  constructor(readonly pal: [string, string][], readonly name: string) {}
  private solid(x: number, y: number, w: number, h: number, height: number, sign?: string, signColor?: string): number {
    const c = this.n++ % this.pal.length;
    return addSolid(this.m, { x, y, w, h, height, wall: this.pal[c][0], roof: this.pal[c][1], struct: 0, alive: true, sign, signColor });
  }
  /** 건물(엄폐물 포함) 하나와 중심 대칭 짝을 함께 만듭니다. */
  pair(x: number, y: number, w: number, h: number, height: number, sign?: string, signColor?: string): [number, number] {
    return [this.solid(x, y, w, h, height, sign, signColor), this.solid(SIZE - x - w, SIZE - y - h, w, h, height, sign, signColor)];
  }
  /** 가운데에 놓이는 자기 대칭 건물(중심이 월드 중심과 같아야 합니다). */
  center(w: number, h: number, height: number, sign?: string, signColor?: string): number {
    return this.solid(SIZE / 2 - w / 2, SIZE / 2 - h / 2, w, h, height, sign, signColor);
  }
  /** 출입문(패드) 이 달린 사업체와 그 짝. */
  shop(kind: BizKind, x: number, y: number, w: number, h: number, height: number, sign: string, signColor: string, pad: Pad): void {
    const [a, b] = this.pair(x, y, w, h, height, sign, signColor), q = pt(pad);
    this.m.biz.push({ kind, x: pad.x, y: pad.y, solid: a }, { kind, x: q.x, y: q.y, solid: b });
  }
  /** 도로 한가운데 엇갈린 바리케이드 두 개(시케인): 긴 도로가 일직선 저격로가 되지 않게 끊고, 지그재그로는 지나갈 수 있습니다. */
  chicane(horizontal: boolean, road: number): void {
    const c = SIZE / 2;
    if (horizontal) { this.pair(c - 100, road, 80, 70, 0); this.pair(c + 20, road + 50, 80, 70, 0); }
    else { this.pair(road, c - 100, 70, 80, 0); this.pair(road + 50, c + 20, 70, 80, 0); }
  }
  loot(x: number, y: number, tier: number): void { this.m.loot.push({ x, y, tier }, { x: SIZE - x, y: SIZE - y, tier }); }
  tree(x: number, y: number, r: number): void { this.m.trees.push({ x, y, r }, { x: SIZE - x, y: SIZE - y, r }); }
  /** 경기장을 둘러싼 외벽: 북쪽·서쪽 조각 목록을 주면 남쪽·동쪽이 대칭으로 생깁니다. */
  ring(north: [number, number, number][], west: [number, number, number][]): void {
    const { x0, y0 } = ARENA_BOUNDS;
    for (const [x, w, height] of north) this.pair(x, y0 - WALL_T, w, WALL_T, height);
    for (const [y, h, height] of west) this.pair(x0 - WALL_T, y, WALL_T, h, height);
  }
  /** blocks: 3×3 블록 종류(행 우선, 북서→남동). 나머지 블록은 void. */
  finish(types: BlockType[], bases: { x: number; y: number; face: 1 | -1 }[]): CityMap {
    const m = this.m;
    for (let j = 0; j < BLOCKS; j++) for (let i = 0; i < BLOCKS; i++) {
      const inside = i >= ARENA_LO && i <= ARENA_HI && j >= ARENA_LO && j <= ARENA_HI;
      m.blocks.push({ i, j, x: ROAD + i * PITCH, y: ROAD + j * PITCH, type: inside ? types[(j - ARENA_LO) * 3 + (i - ARENA_LO)] : 'void' });
    }
    for (const b of bases) { const bi = Math.floor((b.x - ROAD) / PITCH), bj = Math.floor((b.y - ROAD) / PITCH); m.bases.push({ x: b.x, y: b.y, bx: ROAD + bi * PITCH, by: ROAD + bj * PITCH, face: b.face }); }
    m.police = { x: SIZE / 2, y: SIZE / 2 };
    m.arena = { name: this.name, ...ARENA_BOUNDS };
    return m;
  }
}

// ---------------------------------------------------------------------------------------------
// 0번 맵 — 센트럴 플라자: 북서·남동 모서리 본부, 한가운데 은행 광장, 사선 교차로와 두 갈래 측면 길.
function plaza(): CityMap {
  const b = new Builder([['#59606e', '#8a93a3'], ['#6b5a52', '#a38a7d'], ['#4f6470', '#7c9aab'], ['#6d6654', '#a89f82'], ['#5b5470', '#8d83ab'], ['#48606a', '#7096a3']], '센트럴 플라자');
  for (const r of ROADS) { b.chicane(true, r); b.chicane(false, r); }
  b.ring([[1540, 660, 0.22], [2200, 560, 0.4], [2760, 860, 0.16]], [[1680, 600, 0.3], [2280, 600, 0.14], [2880, 600, 0.26]]);
  // 본부 앞 엄폐물(컨테이너·벽): 스폰을 바로 겨냥하지 못하게 합니다.
  b.pair(1850, 2150, 100, 44, 0); b.pair(2090, 2150, 100, 44, 0); b.pair(2170, 1850, 44, 110, 0); b.pair(1830, 1850, 44, 80, 0);
  // 북쪽 중앙 블록: 무기상 + 가로 엄폐물 (남쪽 블록이 대칭).
  b.shop('gunshop', 2420, 1830, 150, 100, 0.12, 'GUNS', '#ff5d5d', { x: 2495, y: 1950 });
  b.pair(2640, 1900, 44, 120, 0); b.pair(2540, 2130, 140, 36, 0);
  // 북동 블록: 편의점 + ㄱ자 건물 (남서 블록이 대칭) — 본부에서 먼 쪽 측면 길목.
  b.shop('store', 2960, 1840, 200, 130, 0.4, '24', '#5fd38a', { x: 3060, y: 1990 });
  b.pair(3230, 2040, 100, 150, 0.2); b.pair(3040, 2130, 90, 40, 0);
  // 서쪽 중앙 공원 (동쪽 공원이 대칭): 나무와 낮은 벽.
  b.pair(1880, 2500, 36, 120, 0); b.pair(2070, 2440, 120, 36, 0);
  for (const [x, y, r] of [[1900, 2400, 26], [2150, 2640, 24], [1960, 2720, 28], [2190, 2480, 20]]) b.tree(x, y, r);
  // 한가운데: 은행 + 네 모서리 기둥
  b.center(160, 160, 0.42, 'BANK', '#e8f1ff');
  b.pair(2400, 2400, 56, 56, 0); b.pair(2400, 2704, 56, 56, 0);
  // 전리품: 가운데 근처 강한 무기, 측면 중간 등급, 본부 쪽 응급품
  b.loot(2480, 2580, 3); b.loot(1960, 2570, 2); b.loot(2140, 2260, 1); b.loot(3010, 2090, 2);
  return b.finish(['base', 'city', 'city', 'park', 'plaza', 'park', 'city', 'city', 'base'], [{ x: 2020, y: 2020, face: 1 }, { x: 3140, y: 3140, face: -1 }]);
}

// 1번 맵 — 컨테이너 항만: 북·남 중앙 본부, 가운데 큰 창고, 양쪽 날개의 무기상과 컨테이너 골목.
function harbor(): CityMap {
  const b = new Builder([['#b5543a', '#d98c6f'], ['#3f6e8c', '#7fb0cf'], ['#4f7d4f', '#8bbd8b'], ['#c9a13b', '#e8cc78'], ['#7d5a9a', '#b596cf'], ['#7c828c', '#b4bac4']], '컨테이너 항만');
  for (const r of ROADS) { b.chicane(true, r); b.chicane(false, r); }
  b.ring([[1540, 740, 0.12], [2280, 560, 0.34], [2840, 780, 0.2]], [[1680, 450, 0.18], [2130, 900, 0.3], [3030, 450, 0.1]]);
  // 본부(북·남 중앙 블록) 앞 컨테이너와 옆벽
  b.pair(2420, 2150, 100, 44, 0); b.pair(2640, 2150, 100, 44, 0); b.pair(2380, 1860, 40, 120, 0); b.pair(2740, 1860, 40, 120, 0);
  // 서쪽 중앙 블록: 무기상(동쪽이 대칭) + 문 앞 막이 + 컨테이너 줄
  b.shop('gunshop', 1840, 2525, 140, 110, 0.12, 'GUNS', '#ff5d5d', { x: 2000, y: 2580 });
  b.pair(2090, 2400, 44, 100, 0); b.pair(2090, 2680, 44, 100, 0); b.pair(1850, 2420, 90, 40, 0);
  // 북서 모서리 블록: 편의점과 컨테이너 야적장 (남동 블록이 대칭)
  b.shop('store', 1960, 1960, 220, 120, 0.2, '24', '#5fd38a', { x: 2070, y: 2100 });
  b.pair(1840, 1840, 130, 44, 0); b.pair(1840, 1910, 44, 110, 0); b.pair(2040, 1840, 120, 44, 0);
  // 북동 모서리 블록: 컨테이너 미로 (남서 블록이 대칭)
  b.pair(2960, 1840, 110, 44, 0); b.pair(3140, 1890, 44, 130, 0); b.pair(2980, 1990, 130, 44, 0); b.pair(3230, 2110, 100, 44, 0);
  // 가운데 큰 창고 + 앞뒤 가림막
  b.center(300, 140, 0.3, 'FAB', '#7fd8ff');
  b.pair(2450, 2440, 90, 36, 0); b.pair(2630, 2440, 90, 36, 0);
  b.loot(2580, 2400, 3); b.loot(2030, 2480, 2); b.loot(2320, 2090, 1); b.loot(3050, 2090, 2);
  return b.finish(['city', 'base', 'lot', 'city', 'plaza', 'city', 'lot', 'base', 'city'], [{ x: 2580, y: 2020, face: 1 }, { x: 2580, y: 3140, face: -1 }]);
}

export interface ArenaInfo { name: string; blurb: string }
const BUILDERS: { info: ArenaInfo; build: () => CityMap }[] = [
  { info: { name: '센트럴 플라자', blurb: '북서·남동 모서리 본부, 은행이 선 광장, 사선 길' }, build: plaza },
  { info: { name: '컨테이너 항만', blurb: '북·남 본부, 가운데 창고, 양쪽 날개 컨테이너 골목' }, build: harbor },
];
export const ARENA_COUNT = BUILDERS.length;
export const arenaInfo = (id: number): ArenaInfo => BUILDERS[((id % ARENA_COUNT) + ARENA_COUNT) % ARENA_COUNT].info;
/** 매치 시드에서 맵을 고릅니다. 두 클라이언트가 같은 시드를 받으므로 같은 맵이 됩니다. */
export const arenaOf = (seed: number): number => Math.abs(Math.trunc(seed)) % ARENA_COUNT;
export function generateArena(id: number): CityMap { return BUILDERS[((id % ARENA_COUNT) + ARENA_COUNT) % ARENA_COUNT].build(); }
