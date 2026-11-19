// SPEED RUSH — 코스 위 아이템. 상자를 먹으면 한 칸에 아이템 하나를 들고, E 키(또는 ITEM 버튼)로 씁니다.
// 모두 그 판에서만 쓰는 일회성 효과입니다(영구 강화 없음). 솔로 레이스에서만 켜지고, 온라인 대전에는 나오지 않습니다. (THREE·DOM 의존 없음)
import { idxDelta, wrapIdx, type Track } from './track';

export type ItemKind = 'cell' | 'shield' | 'oil' | 'surge';
export interface ItemDef { name: string; blurb: string; color: string }
export const ITEMS: Readonly<Record<ItemKind, ItemDef>> = {
  cell: { name: 'NITRO CELL', blurb: '니트로 50% 충전', color: '#41c8ff' },
  shield: { name: 'SHIELD', blurb: '8초간 충돌에도 속도·드리프트 유지, 부딪힌 라이벌은 휘청', color: '#7dffb0' },
  oil: { name: 'OIL SLICK', blurb: '뒤에 오일을 뿌려 밟은 라이벌을 느리게 만듦', color: '#b69cff' },
  surge: { name: 'SURGE', blurb: '3.5초 동안 강한 가속(부스트)', color: '#ffb23d' },
};
export const ITEM_KINDS: ReadonlyArray<ItemKind> = ['cell', 'shield', 'oil', 'surge'];

export const SHIELD_SECONDS = 8;
export const SURGE_SECONDS = 3.5;
export const CELL_AMOUNT = 0.5;
export const OIL_SECONDS = 18;
/** 오일을 밟은 라이벌이 느려지는 시간(초)과 그 사이 최고속 배율 */
export const OIL_STUN = 1.8;
export const OIL_SLOW = 0.5;
/** 상자를 다시 먹을 수 있게 되는 시간(초) */
export const CRATE_RESPAWN = 8;
const CRATE_RADIUS = 2.9, OIL_RADIUS = 3.1;

export interface Crate { x: number; z: number; y: number; idx: number; /** >0 이면 먹혀서 다시 나타나기를 기다리는 중 */ wait: number }
export interface Oil { x: number; z: number; y: number; idx: number; life: number; /** 이미 밟고 지나간 라이벌 id */ hit: number[] }
export interface ItemState {
  crates: Crate[]; oils: Oil[]; held: ItemKind | null; shield: number;
  /** 아이템을 뽑는 난수 상태(같은 판은 같은 순서) */
  rng: number; picked: number;
}

/** 시드가 같으면 같은 수열을 돌려주는 가벼운 난수(mulberry32). 상태는 ItemState.rng 에 둡니다. */
export function nextRandom(it: Pick<ItemState, 'rng'>): number {
  it.rng = (it.rng + 0x6d2b79f5) >>> 0;
  let t = it.rng; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** 한 바퀴 중 상자 묶음이 놓일 위치(비율). 출발선과 부스트 패드 근처는 피합니다. */
const SPOTS = [0.1, 0.24, 0.38, 0.53, 0.68, 0.83];
/** 상자 묶음(세 개가 나란히)의 배치를 계산합니다. */
export function crateSpots(t: Track): Array<{ idx: number; lat: number }> {
  const out: Array<{ idx: number; lat: number }> = [], side = Math.min(5.5, t.halfWidth * 0.42);
  for (const f of SPOTS) {
    let idx = Math.round(f * t.n);
    for (let tries = 0; tries < 6 && t.pads.some(p => Math.abs(idxDelta(t, idx, p)) < 8); tries++) idx += 6;
    idx = wrapIdx(t, idx);
    for (const lat of [-side, 0, side]) out.push({ idx, lat });
  }
  return out;
}

export function createItems(t: Track, seed = 1): ItemState {
  const crates = crateSpots(t).map(s => ({ idx: s.idx, x: t.x[s.idx] - t.tz[s.idx] * s.lat, z: t.z[s.idx] + t.tx[s.idx] * s.lat, y: t.y[s.idx], wait: 0 }));
  return { crates, oils: [], held: null, shield: 0, rng: seed >>> 0, picked: 0 };
}

/** 순위에 따라 아이템을 뽑습니다. 앞서 있으면 방해 아이템, 뒤처지면 가속 아이템이 잘 나옵니다. place 는 1부터. */
export function rollItem(it: Pick<ItemState, 'rng'>, place: number, field: number): ItemKind {
  const behind = field <= 1 ? 0 : Math.min(1, Math.max(0, (place - 1) / (field - 1)));
  const w: Record<ItemKind, number> = { cell: 3, shield: 2.2 - behind, oil: 3 - 2.2 * behind, surge: 0.8 + 3.2 * behind };
  const total = ITEM_KINDS.reduce((s, k) => s + Math.max(0.1, w[k]), 0); let r = nextRandom(it) * total;
  for (const k of ITEM_KINDS) { r -= Math.max(0.1, w[k]); if (r <= 0) return k; }
  return 'cell';
}

export interface CarPoint { x: number; z: number }
/** 내 차가 닿은 상자를 먹습니다. 이미 아이템을 들고 있으면 상자는 그대로 둡니다. 먹은 아이템을 돌려줍니다. */
export function collectCrate(it: ItemState, car: CarPoint, place: number, field: number): ItemKind | null {
  if (it.held) return null;
  for (const c of it.crates) {
    if (c.wait > 0) continue;
    if (Math.hypot(c.x - car.x, c.z - car.z) < CRATE_RADIUS) { c.wait = CRATE_RESPAWN; it.picked++; it.held = rollItem(it, place, field); return it.held; }
  }
  return null;
}

/** 시간이 흐릅니다: 상자 재생성, 실드·오일 수명. */
export function tickItems(it: ItemState, dt: number): void {
  for (const c of it.crates) if (c.wait > 0) c.wait = Math.max(0, c.wait - dt);
  it.shield = Math.max(0, it.shield - dt);
  for (const o of it.oils) o.life -= dt;
  if (it.oils.some(o => o.life <= 0)) it.oils = it.oils.filter(o => o.life > 0);
}

/** 오일을 내 차 바로 뒤에 놓습니다. */
export function dropOil(it: ItemState, car: { x: number; z: number; y: number; h: number; idx: number }): void {
  it.oils.push({ x: car.x - Math.cos(car.h) * 4.2, z: car.z - Math.sin(car.h) * 4.2, y: car.y, idx: car.idx, life: OIL_SECONDS, hit: [] });
  if (it.oils.length > 6) it.oils.shift();
}

/** 이 차가 아직 밟지 않은 오일 위에 있는지 확인하고, 처음 밟은 것이면 true. */
export function touchOil(it: ItemState, id: number, car: CarPoint): boolean {
  for (const o of it.oils) {
    if (o.hit.includes(id) || Math.hypot(o.x - car.x, o.z - car.z) > OIL_RADIUS) continue;
    o.hit.push(id); return true;
  }
  return false;
}
