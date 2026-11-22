// OUTLAW CITY — 시드 도시·우측통행 차선망 생성과 공간 해시 기반 정적 충돌·광선·길찾기.
import { makeRng, clamp, type CityMap, type LaneNode, type District, type Building, type PoiKind, type PropKind } from './types';

const CELL = 32, EPS = 1e-7;
const key = (x: number, z: number): string => `${x},${z}`;
interface Box { x0: number; x1: number; z0: number; z1: number; top: number; building: boolean }
interface Grid { boxes: Box[]; cells: Map<string, number[]>; lanes: Map<string, number[]>; marks: Uint32Array; stamp: number }
function bucket(cells: Map<string, number[]>, x: number, z: number, id: number): void {
  const k = key(x, z), list = cells.get(k); if (list) list.push(id); else cells.set(k, [id]);
}
function indexMap(map: CityMap): Grid {
  const g: Grid = { boxes: [], cells: new Map(), lanes: new Map(), marks: new Uint32Array(0), stamp: 0 };
  for (const b of map.buildings) if (b.solid) g.boxes.push({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2, top: b.h, building: true });
  for (const p of map.props) if (p.r > 0) g.boxes.push({ x0: p.x - p.r, x1: p.x + p.r, z0: p.z - p.r, z1: p.z + p.r, top: 2.5 * p.scale, building: false });
  g.boxes.forEach((b, i) => { for (let x = Math.floor(b.x0 / CELL); x <= Math.floor(b.x1 / CELL); x++) for (let z = Math.floor(b.z0 / CELL); z <= Math.floor(b.z1 / CELL); z++) bucket(g.cells, x, z, i); });
  for (const n of map.lanes) bucket(g.lanes, Math.floor(n.x / CELL), Math.floor(n.z / CELL), n.id);
  g.marks = new Uint32Array(g.boxes.length); map.grid = g; return g;
}
const gridOf = (map: CityMap): Grid => (map.grid as Grid | null) ?? indexMap(map);
function stamp(g: Grid): number { g.stamp = (g.stamp + 1) >>> 0; if (!g.stamp) { g.marks.fill(0); g.stamp = 1; } return g.stamp; }
function nearby(g: Grid, x0: number, z0: number, x1: number, z1: number, visit: (b: Box) => void): void {
  const s = stamp(g);
  for (let x = Math.floor(x0 / CELL); x <= Math.floor(x1 / CELL); x++) for (let z = Math.floor(z0 / CELL); z <= Math.floor(z1 / CELL); z++) {
    const ids = g.cells.get(key(x, z)); if (!ids) continue;
    for (const id of ids) { if (g.marks[id] === s) continue; g.marks[id] = s; visit(g.boxes[id]); }
  }
}

/** 시드로 같은 도시를 만듭니다. */
/** 한 변의 블록 수(한 블록 100m)와, 핵심 시설이 놓인 안쪽 구역의 바깥 여백 */
const N = 16, O = 2, HALF = N * 50;
export function generateCity(seed: number): CityMap {
  const rng = makeRng(seed), pick = <T>(a: readonly T[]): T => a[Math.floor(rng() * a.length)];
  const map: CityMap = { seed, half: HALF, pitch: 100, roadW: 14, sidewalkW: 3, blockSize: 86, gx: Array.from({ length: N + 1 }, (_, i) => -HALF + i * 100), buildings: [], props: [], roads: [], lanes: [], pois: [], ramps: [], parks: [], walkPoints: [], grid: null };
  const districts: District[] = [], blocks: Building[][] = Array.from({ length: N * N }, () => []);
  const facilities: Array<[string, PoiKind, string, number, number]> = [
    ['safe0', 'safehouse', '오크 스트리트 은신처', 1, 9], ['safe1', 'safehouse', '힐사이드 은신처', 10, 1],
    ['gun0', 'gunshop', '아이언 사이트', 2, 6], ['gun1', 'gunshop', '노스 암스', 9, 2],
    ['pay0', 'paynspray', '웨스트 도색소', 1, 4], ['pay1', 'paynspray', '이스트 도색소', 10, 8],
    ['hosp0', 'hospital', '시립 병원', 7, 8], ['police0', 'police', '중앙 경찰서', 8, 3],
    ['bank0', 'bank', '유니언 은행', 3, 5], ['casino0', 'casino', '미라지 카지노', 5, 5],
    ['chop0', 'chopshop', '항만 해체장', 1, 1], ['garage0', 'garage', '모터 웍스', 9, 9], ['club0', 'club', '블루 아워', 6, 4],
    ['dealer0', 'dealer', '프레스티지 모터스', 4, 9], ['arena0', 'arena', '지하 격투장', 0, 8],
    ['m_delivery', 'start', '배달 의뢰', 2, 10], ['m_theft', 'start', '차량 절도', 10, 3], ['m_debt', 'start', '빚 수금', 3, 7],
    ['m_chase', 'start', '추격 의뢰', 8, 10], ['m_heist', 'start', '은행 작업', 4, 3], ['m_race', 'start', '스트리트 레이스', 10, 6], ['m_boss', 'start', '최후의 거래', 2, 0],
  ];
  // 시설은 공원 추첨에서 제외해 모든 시드에서 입구를 확보합니다.
  const reserved = new Set(facilities.map(f => (f[4] + O) * N + f[3] + O));
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) { const a = x - O, c = z - O; districts.push(a < 0 || c < 0 ? ((x < O && z < N - 3) || (z < O && x < N - 3) ? 'industrial' : 'residential') : a < 3 && c < 3 ? 'industrial' : a >= 4 && a <= 6 && c >= 4 && c <= 6 ? 'downtown' : a >= 3 && a <= 7 && c >= 3 && c <= 7 ? 'commercial' : 'residential'); }
  const candidates = districts.map((_, i) => i).filter(i => districts[i] === 'residential' && !reserved.has(i));
  const parkCount = 8 + Math.floor(rng() * 4), selected: number[] = [];
  while (selected.length < parkCount) {
    const i = candidates.splice(Math.floor(rng() * candidates.length), 1)[0];
    if (selected.some(j => Math.abs(i % N - j % N) + Math.abs(Math.floor(i / N) - Math.floor(j / N)) < 3)) continue;
    districts[i] = 'park'; selected.push(i);
  }
  const prop = (kind: PropKind, x: number, z: number, r = 0, ry = 0, scale = 1): void => { map.props.push({ kind, x, z, r, ry, scale }); };
  const palette = [0xa99d8c, 0x8d969b, 0xb6aa95, 0x806f61, 0x667982, 0xc0b59f, 0x9b8175];
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
    const bi = iz * N + ix, district = districts[bi], x = -HALF + 50 + ix * 100, z = -HALF + 50 + iz * 100;
    if (district === 'park') {
      map.parks.push({ x, z, w: 80, d: 80 });
      for (let j = 0; j < 20; j++) { const a = rng() * Math.PI * 2, d = 17 + rng() * 19; prop(pick(['tree_round', 'tree_pine'] as const), x + Math.cos(a) * d, z + Math.sin(a) * d, 0.35, rng() * 6.28, 0.8 + rng() * 0.5); }
      for (const s of [-1, 1]) for (const d of [-24, 0, 24]) prop('bench', x + d, z + s * 8, 0, s * Math.PI / 2);
    } else {
      const n = district === 'residential' ? 3 : 2, spacing = 76 / n;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const kind = district === 'downtown' ? 'tower' : district === 'commercial' ? pick(['shop', 'office'] as const) : district === 'industrial' ? pick(['warehouse', 'factory', 'garage'] as const) : rng() < 0.7 ? 'house' : 'apartment';
        const w = spacing - 5 - rng() * 5, d = spacing - 5 - rng() * 5;
        const h = kind === 'tower' ? 45 + rng() * 75 : kind === 'house' ? 5 + rng() * 4 : kind === 'apartment' ? 15 + rng() * 15 : district === 'commercial' ? 12 + rng() * 23 : 7 + rng() * 12;
        const b: Building = { id: map.buildings.length, x: x - 38 + spacing * (i + 0.5) + (rng() - 0.5) * 2, z: z - 38 + spacing * (j + 0.5) + (rng() - 0.5) * 2, w, d, h, kind, district, tex: Math.floor(rng() * 6), color: pick(palette), roof: kind === 'house' && rng() < 0.65 ? 'gable' : rng() < 0.12 ? 'tank' : 'flat', neon: district === 'downtown' && rng() < 0.65, solid: true };
        map.buildings.push(b); blocks[bi].push(b);
      }
    }
    // 가로수 띠는 보행 중심선에서 떨어뜨려 배치합니다.
    for (let side = 0; side < 4; side++) {
      const at = (u: number, v: number): [number, number] => side === 0 ? [x + u, z - v] : side === 1 ? [x + v, z + u] : side === 2 ? [x - u, z + v] : [x - v, z - u];
      for (const u of [-30, 0, 30]) { const [px, pz] = at(u, 42); prop('lamp', px, pz, 0.25, side * Math.PI / 2); }
      for (const u of [-17, 17]) { const [px, pz] = at(u, 42); prop('tree_round', px, pz, 0.35, 0, 0.8 + rng() * 0.3); }
      for (const u of [-37, 37]) {
        const [px, pz] = at(u, 41.5), kind = pick(['hydrant', 'bench', 'mailbox', 'bus_stop', 'vending', 'kiosk', 'phone_booth', 'street_sign', 'bollards', 'bin', 'cone', 'barrier', 'billboard', 'food_cart', 'bike_rack', 'newsstand'] as const);
        prop(kind, px, pz, kind === 'bench' ? 0 : kind === 'kiosk' ? 0.7 : kind === 'barrier' ? 0.6 : 0.25, side * Math.PI / 2);
      }
    }
    if (district === 'industrial') prop('dumpster', x, z, 0.8, rng() * Math.PI * 2);
  }
  for (const [id, kind, name, fx, fz] of facilities) {
    const ix = fx + O, iz = fz + O;
    const b = blocks[iz * N + ix][0], pay = kind === 'paynspray', start = kind === 'start';
    if (!start) {
      b.kind = kind === 'safehouse' ? 'house' : pay || kind === 'garage' || kind === 'chopshop' ? 'garage' : kind === 'hospital' || kind === 'police' || kind === 'bank' ? 'office' : 'shop';
      b.tex = kind === 'bank' || kind === 'hospital' ? 2 : kind === 'casino' || kind === 'club' ? 5 : pay || kind === 'chopshop' ? 3 : 1;
      b.neon = kind === 'casino' || kind === 'club' || kind === 'gunshop' || pay || kind === 'dealer' || kind === 'arena';
      if (kind === 'safehouse') { b.h = 7; b.roof = 'gable'; }
    }
    // 도색소는 북쪽 도로와 연결된 넓은 앞마당을 확보합니다.
    if (pay) {
      b.w = 26; b.d = 28; b.h = 9; b.z = -HALF + iz * 100 + 52; b.roof = 'flat';
      const remove = new Set(blocks[iz * N + ix].filter(q => q !== b && Math.abs(q.x - b.x) < (q.w + b.w) / 2 + 1).map(q => q.id));
      map.buildings = map.buildings.filter(q => !remove.has(q.id));
    } else b.d = Math.min(b.d, 2 * (b.z - (-HALF + iz * 100 + 15)));
    const x = b.x, z = -HALF + iz * 100 + (pay ? 29 : 8.5);
    map.pois.push({ id, kind, name, x, z, r: start ? 3.5 : pay ? 8 : 6, building: b.id });
    map.props = map.props.filter(p => Math.abs(p.x - x) > (pay ? 10 : 7) || p.z > b.z - b.d / 2 || p.z < z - 4);
  }
  buildLanes(map);
  // 차선 밖 앞마당에 점프대를 놓고 착지 방향의 공간도 비웁니다.
  for (const [fx, fz] of [[0, 0], [2, 2], [0, 2], [9, 10], [10, 0], [1, 7]]) {
    const ix = fx + O, iz = fz + O, x = -HALF + 50 + ix * 100, z = -HALF + iz * 100 + 17;
    map.ramps.push({ x, z, h: 1.6 + rng() * 1.2, w: 5, len: 13 });
    map.buildings = map.buildings.filter(b => Math.abs(b.x - x) >= b.w / 2 + 22 || Math.abs(b.z - z) >= b.d / 2 + 5);
    map.props = map.props.filter(p => Math.abs(p.x - x) > 25 || Math.abs(p.z - z) > 5);
  }
  const ids = new Map(map.buildings.map((b, i) => [b.id, i]));
  for (const p of map.pois) p.building = ids.get(p.building) ?? -1;
  map.buildings.forEach((b, i) => { b.id = i; });
  indexMap(map);
  // 도로마다 선택한 인도 중심선에 12m 간격으로 분산해 예산을 지킵니다.
  for (let i = 0; i <= N; i++) for (let u = -HALF + 12; u <= HALF - 12; u += 12) {
    const v = map.gx[i] + (i === N ? -8.5 : 8.5);
    for (const p of [{ x: u, z: v }, { x: v, z: u }]) if (surfaceAt(map, p.x, p.z) === 'sidewalk' && isOpen(map, p.x, p.z, 0.45)) map.walkPoints.push(p);
  }
  for (const p of map.parks) for (let u = -36; u <= 36; u += 12) for (const q of [{ x: p.x + u, z: p.z }, { x: p.x, z: p.z + u }]) if (isOpen(map, q.x, q.z, 0.45)) map.walkPoints.push(q);
  return map;
}

function buildLanes(map: CityMap): void {
  const incoming: number[][] = Array.from({ length: (N + 1) * (N + 1) }, () => []), outgoing: number[][] = Array.from({ length: (N + 1) * (N + 1) }, () => []);
  const node = (x: number, z: number, h: number, road: number, limit: number, light = -1): number => { const id = map.lanes.length; map.lanes.push({ id, x, z, h, next: [], road, limit, light }); return id; };
  const segment = (ax: number, az: number, bx: number, bz: number): void => {
    const road = map.roads.length, x = map.gx[ax], z = map.gx[az], xx = map.gx[bx], zz = map.gx[bz], major = ax === bx ? ax === 0 || ax === N : az === 0 || az === N;
    map.roads.push({ id: road, ax: x, az: z, bx: xx, bz: zz, width: 14, major });
    for (const reverse of [false, true]) {
      const sx = reverse ? xx : x, sz = reverse ? zz : z, ex = reverse ? x : xx, ez = reverse ? z : zz;
      const dx = (ex - sx) / 100, dz = (ez - sz) / 100, h = Math.atan2(dz, dx), limit = major ? 20 : 14;
      const a = node(sx + dx * 10 - dz * 3.5, sz + dz * 10 + dx * 3.5, h, road, limit);
      const m = node((sx + ex) / 2 - dz * 3.5, (sz + ez) / 2 + dx * 3.5, h, road, limit);
      const b = node(ex - dx * 10 - dz * 3.5, ez - dz * 10 + dx * 3.5, h, road, limit, dx ? 0 : 1);
      map.lanes[a].next.push(m); map.lanes[m].next.push(b);
      outgoing[(reverse ? bz : az) * (N + 1) + (reverse ? bx : ax)].push(a);
      incoming[(reverse ? az : bz) * (N + 1) + (reverse ? ax : bx)].push(b);
    }
  };
  for (let z = 0; z <= N; z++) for (let x = 0; x <= N; x++) { if (x < N) segment(x, z, x + 1, z); if (z < N) segment(x, z, x, z + 1); }
  // Connect all (N + 1)² intersections. Hardcoding 169 cut off roads below
  // the first ten grid rows in the 17×17 map, creating traffic dead ends.
  for (let j = 0; j < incoming.length; j++) for (const ai of incoming[j]) for (const bi of outgoing[j]) {
    const a = map.lanes[ai], b = map.lanes[bi], dot = Math.cos(a.h - b.h); if (dot < -0.5) continue;
    if (dot > 0.5) { const mid = node((a.x + b.x) / 2, (a.z + b.z) / 2, b.h, b.road, Math.min(a.limit, b.limit)); a.next.push(mid); map.lanes[mid].next.push(bi); continue; }
    // 진입·출구 접선의 교점을 제어점으로 삼아 차선 안에서 부드럽게 돕니다.
    const ux = Math.cos(a.h), uz = Math.sin(a.h), vx = Math.cos(b.h), vz = Math.sin(b.h);
    const cross = ux * vz - uz * vx, t = ((b.x - a.x) * vz - (b.z - a.z) * vx) / cross, cx = a.x + ux * t, cz = a.z + uz * t;
    let prev = ai;
    for (const f of [1 / 3, 2 / 3]) {
      const q = 1 - f, x = q * q * a.x + 2 * q * f * cx + f * f * b.x, z = q * q * a.z + 2 * q * f * cz + f * f * b.z;
      const h = Math.atan2(q * (cz - a.z) + f * (b.z - cz), q * (cx - a.x) + f * (b.x - cx));
      const id = node(x, z, h, b.road, Math.min(a.limit, b.limit)); map.lanes[prev].next.push(id); prev = id;
    }
    map.lanes[prev].next.push(bi);
  }
}

/** 원과 AABB 접촉을 반복해 모서리에서도 벽을 따라 미끄러집니다. */
export function moveCircle(map: CityMap, x: number, z: number, r: number, y0: number, y1: number): { x: number; z: number; hit: boolean } {
  const g = gridOf(map); let hit = false;
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    nearby(g, x - r, z - r, x + r, z + r, b => {
      if (y0 >= b.top || y1 <= 0) return;
      const dx = x - clamp(x, b.x0, b.x1), dz = z - clamp(z, b.z0, b.z1), dd = dx * dx + dz * dz;
      if (dd >= r * r) return;
      if (dd > EPS * EPS) { const d = Math.sqrt(dd), k = (r - d + EPS) / d; x += dx * k; z += dz * k; }
      else {
        const left = x - b.x0 + r, right = b.x1 - x + r, up = z - b.z0 + r, down = b.z1 - z + r, d = Math.min(left, right, up, down);
        if (d === left) x -= left + EPS; else if (d === right) x += right + EPS; else if (d === up) z -= up + EPS; else z += down + EPS;
      }
      changed = hit = true;
    });
    if (!changed) break;
  }
  return { x, z, hit };
}

/** SAT 네 축에서 포함 관계까지 고려한 최소 이동 벡터를 구합니다. */
export function collideBox(map: CityMap, cx: number, cz: number, h: number, halfL: number, halfW: number, y0 = 0, y1 = 2): { dx: number; dz: number; nx: number; nz: number; depth: number } | null {
  const c = Math.cos(h), s = Math.sin(h), rx = Math.abs(c) * halfL + Math.abs(s) * halfW, rz = Math.abs(s) * halfL + Math.abs(c) * halfW;
  let best: { dx: number; dz: number; nx: number; nz: number; depth: number } | null = null;
  nearby(gridOf(map), cx - rx, cz - rz, cx + rx, cz + rz, b => {
    if (y0 >= b.top || y1 <= 0) return;
    const bx = (b.x0 + b.x1) / 2, bz = (b.z0 + b.z1) / 2, ex = (b.x1 - b.x0) / 2, ez = (b.z1 - b.z0) / 2;
    let depth = Infinity, nx = 0, nz = 0;
    // Four separating axes without allocating 4 arrays per candidate box.
    for (let axis = 0; axis < 4; axis++) {
      const ax = axis === 0 ? 1 : axis === 1 ? 0 : axis === 2 ? c : -s;
      const az = axis === 0 ? 0 : axis === 1 ? 1 : axis === 2 ? s : c;
      const offset = (cx - bx) * ax + (cz - bz) * az;
      const d = halfL * Math.abs(c * ax + s * az) + halfW * Math.abs(-s * ax + c * az) + ex * Math.abs(ax) + ez * Math.abs(az) - Math.abs(offset);
      if (d <= EPS) return;
      if (d < depth) { depth = d; const sign = offset < 0 ? -1 : 1; nx = ax * sign; nz = az * sign; }
    }
    if (!best || depth > best.depth) best = { dx: nx * depth, dz: nz * depth, nx, nz, depth };
  });
  return best;
}

function rayBox(b: Box, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): number {
  let lo = 0, hi = maxT;
  // Scalar slab checks: avoid array construction during every AI sight ray
  // and chase-camera wall probe.
  for (let axis = 0; axis < 3; axis++) {
    const o = axis === 0 ? ox : axis === 1 ? oy : oz;
    const d = axis === 0 ? dx : axis === 1 ? dy : dz;
    const min = axis === 0 ? b.x0 : axis === 1 ? 0 : b.z0;
    const max = axis === 0 ? b.x1 : axis === 1 ? b.top : b.z1;
    if (Math.abs(d) < 1e-12) { if (o < min || o > max) return Infinity; }
    else { let a = (min - o) / d, b = (max - o) / d; if (a > b) [a, b] = [b, a]; lo = Math.max(lo, a); hi = Math.min(hi, b); if (lo > hi) return Infinity; }
  }
  return lo;
}
/** 3D 슬랩 검사와 수평 DDA로 첫 정적 충돌까지의 거리를 구합니다. */
export function rayStatic(map: CityMap, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): number {
  if (Number.isNaN(maxT) || maxT < 0 || !Number.isFinite(ox + oy + oz + dx + dy + dz) || dx * dx + dy * dy + dz * dz < 1e-24) return Infinity;
  const g = gridOf(map), mark = stamp(g); let best = Infinity;
  // 무한 광선도 유한한 도시 경계로 잘라 빈 셀을 끝없이 순회하지 않습니다.
  const extent = map.half + 64;
  let enter = 0, end = maxT;
  for (let axis = 0; axis < 2; axis++) {
    const o = axis === 0 ? ox : oz, d = axis === 0 ? dx : dz;
    if (!d) { if (Math.abs(o) > extent) return Infinity; continue; }
    let a = (-extent - o) / d, b = (extent - o) / d; if (a > b) [a, b] = [b, a]; enter = Math.max(enter, a); end = Math.min(end, b);
  }
  if (enter > end) return Infinity;
  let x = Math.floor((ox + dx * enter) / CELL), z = Math.floor((oz + dz * enter) / CELL);
  const sx = Math.sign(dx), sz = Math.sign(dz), tx = dx ? CELL / Math.abs(dx) : Infinity, tz = dz ? CELL / Math.abs(dz) : Infinity;
  let nx = dx ? ((x + (sx > 0 ? 1 : 0)) * CELL - ox) / dx : Infinity, nz = dz ? ((z + (sz > 0 ? 1 : 0)) * CELL - oz) / dz : Infinity;
  for (;;) {
    const ids = g.cells.get(key(x, z));
    if (ids) for (const id of ids) { if (g.marks[id] === mark) continue; g.marks[id] = mark; best = Math.min(best, rayBox(g.boxes[id], ox, oy, oz, dx, dy, dz, maxT)); }
    if (Math.min(nx, nz) > Math.min(end, best) || !sx && !sz) break;
    if (nx < nz) { x += sx; nx += tx; } else { z += sz; nz += tz; }
  }
  return best;
}

export function groundHeight(map: CityMap, x: number, z: number): number {
  let h = 0;
  for (const r of map.ramps) if (Math.abs(z - r.z) <= r.w / 2 && x >= r.x - r.len / 2 && x <= r.x + r.len / 2) h = Math.max(h, (x - r.x + r.len / 2) / r.len * r.h);
  return h;
}
export type Surface = 'road' | 'sidewalk' | 'grass' | 'building';
export function surfaceAt(map: CityMap, x: number, z: number): Surface {
  let building = false;
  nearby(gridOf(map), x, z, x, z, b => { if (b.building && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) building = true; });
  if (building) return 'building';
  const d = Math.min(Math.abs(x - clamp(Math.round((x + map.half) / map.pitch), 0, N) * map.pitch + map.half), Math.abs(z - clamp(Math.round((z + map.half) / map.pitch), 0, N) * map.pitch + map.half));
  if (d <= map.roadW / 2) return 'road'; if (d <= map.roadW / 2 + map.sidewalkW) return 'sidewalk';
  return 'grass';
}

/** 역주행 방향에 거리 벌점을 주고 가까운 셀부터 탐색합니다. */
export function nearestLane(map: CityMap, x: number, z: number, h?: number): number {
  if (!map.lanes.length || !Number.isFinite(x + z)) return -1;
  const cells = gridOf(map).lanes, xx = Math.floor(clamp(x, -map.half, map.half) / CELL), zz = Math.floor(clamp(z, -map.half, map.half) / CELL);
  let best = -1, score = Infinity;
  for (let ring = 0; ring <= Math.ceil(map.half * 2 / CELL) + 2; ring++) {
    for (let a = xx - ring; a <= xx + ring; a++) for (let b = zz - ring; b <= zz + ring; b++) {
      if (ring && a !== xx - ring && a !== xx + ring && b !== zz - ring && b !== zz + ring) continue;
      const ids = cells.get(key(a, b)); if (!ids) continue;
      for (const id of ids) { const n = map.lanes[id], d = (n.x - x) ** 2 + (n.z - z) ** 2 + (h === undefined ? 0 : 900 * (1 - Math.cos(n.h - h))); if (d < score || d === score && id < best) { score = d; best = id; } }
    }
    const edge = Math.min(x - (xx - ring) * CELL, (xx + ring + 1) * CELL - x, z - (zz - ring) * CELL, (zz + ring + 1) * CELL - z);
    if (edge >= 0 && edge * edge > score) break;
  }
  return best;
}

/** 이진 힙 A*. 휴리스틱은 각 도로의 실제 이동 거리 이하라 최단 경로를 보장합니다. */
export function findPath(map: CityMap, from: number, toX: number, toZ: number): number[] {
  if (!Number.isInteger(from) || !map.lanes[from]) return [];
  const goal = nearestLane(map, toX, toZ); if (goal < 0) return [];
  const nodes = map.lanes, target = nodes[goal], costs = new Float64Array(nodes.length).fill(Infinity), prev = new Int32Array(nodes.length).fill(-1), closed = new Uint8Array(nodes.length);
  const heap: Array<{ id: number; f: number }> = [];
  const push = (id: number, f: number): void => { let i = heap.length; heap.push({ id, f }); while (i) { const p = (i - 1) >> 1; if (heap[p].f <= f) break; heap[i] = heap[p]; i = p; } heap[i] = { id, f }; };
  const pop = (): number => { const first = heap[0], last = heap.pop()!; if (heap.length) { let i = 0; while (i * 2 + 1 < heap.length) { let c = i * 2 + 1; if (c + 1 < heap.length && heap[c + 1].f < heap[c].f) c++; if (heap[c].f >= last.f) break; heap[i] = heap[c]; i = c; } heap[i] = last; } return first.id; };
  costs[from] = 0; push(from, Math.hypot(nodes[from].x - target.x, nodes[from].z - target.z));
  let iterations = 0;
  while (heap.length && iterations < 5000) {
    const id = pop(); if (closed[id]) continue; closed[id] = 1; iterations++;
    if (id === goal) { const path: number[] = []; for (let n = id; n >= 0; n = prev[n]) path.push(n); return path.reverse(); }
    const a = nodes[id];
    for (const next of a.next) { const b = nodes[next]; if (!b || closed[next]) continue; const cost = costs[id] + Math.hypot(a.x - b.x, a.z - b.z); if (cost >= costs[next]) continue; costs[next] = cost; prev[next] = id; push(next, cost + Math.hypot(b.x - target.x, b.z - target.z)); }
  }
  return [];
}
export function signal(t: number, group: number): 'green' | 'yellow' | 'red' {
  if (group !== 0 && group !== 1) return 'green';
  const phase = ((t - group * 12) % 24 + 24) % 24;
  return phase < 9.5 ? 'green' : phase < 12 ? 'yellow' : 'red';
}
export function randomLane(map: CityMap, rng: () => number): LaneNode | null { return map.lanes.length ? map.lanes[clamp(Math.floor(rng() * map.lanes.length), 0, map.lanes.length - 1)] : null; }
export function isOpen(map: CityMap, x: number, z: number, r: number): boolean {
  if (!Number.isFinite(x + z + r) || r < 0 || Math.abs(x) + r > map.half || Math.abs(z) + r > map.half) return false;
  let open = true;
  nearby(gridOf(map), x - r, z - r, x + r, z + r, b => {
    const dx = x - clamp(x, b.x0, b.x1), dz = z - clamp(z, b.z0, b.z1);
    if (dx * dx + dz * dz < r * r || !dx && !dz) open = false;
  });
  return open;
}
