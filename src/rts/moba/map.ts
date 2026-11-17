// FRONTLINE 롤식 라인전 — 지형. 길목·강·정글 길을 비우고, 나머지에 바위를 점대칭으로 깔아 정글 벽을 만듭니다.
import { CAMPS_HALF, LANE_PTS, LANES, NEXUS, RIVER, RIVER_CAMPS, SIZE, flip, type Camp, type Pt } from './config';

export interface Boulder { x: number; y: number; r: number }
export interface MobaMap { size: number; terrain: Uint8Array; boulders: Boulder[]; camps: Camp[] }

const segDist = (px: number, py: number, a: Pt, b: Pt): number => {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2)) : 0;
  return Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t));
};
export const polyDist = (px: number, py: number, pts: Pt[]): number => { let d = Infinity; for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(px, py, pts[i - 1], pts[i])); return d; };
/** 점에서 가장 가까운 길목 위의 점. */
export function nearestOn(px: number, py: number, pts: Pt[]): Pt {
  let best = pts[0], bd = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2)) : 0;
    const q = { x: a.x + dx * t, y: a.y + dy * t }, d = Math.hypot(px - q.x, py - q.y); if (d < bd) { bd = d; best = q; }
  }
  return best;
}

let cached: MobaMap | null = null;
export function buildMobaMap(): MobaMap {
  if (cached) return cached;
  const n = SIZE, terrain = new Uint8Array(n * n), carve = new Uint8Array(n * n);
  const camps: Camp[] = [...CAMPS_HALF, ...CAMPS_HALF.map(c => ({ id: c.id.replace(/-a$/, '-x').replace(/-b$/, '-y'), at: flip(c.at), mobs: c.mobs.map(m => ({ ...m, dx: -m.dx, dy: -m.dy })) })), ...RIVER_CAMPS];
  const lanes = LANES.map(l => LANE_PTS[l]);
  const near = (x: number, y: number, r: number, set: (i: number) => void): void => { for (let j = Math.floor(y - r); j <= Math.ceil(y + r); j++) for (let i = Math.floor(x - r); i <= Math.ceil(x + r); i++) if (i >= 0 && j >= 0 && i < n && j < n && Math.hypot(i + 0.5 - x, j + 0.5 - y) <= r) set(j * n + i); };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const cx = x + 0.5, cy = y + 0.5; let free = lanes.some(p => polyDist(cx, cy, p) < 5.2) || polyDist(cx, cy, RIVER) < 3.4 || NEXUS.some(b => Math.hypot(cx - b.x, cy - b.y) < 13);
    if (!free) for (const c of camps) if (Math.hypot(cx - c.at.x, cy - c.at.y) < 4.6) { free = true; break; }
    if (free) carve[y * n + x] = 1;
  }
  // 정글 몬스터 둥지에서 가장 가까운 길목까지 통로를 냅니다.
  for (const c of camps) {
    let bp: Pt = c.at, bd = Infinity; for (const p of [...lanes, RIVER]) { const q = nearestOn(c.at.x, c.at.y, p), d = Math.hypot(q.x - c.at.x, q.y - c.at.y); if (d < bd) { bd = d; bp = q; } }
    const steps = Math.ceil(bd / 0.8); for (let k = 0; k <= steps; k++) near(c.at.x + (bp.x - c.at.x) * k / steps, c.at.y + (bp.y - c.at.y) * k / steps, 1.7, i => { carve[i] = 1; });
  }
  // 바위: 시드가 정해진 난수로 한쪽 절반에 깔고 점대칭으로 복사합니다.
  let seed = 20240917; const rnd = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const boulders: Boulder[] = [];
  const blocked = (x: number, y: number, r: number): boolean => { for (let j = Math.floor(y - r); j <= Math.ceil(y + r); j++) for (let i = Math.floor(x - r); i <= Math.ceil(x + r); i++) { if (i < 0 || j < 0 || i >= n || j >= n) continue; if (Math.hypot(i + 0.5 - x, j + 0.5 - y) <= r + 0.6 && carve[j * n + i]) return true; } return false; };
  for (let k = 0; k < 900 && boulders.length < 150; k++) {
    const x = 1 + rnd() * (n - 2), y = 1 + rnd() * (n - 2), r = 1.3 + rnd() * 2; if (x + y > n) continue; // 한쪽 절반만
    if (blocked(x, y, r) || blocked(n - x, n - y, r)) continue;
    if (boulders.some(b => Math.hypot(b.x - x, b.y - y) < b.r + r - 0.6)) continue;
    boulders.push({ x, y, r }, { x: n - x, y: n - y, r }); near(x, y, r, i => { terrain[i] = 1; }); near(n - x, n - y, r, i => { terrain[i] = 1; });
  }
  // 바깥 테두리
  for (let i = 0; i < n; i++) { terrain[i] = 1; terrain[(n - 1) * n + i] = 1; terrain[i * n] = 1; terrain[i * n + n - 1] = 1; }
  for (const b of NEXUS) near(b.x, b.y, 3, i => { terrain[i] = 0; });
  cached = { size: n, terrain, boulders, camps };
  return cached;
}
