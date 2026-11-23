import { MAPS, type MapDef } from './maps';
import { PLAYER_PARAMS, type CarParams } from './physics';

/** 능력치는 1~5점이고 차량마다 합계가 같습니다(좋은 정도는 같고 성격만 다릅니다). */
export interface StatPoints { accel: number; top: number; handling: number; drift: number; nitro: number }
export const STAT_KEYS = ['accel', 'top', 'handling', 'drift', 'nitro'] as const satisfies ReadonlyArray<keyof StatPoints>;
export const STAT_LABELS: Record<keyof StatPoints, string> = { accel: '가속', top: '최고속', handling: '핸들링', drift: '드리프트', nitro: '니트로' };
export const STAT_BUDGET = 15;

export interface CarDef {
  id: string; name: string; role: string; blurb: string; color: string; points: StatPoints;
  /** race.glb 의 차체 노드 이름(gt·wide·long)와 보조색(스트라이프·윙) */
  model: 'gt' | 'wide' | 'long'; accent: string;
}

export const CARS: ReadonlyArray<CarDef> = [
  { id: 'arc', name: 'ARC', role: '균형형', blurb: '가속·최고속·조향이 고르게 맞춰진 차량', color: '#d8323f', points: { accel: 3, top: 3, handling: 3, drift: 3, nitro: 3 }, model: 'gt', accent: '#f2f2f2' },
  { id: 'bolt', name: 'BOLT', role: '가속형', blurb: '출발과 코너 탈출에서 빠르게 가속', color: '#f08a1c', points: { accel: 5, top: 2, handling: 3, drift: 2, nitro: 3 }, model: 'wide', accent: '#1b1d22' },
  { id: 'velox', name: 'VELOX', role: '최고속형', blurb: '직선 주행에 맞춘 높은 최고속도', color: '#2e7dff', points: { accel: 2, top: 5, handling: 2, drift: 3, nitro: 3 }, model: 'long', accent: '#f2f2f2' },
  { id: 'orbit', name: 'ORBIT', role: '코너링형', blurb: '연속 코너에서 안정적인 조향', color: '#e5e9ef', points: { accel: 2, top: 3, handling: 5, drift: 2, nitro: 3 }, model: 'gt', accent: '#d8323f' },
  { id: 'slide', name: 'SLIDE', role: '드리프트형', blurb: '드리프트를 오래 유지하기 쉬운 세팅', color: '#8a5cf0', points: { accel: 3, top: 2, handling: 3, drift: 5, nitro: 2 }, model: 'wide', accent: '#f2c230' },
  { id: 'fuse', name: 'FUSE', role: '니트로형', blurb: '니트로 유지 시간과 회복 속도에 강점', color: '#2fbf8a', points: { accel: 2, top: 3, handling: 3, drift: 2, nitro: 5 }, model: 'gt', accent: '#1b1d22' },
  { id: 'nova', name: 'NOVA', role: '고속 코너형', blurb: '고속 코너에서 균형 잡힌 응답', color: '#16c7d9', points: { accel: 3, top: 4, handling: 4, drift: 2, nitro: 2 }, model: 'long', accent: '#f2f2f2' },
  { id: 'rally', name: 'RALLY', role: '랠리형', blurb: '초반 가속과 드리프트에 맞춘 세팅', color: '#f2c230', points: { accel: 4, top: 2, handling: 3, drift: 4, nitro: 2 }, model: 'wide', accent: '#1b1d22' },
];

/** 차량 도장(스킨). stock 은 차량 고유색이고, 나머지는 차고에서 코인으로 삽니다. */
export interface SkinDef { id: string; name: string; color: string; accent: string; cost: number }
export const SKINS: ReadonlyArray<SkinDef> = [
  { id: 'stock', name: '기본', color: '', accent: '', cost: 0 },
  { id: 'night', name: '나이트 블랙', color: '#15171d', accent: '#ff3b5c', cost: 220 },
  { id: 'pearl', name: '펄 화이트', color: '#f1f3f6', accent: '#2e7dff', cost: 220 },
  { id: 'sunset', name: '선셋 오렌지', color: '#ff6a2b', accent: '#2a1038', cost: 320 },
  { id: 'neon', name: '네온 라임', color: '#9cff2e', accent: '#1b1d22', cost: 320 },
  { id: 'royal', name: '로열 퍼플', color: '#6a35d9', accent: '#f2c230', cost: 420 },
  { id: 'gold', name: '골드 러시', color: '#d9a62e', accent: '#15171d', cost: 600 },
];
export const skinById = (id: string): SkinDef => SKINS.find(s => s.id === id) ?? SKINS[0];
/** 스킨을 입힌 차량의 차체색·보조색 */
export const paintOf = (car: CarDef, skinId: string): { color: string; accent: string } => { const k = skinById(skinId); return k.color ? { color: k.color, accent: k.accent } : { color: car.color, accent: car.accent }; };
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
// 이전 버전보다 라이벌이 전반적으로 빨라지고 더 끈질기게 따라붙습니다.
export const LEVELS: ReadonlyArray<LevelDef> = [
  { id: 1, name: '쉬움', blurb: '기본 레이싱 라인을 따라 달리며 니트로를 사용합니다.', topMul: 1.1, gripMul: 1.2, bandLo: 0.97, bandHi: 1.115, bandK: 0.00034, line: 0.78, nitro: 0.4 },
  { id: 2, name: '보통', blurb: '코너 진입이 정확하고 일정한 속도를 유지합니다.', topMul: 1.135, gripMul: 1.265, bandLo: 0.98, bandHi: 1.13, bandK: 0.0004, line: 0.95, nitro: 0.2 },
  { id: 3, name: '어려움', blurb: '코너 탈출이 빠르고 직선에서도 속도를 유지합니다.', topMul: 1.165, gripMul: 1.335, bandLo: 0.988, bandHi: 1.15, bandK: 0.00048, line: 1, nitro: 0.07 },
  { id: 4, name: '매우 어려움', blurb: '제동 실수가 적고 추월 기회가 제한적입니다.', topMul: 1.185, gripMul: 1.385, bandLo: 0.995, bandHi: 1.165, bandK: 0.00055, line: 1, nitro: 0.03 },
  { id: 5, name: '극한', blurb: '코너와 직선 모두 높은 속도를 유지하는 상대입니다.', topMul: 1.215, gripMul: 1.44, bandLo: 1, bandHi: 1.18, bandK: 0.0006, line: 1, nitro: 0.02 },
];
export const levelById = (id: number): LevelDef => LEVELS.find(l => l.id === id) ?? LEVELS[0];

export const LAP_OPTIONS = [1, 2, 3] as const;
export type Laps = (typeof LAP_OPTIONS)[number];

export type RaceMode = 'race' | 'trial';
export interface RaceSetup { map: string; laps: Laps; level: number; car: string; skin: string; /** race: 라이벌과 경주, trial: 혼자 달리며 내 최고 기록의 고스트와 겨루는 타임어택 */ mode: RaceMode }
export const DEFAULT_SETUP: RaceSetup = { map: MAPS[0].id, laps: 3, level: 1, car: CARS[0].id, skin: 'stock', mode: 'race' };

/** 저장된 값이 깨져 있어도 항상 고를 수 있는 선택으로 되돌립니다. */
export function sanitizeSetup(raw: unknown): RaceSetup {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const pick = <T>(v: unknown, ok: (x: unknown) => boolean, fallback: T): T => (ok(v) ? (v as T) : fallback);
  return {
    map: pick(r.map, v => MAPS.some(m => m.id === v), DEFAULT_SETUP.map),
    laps: pick(r.laps, v => LAP_OPTIONS.includes(v as Laps), DEFAULT_SETUP.laps),
    level: pick(r.level, v => LEVELS.some(l => l.id === v), DEFAULT_SETUP.level),
    car: pick(r.car, v => CARS.some(c => c.id === v), DEFAULT_SETUP.car),
    skin: pick(r.skin, v => SKINS.some(k => k.id === v), DEFAULT_SETUP.skin),
    mode: pick(r.mode, v => v === 'race' || v === 'trial', DEFAULT_SETUP.mode),
  };
}
export const mapOf = (s: RaceSetup): MapDef => MAPS.find(m => m.id === s.map) ?? MAPS[0];
