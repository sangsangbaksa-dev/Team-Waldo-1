// SPEED RUSH — 차량·난이도·종목 정의와 선택 값 검증. 화면과 무관한 순수 데이터입니다.
import { MAPS, type MapDef } from './maps';
import { PLAYER_PARAMS, type CarParams } from './physics';

/** 능력치는 1~5점이고 차량마다 합계가 같습니다(좋은 정도는 같고 성격만 다릅니다). */
export interface StatPoints { accel: number; top: number; handling: number; drift: number; nitro: number }
export const STAT_KEYS = ['accel', 'top', 'handling', 'drift', 'nitro'] as const satisfies ReadonlyArray<keyof StatPoints>;
export const STAT_LABELS: Record<keyof StatPoints, string> = { accel: '가속', top: '최고속', handling: '핸들링', drift: '드리프트', nitro: '니트로' };
export const STAT_BUDGET = 15;

export interface CarDef {
  id: string; name: string; role: string; blurb: string; color: string; points: StatPoints;
  /** 같은 스포츠카 모델을 늘이거나 낮춰 차종 느낌을 냅니다(길이·높이·폭 배율). */
  shape: { len: number; hgt: number; wid: number };
}

export const CARS: ReadonlyArray<CarDef> = [
  { id: 'arc', name: 'ARC', role: '균형형', blurb: '약점이 없는 기본기', color: '#d8323f', points: { accel: 3, top: 3, handling: 3, drift: 3, nitro: 3 }, shape: { len: 1, hgt: 1, wid: 1 } },
  { id: 'bolt', name: 'BOLT', role: '가속형', blurb: '출발과 코너 탈출이 빠름', color: '#f08a1c', points: { accel: 5, top: 2, handling: 3, drift: 2, nitro: 3 }, shape: { len: 0.97, hgt: 1.02, wid: 1.02 } },
  { id: 'velox', name: 'VELOX', role: '최고속형', blurb: '직선에서 가장 빠름', color: '#2e7dff', points: { accel: 2, top: 5, handling: 2, drift: 3, nitro: 3 }, shape: { len: 1.05, hgt: 0.94, wid: 1 } },
  { id: 'orbit', name: 'ORBIT', role: '코너링형', blurb: '코너에서 속도를 덜 잃음', color: '#e5e9ef', points: { accel: 2, top: 3, handling: 5, drift: 2, nitro: 3 }, shape: { len: 0.98, hgt: 0.97, wid: 1.04 } },
  { id: 'slide', name: 'SLIDE', role: '드리프트형', blurb: '미끄러지며 부스트를 빨리 모음', color: '#8a5cf0', points: { accel: 3, top: 2, handling: 3, drift: 5, nitro: 2 }, shape: { len: 1.02, hgt: 0.98, wid: 1 } },
  { id: 'fuse', name: 'FUSE', role: '니트로형', blurb: '니트로가 오래가고 빨리 참', color: '#2fbf8a', points: { accel: 2, top: 3, handling: 3, drift: 2, nitro: 5 }, shape: { len: 1, hgt: 1, wid: 1 } },
];
export const carById = (id: string): CarDef => CARS.find(c => c.id === id) ?? CARS[0];

// 한 점당 성능 변화량. 기준(3점)에서 ±2점이 곧 가장 낮은/높은 값입니다.
const STEP = { accel: 0.09, top: 0.03, grip: 0.025, turn: 0.03, drift: 0.2, nitro: 0.14 };
export function carParams(car: CarDef): CarParams {
  const p = car.points, d = (v: number): number => v - 3, b = PLAYER_PARAMS;
  return {
    top: b.top * (1 + d(p.top) * STEP.top), accel: b.accel * (1 + d(p.accel) * STEP.accel), brake: b.brake,
    grip: 1 + d(p.handling) * STEP.grip, turn: 1 + d(p.handling) * STEP.turn,
    drift: 1 + d(p.drift) * STEP.drift, nitro: 1 + d(p.nitro) * STEP.nitro,
  };
}

export interface LevelDef {
  id: number; name: string; blurb: string;
  /** 라이벌 목표 속도·코너링 한계 배율 */
  topMul: number; gripMul: number;
  /** 플레이어와의 거리에 따른 추격·감속 보정 범위 */
  bandLo: number; bandHi: number; bandK: number;
  /** 코너 안쪽을 파고드는 정도(0~1) */
  line: number;
  /** 니트로를 쓰기 시작하는 잔량. 없으면 쓰지 않음 */
  nitro?: number;
}
// 1단계는 이전 버전의 라이벌과 같은 값입니다.
export const LEVELS: ReadonlyArray<LevelDef> = [
  { id: 1, name: '쉬움', blurb: '라이벌이 실수 없이 무난하게 달립니다', topMul: 1, gripMul: 1, bandLo: 0.93, bandHi: 1.07, bandK: 0.00022, line: 0 },
  { id: 2, name: '보통', blurb: '코너를 더 공격적으로 공략합니다', topMul: 1.03, gripMul: 1.06, bandLo: 0.94, bandHi: 1.08, bandK: 0.00024, line: 0.3 },
  { id: 3, name: '어려움', blurb: '직선에서 니트로를 씁니다', topMul: 1.06, gripMul: 1.12, bandLo: 0.95, bandHi: 1.09, bandK: 0.00026, line: 0.55, nitro: 0.6 },
  { id: 4, name: '매우 어려움', blurb: '레이싱 라인을 타고 쉽게 떨어지지 않습니다', topMul: 1.09, gripMul: 1.18, bandLo: 0.96, bandHi: 1.1, bandK: 0.0003, line: 0.8, nitro: 0.4 },
  { id: 5, name: '극한', blurb: '거의 실수하지 않고 니트로를 아끼지 않습니다', topMul: 1.12, gripMul: 1.25, bandLo: 0.97, bandHi: 1.12, bandK: 0.00036, line: 1, nitro: 0.15 },
];
export const levelById = (id: number): LevelDef => LEVELS.find(l => l.id === id) ?? LEVELS[0];

export const LAP_OPTIONS = [1, 2, 3] as const;
export type Laps = (typeof LAP_OPTIONS)[number];

export interface RaceSetup { map: string; laps: Laps; level: number; car: string }
export const DEFAULT_SETUP: RaceSetup = { map: MAPS[0].id, laps: 3, level: 1, car: CARS[0].id };

/** 저장된 값이 깨져 있어도 항상 고를 수 있는 선택으로 되돌립니다. */
export function sanitizeSetup(raw: unknown): RaceSetup {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const pick = <T>(v: unknown, ok: (x: unknown) => boolean, fallback: T): T => (ok(v) ? (v as T) : fallback);
  return {
    map: pick(r.map, v => MAPS.some(m => m.id === v), DEFAULT_SETUP.map),
    laps: pick(r.laps, v => LAP_OPTIONS.includes(v as Laps), DEFAULT_SETUP.laps),
    level: pick(r.level, v => LEVELS.some(l => l.id === v), DEFAULT_SETUP.level),
    car: pick(r.car, v => CARS.some(c => c.id === v), DEFAULT_SETUP.car),
  };
}
export const mapOf = (s: RaceSetup): MapDef => MAPS.find(m => m.id === s.map) ?? MAPS[0];
