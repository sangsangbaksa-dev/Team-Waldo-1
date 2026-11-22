import type { GameMap } from './world';

const smooth = (v: number): number => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };
const distance = (x: number, z: number, ax: number, az: number, bx: number, bz: number): number => {
  const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
};
const hash = (seed: number, x: number, z: number): number => {
  let n = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};
const noise = (seed: number, x: number, z: number): number => {
  const ix = Math.floor(x), iz = Math.floor(z), u = smooth(x - ix), v = smooth(z - iz);
  const a = hash(seed, ix, iz) * (1 - u) + hash(seed, ix + 1, iz) * u;
  const b = hash(seed, ix, iz + 1) * (1 - u) + hash(seed, ix + 1, iz + 1) * u;
  return (a * (1 - v) + b * v) * 2 - 1;
};

/** 지형 높낮이(m). 마을·시설·길·물·바위 언덕·절벽 둘레는 평평하게(0) 두고, 그 사이 들판에 구릉·능선·골짜기를 만듭니다.
 *  화면(땅 메시)과 게임(발 높이·총알·시야·낙하)이 같은 값을 씁니다. 시드로만 정해지므로 온라인 참가자 모두 같은 지형을 봅니다. */
export function groundHeight(seed: number, map: GameMap, x: number, z: number): number {
  let clearance = map.half - Math.max(Math.abs(x), Math.abs(z)) - 14;
  if (clearance <= 0) return 0;
  for (const c of map.compounds) clearance = Math.min(clearance, Math.hypot(x - c.x, z - c.z) - c.r - 4);
  for (const c of map.sites) clearance = Math.min(clearance, Math.hypot(x - c.x, z - c.z) - c.r - 4);
  if (clearance <= 0) return 0;
  for (const p of map.terrain.ponds) { const c = Math.cos(p.ry), s = Math.sin(p.ry), dx = x - p.x, dz = z - p.z; const q = Math.hypot((dx * c + dz * s) / p.rx, (-dx * s + dz * c) / p.rz); clearance = Math.min(clearance, (q - 1) * Math.min(p.rx, p.rz) - 4); }
  for (const river of map.terrain.rivers) for (let i = 0; i + 1 < river.pts.length; i++) clearance = Math.min(clearance, distance(x, z, ...river.pts[i], ...river.pts[i + 1]) - river.w / 2 - 4);
  for (const h of map.terrain.hills) clearance = Math.min(clearance, Math.hypot(x - h.x, z - h.z) - h.r - 3);
  for (const c of map.terrain.cliffs) clearance = Math.min(clearance, Math.hypot(Math.max(c.x0 - x, 0, x - c.x1), Math.max(c.z0 - z, 0, z - c.z1)) - 3);
  for (const b of map.terrain.bridges) clearance = Math.min(clearance, Math.hypot(x - b.x, z - b.z) - b.len / 2 - 6);
  if (clearance <= 0) return 0;
  // 길은 땅을 따라 오르내리되, 길 둘레는 굴곡을 절반으로 눌러 차가 달릴 만하게 둡니다.
  let road = Infinity; for (const [i, j] of map.roads) { const a = map.compounds[i], b = map.compounds[j]; road = Math.min(road, distance(x, z, a.x, a.z, b.x, b.z)); }
  // 넓게 구르는 구릉 + 날 선 능선 + 잔물결. 들판 한가운데일수록 높고, 평지 쪽으로 28m 에 걸쳐 부드럽게 내려앉습니다.
  const roll = 0.6 * noise(seed, x / 110, z / 110) + 0.28 * noise(seed + 1, x / 48, z / 48) + 0.12 * noise(seed + 2, x / 20, z / 20);
  const ridge = 1 - Math.abs(noise(seed + 3, x / 80 + 7, z / 80 - 3)), ridged = ridge * ridge * ridge;
  const deep = smooth((clearance - 15) / 45), tame = 0.45 + 0.55 * smooth((road - 5) / 22);
  return smooth(clearance / 28) * tame * (8 * roll + 3.5 + ridged * (4 + 10 * deep));
}

/** 2m 격자에 미리 구워 둔 높이(쌍선형 보간). 매 프레임 수백 번 묻는 발 높이·총알·시야 계산용입니다. */
interface Field { min: number; n: number; cell: number; h: Float32Array; max: number }
const fields = new WeakMap<GameMap, Field>();
function fieldOf(map: GameMap): Field {
  let f = fields.get(map); if (f) return f;
  const cell = 2, min = -map.half, n = Math.ceil((map.half * 2) / cell) + 1, h = new Float32Array(n * n); let max = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const v = groundHeight(map.seed, map, min + i * cell, min + j * cell); h[j * n + i] = v; if (v > max) max = v; }
  f = { min, n, cell, h, max }; fields.set(map, f); return f;
}
/** (x,z) 지점의 땅 높이. 지도 밖은 0. */
export function heightAt(map: GameMap, x: number, z: number): number {
  const f = fieldOf(map), u = (x - f.min) / f.cell, v = (z - f.min) / f.cell;
  if (u < 0 || v < 0 || u >= f.n - 1 || v >= f.n - 1) return 0;
  const i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j, k = j * f.n + i, h = f.h;
  return (h[k] * (1 - a) + h[k + 1] * a) * (1 - b) + (h[k + f.n] * (1 - a) + h[k + f.n + 1] * a) * b;
}
/** 땅의 가장 높은 곳(광선이 이보다 위로 가면 더 볼 필요가 없음). */
export function reliefMax(map: GameMap): number { return fieldOf(map).max; }
/** 광선이 땅에 처음 닿는 거리(없으면 Infinity). 땅과의 높이차만큼 성큼성큼 건너뛰어 빠릅니다. */
export function rayTerrain(map: GameMap, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): number {
  const top = reliefMax(map); if (top <= 0.05) return Infinity;
  let t = 0, prev = 0, prevGap = oy - heightAt(map, ox, oz);
  if (prevGap < 0) return 0;
  while (t < maxT) {
    const y = oy + dy * t; if (y > top + 0.5 && dy >= 0) return Infinity;
    t = Math.min(maxT, t + Math.max(0.6, prevGap * 1.4));
    const gap = oy + dy * t - heightAt(map, ox + dx * t, oz + dz * t);
    if (gap < 0) { // 직전 칸과 이번 칸 사이에서 닿은 곳을 비례로 찾습니다
      return prev + (t - prev) * (prevGap / (prevGap - gap));
    }
    prev = t; prevGap = gap; if (t >= maxT) break;
  }
  return Infinity;
}
