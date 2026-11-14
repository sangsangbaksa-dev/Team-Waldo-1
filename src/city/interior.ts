// LAST CITY — 사업체 내부 공간 배치. DOM·Three.js 에 의존하지 않아 헤드리스 테스트가 가능합니다.
// 좌표계: x = 오른쪽, y = 안쪽 → 입구(남쪽 벽). 출입문은 y = D 쪽에 있고 카운터는 안쪽 벽 가까이에 있습니다.
// 크기는 모두 사람 눈금(scale.ts 의 HUMAN, 1m ≈ 21 월드 단위)에 맞춥니다: 계산대 1.05m, 선반 1.6m, 천장 3.3m, 사람 키 1.9m.
import type { BizKind } from './defs';
import { HUMAN } from './scale';

export interface Rect { x0: number; y0: number; x1: number; y1: number }
/** 가구의 어느 쪽에 의자·스툴이 놓이는지: 그 방향으로 충돌 상자만 넓힙니다(눈에 보이는 가구는 그대로). */
export interface Pad { n?: number; s?: number; e?: number; w?: number }
/** 충돌 상자. style 은 3D 렌더러가 모양을 고를 때 씁니다. 'void' 는 눈에 안 보이는 충돌 전용 상자입니다. */
export interface Solid extends Rect { style: SolidStyle; h: number; pad?: Pad }
export type SolidStyle = 'counter' | 'shelf' | 'fridge' | 'rack' | 'dj' | 'speaker' | 'sofa' | 'tank' | 'machine' | 'console' | 'crate' | 'slot' | 'table' | 'column' | 'bench' | 'glass' | 'bar' | 'lowtable' | 'void';

/** 앉거나 선 사람 한 명. ang 는 바라보는 방향(라디안, atan2(y, x): 동쪽 0, 남쪽(입구) π/2, 북쪽(안쪽) -π/2). */
export type Pose = 'stand' | 'sit' | 'desk';
export type SeatKind = 'none' | 'stool' | 'chair' | 'sofa' | 'bench';
export type FolkAct = 'idle' | 'eat' | 'talk' | 'read' | 'dance' | 'work' | 'browse';
export interface Folk { x: number; y: number; ang: number; pose: Pose; seat: SeatKind; model: string; role: 'clerk' | 'staff' | 'guest'; act: FolkAct }
/** 앉는 면의 높이(m). 소파·벤치 가구의 h 와 같아야 합니다. */
export const SEAT_M: Record<SeatKind, number> = { none: 0, stool: 0.62, chair: 0.46, sofa: 0.42, bench: 0.45 };

export interface InteriorLayout {
  kind: BizKind; w: number; d: number; h: number;
  /** 플레이어가 서는 위치와 방향(라디안) */
  spawn: { x: number; y: number; ang: number };
  /** 출입문 앞 — 이 안에서 E 를 누르면 밖으로 나갑니다 */
  door: { x: number; y: number };
  /** 카운터 앞 — 이 안에서 E 를 누르면 거래 창이 열립니다 */
  counterSpot: { x: number; y: number };
  /** 카운터 안쪽의 점원이 서(앉)는 자리. folk 의 첫 번째 항목과 같습니다. */
  clerk: { x: number; y: number };
  solids: Solid[];
  /** 가게 안의 사람들(점원·직원·손님). 첫 번째가 카운터 점원입니다. */
  folk: Folk[];
}

export const DOOR_REACH = 44, COUNTER_REACH = 52, PLAYER_R = 9, INTERIOR_SPEED = 130, FOLK_R = 6;
/** 출입문 반폭(출입문 폭 2.3m). 3D 와 충돌이 같은 값을 씁니다. */
export const DOOR_HALF = 24;
const S = (style: SolidStyle, x0: number, y0: number, x1: number, y1: number, h: number, pad?: Pad): Solid => ({ style, x0, y0, x1, y1, h, pad });
const W = 330, D = 260, H = 70;
const N = -Math.PI / 2, SO = Math.PI / 2, E = 0, WE = Math.PI;
const F = (model: string, role: Folk['role'], pose: Pose, seat: SeatKind, x: number, y: number, ang: number, act: FolkAct = 'idle'): Folk => ({ x, y, ang, pose, seat, model, role, act });
const stand = (model: string, x: number, y: number, ang: number, act: FolkAct = 'idle', role: Folk['role'] = 'guest'): Folk => F(model, role, 'stand', 'none', x, y, ang, act);
const sit = (model: string, seat: SeatKind, x: number, y: number, ang: number, act: FolkAct = 'idle', role: Folk['role'] = 'guest'): Folk => F(model, role, 'sit', seat, x, y, ang, act);
const base = (kind: BizKind, counterSpot: { x: number; y: number }, solids: Solid[], folk: Folk[]): InteriorLayout => ({
  kind, w: W, d: D, h: H, spawn: { x: W / 2, y: D - 34, ang: N }, door: { x: W / 2, y: D - 14 }, counterSpot, clerk: { x: folk[0].x, y: folk[0].y }, solids, folk,
});

export const INTERIORS: Record<BizKind, InteriorLayout> = {
  // 편의점: 계산대(점원은 담배 진열장 앞) + 진열 선반 + 안쪽 냉장 진열대 + 창가 스낵 바(스툴)
  store: base('store', { x: 62, y: 100 }, [
    S('fridge', 112, 3, 324, 20, 46), S('counter', 16, 54, 112, 76, 22), S('counter', 100, 22, 112, 54, 22), S('shelf', 16, 3, 100, 15, 40),
    S('shelf', 136, 98, 290, 112, 34), S('shelf', 136, 146, 290, 160, 34), S('shelf', 20, 136, 92, 150, 34), S('rack', 24, 188, 66, 202, 30),
    S('bar', 312, 178, 326, 246, 22, { w: 28 }),
  ], [
    stand('civ4', 58, 38, SO, 'work', 'clerk'), sit('civ2', 'stool', 297, 190, E, 'eat'), sit('civ6', 'stool', 297, 234, E, 'talk'), stand('civ5', 206, 44, N, 'browse'),
  ]),
  // 나이트클럽: 안쪽 DJ 부스, 오른쪽 바(스툴), 왼쪽 소파와 낮은 탁자, 가운데 댄스 플로어
  club: base('club', { x: 258, y: 176 }, [
    S('dj', 100, 26, 230, 40, 22), S('void', 100, 4, 230, 26, 0), S('speaker', 12, 4, 46, 30, 40), S('speaker', 284, 4, 318, 30, 40),
    S('counter', 278, 70, 306, 204, 23, { e: 24 }), S('void', 252, 72, 274, 150, 0),
    S('sofa', 12, 84, 38, 146, 8.8), S('sofa', 12, 170, 38, 232, 8.8), S('lowtable', 46, 94, 62, 136, 9), S('lowtable', 46, 180, 62, 222, 9),
  ], [
    stand('civ7', 316, 176, WE, 'work', 'clerk'), stand('civ3', 165, 17, SO, 'work', 'staff'),
    sit('civ3', 'stool', 263, 86, E, 'talk'), sit('civ6', 'stool', 263, 108, E, 'talk'), sit('civ8', 'stool', 263, 130, E, 'idle'),
    sit('civ', 'sofa', 26, 100, E, 'talk'), sit('civ7', 'sofa', 26, 126, E, 'talk'), sit('civ5', 'sofa', 26, 188, E, 'idle'), sit('civ2', 'sofa', 26, 214, E, 'talk'),
    stand('civ4', 150, 126, 0.6, 'dance'), stand('civ8', 182, 150, -2.2, 'dance'), stand('civ6', 206, 118, 2.4, 'dance'),
  ]),
  // 정제 공장: 관제 데스크(의자), 정제 탱크, 압축기, 자재 상자, 휴게 벤치
  plant: base('plant', { x: 62, y: 98 }, [
    S('counter', 16, 50, 108, 72, 22), S('counter', 96, 22, 108, 50, 22), S('console', 16, 3, 96, 14, 44),
    S('tank', 150, 18, 206, 74, 62), S('tank', 228, 18, 284, 74, 62), S('machine', 226, 112, 274, 148, 36),
    S('crate', 262, 170, 312, 226, 24), S('crate', 18, 174, 56, 214, 20), S('bench', 98, 196, 150, 208, 9.5),
  ], [
    sit('civ', 'chair', 58, 36, SO, 'work', 'clerk'), sit('civ5', 'bench', 114, 202, SO, 'talk'), sit('civ7', 'bench', 134, 202, SO, 'eat'), stand('civ3', 250, 100, SO, 'work', 'staff'),
  ]),
  // 카지노: 안쪽 환전 창구, 슬롯머신 줄(스툴), 룰렛·포커 테이블(딜러와 손님)
  casino: base('casino', { x: 166, y: 86 }, [
    S('counter', 110, 36, 222, 58, 23), S('counter', 98, 3, 110, 58, 23), S('counter', 222, 3, 234, 58, 23),
    S('slot', 10, 86, 28, 190, 36, { e: 26 }), S('slot', 302, 86, 320, 190, 36, { w: 26 }),
    S('table', 84, 150, 150, 196, 19, { s: 26, n: 12 }), S('table', 182, 150, 248, 196, 19, { s: 26, n: 12 }),
  ], [
    stand('civ8', 166, 22, SO, 'work', 'clerk'), stand('civ3', 117, 138, SO, 'work', 'staff'), stand('civ4', 215, 138, SO, 'work', 'staff'),
    sit('civ', 'stool', 100, 210, N, 'idle'), sit('civ5', 'stool', 134, 210, N, 'talk'), sit('civ7', 'stool', 198, 210, N, 'talk'), sit('civ2', 'stool', 232, 210, N, 'idle'),
    sit('civ6', 'stool', 37, 118, WE, 'work'), sit('civ2', 'stool', 37, 160, WE, 'work'), sit('civ3', 'stool', 293, 97, E, 'work'), sit('civ', 'stool', 293, 139, E, 'work'), sit('civ7', 'stool', 293, 181, E, 'work'),
  ]),
  // 중앙은행: 긴 창구(좌석 창구원 셋), 대리석 기둥, 대기 벤치, 경비원
  bank: base('bank', { x: 165, y: 112 }, [
    S('glass', 10, 66, 320, 88, 25), S('column', 44, 150, 62, 168, 68), S('column', 268, 150, 286, 168, 68), S('column', 44, 206, 62, 224, 68), S('column', 268, 206, 286, 224, 68),
    S('bench', 92, 168, 152, 182, 9.5), S('bench', 178, 168, 238, 182, 9.5),
  ], [
    sit('civ8', 'chair', 165, 50, SO, 'work', 'clerk'), sit('civ3', 'chair', 75, 50, SO, 'work', 'staff'), sit('civ6', 'chair', 255, 50, SO, 'work', 'staff'),
    stand('civ', 75, 106, N, 'idle'), stand('civ5', 255, 106, N, 'idle'),
    sit('civ2', 'bench', 108, 175, N, 'read'), sit('civ4', 'bench', 134, 175, N, 'idle'), sit('civ7', 'bench', 196, 175, N, 'talk'), sit('civ', 'bench', 220, 175, N, 'talk'),
    stand('guard', 304, 236, WE, 'idle', 'staff'),
  ]),
  // 무기상: 긴 유리 진열 카운터, 탄약 선반, 대기 소파, 탄약 상자
  gunshop: base('gunshop', { x: 165, y: 128 }, [
    S('glass', 12, 70, 318, 92, 22), S('shelf', 70, 176, 146, 190, 36), S('sofa', 12, 164, 36, 226, 8.8), S('lowtable', 44, 176, 60, 214, 9),
    S('crate', 276, 170, 318, 230, 24),
  ], [
    stand('civ4', 165, 50, SO, 'work', 'clerk'), stand('civ6', 110, 112, N, 'browse'), stand('civ', 226, 112, N, 'browse'),
    sit('civ5', 'sofa', 25, 180, E, 'read'), sit('civ2', 'sofa', 25, 208, E, 'talk'),
  ]),
};

/** 충돌에 쓰는 실제 상자: 의자 자리(pad)만큼 넓힙니다. */
export const hull = (s: Solid): Rect => ({ x0: s.x0 - (s.pad?.w ?? 0), y0: s.y0 - (s.pad?.n ?? 0), x1: s.x1 + (s.pad?.e ?? 0), y1: s.y1 + (s.pad?.s ?? 0) });
/** 서 있는 사람은 작은 기둥처럼 길을 막습니다. */
const folkBox = (f: Folk): Rect => ({ x0: f.x - FOLK_R, y0: f.y - FOLK_R, x1: f.x + FOLK_R, y1: f.y + FOLK_R });
export const SEAT_Y = (k: SeatKind): number => SEAT_M[k] * HUMAN;

/** 원(반지름 r)이 상자와 겹치면 밀어냅니다. */
function pushRect(p: { x: number; y: number }, r: number, b: Rect): void {
  const nx = Math.max(b.x0, Math.min(p.x, b.x1)), ny = Math.max(b.y0, Math.min(p.y, b.y1)), dx = p.x - nx, dy = p.y - ny, d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return;
  if (d2 > 1e-6) { const d = Math.sqrt(d2); p.x = nx + dx / d * r; p.y = ny + dy / d * r; return; }
  // 중심이 상자 안: 가장 가까운 면으로 밀어냄
  const l = p.x - b.x0, rr = b.x1 - p.x, t = p.y - b.y0, bt = b.y1 - p.y, m = Math.min(l, rr, t, bt);
  if (m === l) p.x = b.x0 - r; else if (m === rr) p.x = b.x1 + r; else if (m === t) p.y = b.y0 - r; else p.y = b.y1 + r;
}
/** 벽과 가구·사람에 부딪히지 않도록 위치를 보정합니다. */
export function resolveInterior(lay: InteriorLayout, p: { x: number; y: number }): void {
  for (let k = 0; k < 2; k++) {
    p.x = Math.max(PLAYER_R, Math.min(lay.w - PLAYER_R, p.x)); p.y = Math.max(PLAYER_R, Math.min(lay.d - PLAYER_R, p.y));
    for (const s of lay.solids) pushRect(p, PLAYER_R, hull(s));
    for (const f of lay.folk) if (f.pose === 'stand') pushRect(p, PLAYER_R, folkBox(f));
  }
  p.x = Math.max(PLAYER_R, Math.min(lay.w - PLAYER_R, p.x)); p.y = Math.max(PLAYER_R, Math.min(lay.d - PLAYER_R, p.y));
}
export const nearCounter = (lay: InteriorLayout, x: number, y: number): boolean => Math.hypot(x - lay.counterSpot.x, y - lay.counterSpot.y) < COUNTER_REACH;
export const nearDoor = (lay: InteriorLayout, x: number, y: number): boolean => Math.hypot(x - lay.door.x, y - lay.door.y) < DOOR_REACH;
