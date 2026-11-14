// LAST CITY — 사업체 내부 공간 배치. DOM·Three.js 에 의존하지 않아 헤드리스 테스트가 가능합니다.
// 좌표계: x = 오른쪽, y = 안쪽 → 입구(남쪽 벽). 출입문은 y = D 쪽에 있고 카운터는 안쪽 벽 가까이에 있습니다.
import type { BizKind } from './defs';

export interface Rect { x0: number; y0: number; x1: number; y1: number }
/** 충돌 상자. style 은 3D 렌더러가 모양을 고를 때 씁니다. */
export interface Solid extends Rect { style: SolidStyle; h: number }
export type SolidStyle = 'counter' | 'shelf' | 'fridge' | 'rack' | 'dj' | 'speaker' | 'sofa' | 'tank' | 'machine' | 'crate' | 'slot' | 'table' | 'column' | 'bench' | 'glass';
export interface InteriorLayout {
  kind: BizKind; w: number; d: number; h: number;
  /** 플레이어가 서는 위치와 방향(라디안) */
  spawn: { x: number; y: number; ang: number };
  /** 출입문 앞 — 이 안에서 E 를 누르면 밖으로 나갑니다 */
  door: { x: number; y: number };
  /** 카운터 앞 — 이 안에서 E 를 누르면 거래 창이 열립니다 */
  counterSpot: { x: number; y: number };
  clerk: { x: number; y: number };
  solids: Solid[];
}

export const DOOR_REACH = 64, COUNTER_REACH = 78, PLAYER_R = 13, INTERIOR_SPEED = 205;
const S = (style: SolidStyle, x0: number, y0: number, x1: number, y1: number, h: number): Solid => ({ style, x0, y0, x1, y1, h });
const W = 440, D = 340, H = 132;
const base = (kind: BizKind, counterSpot: { x: number; y: number }, clerk: { x: number; y: number }, solids: Solid[]): InteriorLayout => ({
  kind, w: W, d: D, h: H, spawn: { x: W / 2, y: D - 52, ang: -Math.PI / 2 }, door: { x: W / 2, y: D - 22 }, counterSpot, clerk, solids,
});

export const INTERIORS: Record<BizKind, InteriorLayout> = {
  // 편의점: 계산대 + 진열 선반 + 안쪽 냉장 진열대
  store: base('store', { x: 110, y: 118 }, { x: 110, y: 30 }, [
    S('counter', 30, 54, 190, 84, 40), S('fridge', 230, 4, 424, 32, 108),
    S('shelf', 240, 108, 400, 130, 74), S('shelf', 240, 176, 400, 198, 74), S('shelf', 40, 176, 190, 198, 74), S('rack', 36, 244, 82, 268, 64),
  ]),
  // 나이트클럽: 안쪽 DJ 부스, 오른쪽 바, 양옆 소파와 스피커
  club: base('club', { x: 322, y: 170 }, { x: 420, y: 170 }, [
    S('dj', 150, 8, 290, 52, 44), S('speaker', 18, 8, 64, 58, 84), S('speaker', 376, 8, 422, 58, 84),
    S('counter', 362, 86, 404, 256, 46), S('sofa', 18, 110, 70, 196, 30), S('sofa', 18, 226, 70, 312, 30),
  ]),
  // 정제 공장: 관제 데스크, 정제 탱크, 기계, 자재 상자
  plant: base('plant', { x: 92, y: 106 }, { x: 92, y: 26 }, [
    S('counter', 28, 40, 160, 70, 42), S('tank', 236, 36, 324, 132, 110), S('tank', 346, 36, 424, 132, 110),
    S('machine', 232, 198, 308, 262, 62), S('crate', 360, 220, 420, 290, 44), S('crate', 30, 232, 84, 290, 36),
  ]),
  // 카지노: 안쪽 환전 창구, 슬롯머신 줄, 룰렛·포커 테이블
  casino: base('casino', { x: 220, y: 100 }, { x: 220, y: 22 }, [
    S('counter', 150, 36, 290, 66, 44), S('slot', 18, 100, 50, 270, 70), S('slot', 390, 100, 422, 270, 70),
    S('table', 104, 168, 188, 238, 36), S('table', 252, 168, 336, 238, 36),
  ]),
  // 중앙은행: 긴 창구, 대리석 기둥, 대기 의자
  bank: base('bank', { x: 220, y: 126 }, { x: 220, y: 40 }, [
    S('glass', 56, 62, 384, 92, 58), S('column', 48, 176, 72, 200, 124), S('column', 368, 176, 392, 200, 124),
    S('column', 48, 246, 72, 270, 124), S('column', 368, 246, 392, 270, 124), S('bench', 128, 226, 196, 248, 26), S('bench', 244, 226, 312, 248, 26),
  ]),
  // 무기상: 유리 진열 카운터, 탄약 상자
  gunshop: base('gunshop', { x: 220, y: 136 }, { x: 220, y: 44 }, [
    S('glass', 56, 70, 384, 102, 46), S('crate', 26, 198, 92, 262, 40), S('crate', 348, 198, 414, 262, 40),
  ]),
};

/** 원(반지름 r)이 상자와 겹치면 밀어냅니다. */
function pushRect(p: { x: number; y: number }, r: number, b: Rect): void {
  const nx = Math.max(b.x0, Math.min(p.x, b.x1)), ny = Math.max(b.y0, Math.min(p.y, b.y1)), dx = p.x - nx, dy = p.y - ny, d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return;
  if (d2 > 1e-6) { const d = Math.sqrt(d2); p.x = nx + dx / d * r; p.y = ny + dy / d * r; return; }
  // 중심이 상자 안: 가장 가까운 면으로 밀어냄
  const l = p.x - b.x0, rr = b.x1 - p.x, t = p.y - b.y0, bt = b.y1 - p.y, m = Math.min(l, rr, t, bt);
  if (m === l) p.x = b.x0 - r; else if (m === rr) p.x = b.x1 + r; else if (m === t) p.y = b.y0 - r; else p.y = b.y1 + r;
}
/** 벽과 가구에 부딪히지 않도록 위치를 보정합니다. */
export function resolveInterior(lay: InteriorLayout, p: { x: number; y: number }): void {
  for (let k = 0; k < 2; k++) {
    p.x = Math.max(PLAYER_R, Math.min(lay.w - PLAYER_R, p.x)); p.y = Math.max(PLAYER_R, Math.min(lay.d - PLAYER_R, p.y));
    for (const s of lay.solids) pushRect(p, PLAYER_R, s);
  }
  p.x = Math.max(PLAYER_R, Math.min(lay.w - PLAYER_R, p.x)); p.y = Math.max(PLAYER_R, Math.min(lay.d - PLAYER_R, p.y));
}
export const nearCounter = (lay: InteriorLayout, x: number, y: number): boolean => Math.hypot(x - lay.counterSpot.x, y - lay.counterSpot.y) < COUNTER_REACH;
export const nearDoor = (lay: InteriorLayout, x: number, y: number): boolean => Math.hypot(x - lay.door.x, y - lay.door.y) < DOOR_REACH;
