// LAST CITY — 건물 설치·철거 규칙 (순수 함수, DOM 비의존)
import { STRUCTS, type StructKind } from './defs';
import { rectFree, type CityMap } from './map';

/** 본부 중심에서 설치 가능한 반경. */
export const HQ_BUILD_RANGE = 720;
/** 보유 사업체·아군 건물 중심에서 설치 가능한 반경. */
export const ANCHOR_BUILD_RANGE = 460;
/** 고스트·클릭을 맞추는 설치 격자. */
export const BUILD_SNAP = 10;
/** 크리스탈 외형(대략 반지름 16~25)에 맞춘 여유. */
export const CRYSTAL_CLEARANCE = 16;
/** 사업체 출입 패드 앞을 비우기 위한 여유. */
export const BIZ_CLEARANCE = 24;
/** 철거 시 지불했던 건설비의 환급 비율. 대기열 비용은 별도로 전액 환급합니다. */
export const DEMOLISH_REFUND_RATE = 0.5;

export function snapBuildCoord(v: number): number {
  return Math.round(v / BUILD_SNAP) * BUILD_SNAP;
}

export function structCenter(s: { x: number; y: number; w: number; h: number }): { x: number; y: number } {
  return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
}

export function inBuildRange(
  cx: number, cy: number,
  hq: { x: number; y: number; w: number; h: number } | null,
  ownedBiz: { x: number; y: number }[],
  ownedStructs: { x: number; y: number; w: number; h: number }[],
): boolean {
  if (hq) {
    const c = structCenter(hq);
    if (Math.hypot(cx - c.x, cy - c.y) < HQ_BUILD_RANGE) return true;
  }
  for (const b of ownedBiz) if (Math.hypot(b.x - cx, b.y - cy) < ANCHOR_BUILD_RANGE) return true;
  for (const s of ownedStructs) {
    const c = structCenter(s);
    if (Math.hypot(cx - c.x, cy - c.y) < ANCHOR_BUILD_RANGE) return true;
  }
  return false;
}

export function blockedByCrystal(
  cx: number, cy: number, w: number, h: number,
  crystals: { x: number; y: number; amount: number }[],
): boolean {
  const rx = w / 2 + CRYSTAL_CLEARANCE, ry = h / 2 + CRYSTAL_CLEARANCE;
  for (const c of crystals) if (c.amount > 0 && Math.abs(c.x - cx) < rx && Math.abs(c.y - cy) < ry) return true;
  return false;
}

export function blockedByBizPad(
  cx: number, cy: number, w: number, h: number,
  businesses: { x: number; y: number }[],
): boolean {
  const rx = w / 2 + BIZ_CLEARANCE, ry = h / 2 + BIZ_CLEARANCE;
  for (const b of businesses) if (Math.abs(b.x - cx) < rx && Math.abs(b.y - cy) < ry) return true;
  return false;
}

export function canPlaceAt(opts: {
  cx: number; cy: number; w: number; h: number; map: CityMap;
  hq: { x: number; y: number; w: number; h: number } | null;
  ownedBiz: { x: number; y: number }[];
  ownedStructs: { x: number; y: number; w: number; h: number }[];
  crystals: { x: number; y: number; amount: number }[];
  businesses: { x: number; y: number }[];
}): boolean {
  const { cx, cy, w, h } = opts;
  if (!inBuildRange(cx, cy, opts.hq, opts.ownedBiz, opts.ownedStructs)) return false;
  if (!rectFree(opts.map, cx - w / 2, cy - h / 2, w, h)) return false;
  if (blockedByCrystal(cx, cy, w, h, opts.crystals)) return false;
  if (blockedByBizPad(cx, cy, w, h, opts.businesses)) return false;
  return true;
}

export function demolishRefund(crystalCost: number, cashCost: number, rate = DEMOLISH_REFUND_RATE): { crystal: number; cash: number } {
  return { crystal: Math.floor(crystalCost * rate), cash: Math.floor(cashCost * rate) };
}

export function demolishReject(
  s: { kind: StructKind; f: number; alive: boolean } | null | undefined,
  fi: number,
  opts?: { duel?: unknown },
): string {
  if (!s || !s.alive) return '철거할 건물이 없습니다';
  if (opts?.duel) return '결투에서는 철거할 수 없습니다';
  if (s.f !== fi) return '아군 건물만 철거할 수 있습니다';
  if (s.kind === 'hq') return '본부는 철거할 수 없습니다';
  return '';
}

export function footprintOf(kind: StructKind, cx: number, cy: number): { x: number; y: number; w: number; h: number } {
  const d = STRUCTS[kind];
  return { x: cx - d.w / 2, y: cy - d.h / 2, w: d.w, h: d.h };
}
