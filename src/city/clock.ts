// LAST CITY — 도시의 하루(낮·밤)와 날씨. 시드가 같으면 같은 날씨가 나오는 순수 함수라 헤드리스 테스트·결투 동기화에 안전합니다.
import type { BizKind } from './defs';

/** 하루의 길이(초). 한 판(약 15~20분)에 낮과 밤이 세 번쯤 지나갑니다. */
export const DAY_SECONDS = 360;
/** 판은 오전 8시에 시작합니다. */
export const START_HOUR = 8;
/** 날씨가 한 번 정해지면 이 시간(초)만큼 이어집니다. */
export const WEATHER_SEGMENT = 120;

export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';
export type Weather = 'clear' | 'rain' | 'storm';

/** 도시 시각(0~24). */
export function cityHour(t: number): number {
  return (((START_HOUR + (t / DAY_SECONDS) * 24) % 24) + 24) % 24;
}
export function phaseOf(hour: number): DayPhase {
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 18) return 'day';
  if (hour >= 18 && hour < 21) return 'dusk';
  return 'night';
}
export const PHASE_LABEL: Record<DayPhase, string> = { dawn: '새벽', day: '낮', dusk: '해질녘', night: '밤' };
export const WEATHER_LABEL: Record<Weather, string> = { clear: '비 그침', rain: '비', storm: '폭풍우' };

/** 시드와 구간 번호에서 나오는 0~1 값 */
function hash01(seed: number, n: number): number {
  let h = (seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** 첫 구간은 보통 비(이 도시의 기본 분위기), 이후는 비 55% · 비 그침 25% · 폭풍우 20%. */
export function weatherAt(seed: number, t: number): Weather {
  const seg = Math.max(0, Math.floor(t / WEATHER_SEGMENT));
  if (seg === 0) return 'rain';
  const r = hash01(seed, seg);
  return r < 0.55 ? 'rain' : r < 0.8 ? 'clear' : 'storm';
}

export function clockLabel(hour: number): string {
  const h = Math.floor(hour), m = Math.floor((hour - h) * 60 / 10) * 10, ap = h < 12 ? '오전' : '오후', h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ap} ${h12}:${String(m).padStart(2, '0')}`;
}

/** 사업체 수입 배율: 밤에는 유흥업이, 낮에는 생활업이 잘 되고, 폭풍우 땐 손님이 줄어듭니다. 은행·무기상은 영향이 없습니다. */
export function incomeMood(kind: BizKind, phase: DayPhase, weather: Weather): number {
  let m = 1;
  const nightlife = kind === 'club' || kind === 'casino', daily = kind === 'store' || kind === 'plant';
  if (nightlife) m *= phase === 'night' ? 1.35 : phase === 'dusk' ? 1.15 : phase === 'day' ? 0.85 : 0.95;
  else if (daily) m *= phase === 'day' ? 1.15 : phase === 'night' ? 0.85 : 1;
  else return 1;
  if (weather === 'storm') m *= nightlife ? 0.9 : 0.8; else if (weather === 'rain' && daily) m *= 0.95;
  return m;
}
/** 거리에 나와 있는 시민 수 목표: 밤·폭풍우에는 집 안으로 들어갑니다. */
export function pedTarget(phase: DayPhase, weather: Weather): number {
  const base = phase === 'night' ? 0.55 : phase === 'dawn' ? 0.7 : phase === 'dusk' ? 0.9 : 1;
  return Math.round(34 * base * (weather === 'storm' ? 0.6 : weather === 'rain' ? 0.85 : 1));
}
/** 일일 교통량 목표(차량 수) */
export function carTarget(phase: DayPhase, weather: Weather): number {
  const base = phase === 'night' ? 0.6 : phase === 'dawn' ? 0.75 : 1;
  return Math.round(16 * base * (weather === 'storm' ? 0.75 : 1));
}
/** 폭풍우에는 비가 쏟아지고, 비가 그치면 빗줄기가 성겨집니다(화면 연출용). */
export const RAIN_DENSITY: Record<Weather, number> = { clear: 0.3, rain: 1, storm: 1 };
export const NIGHT_LIGHT = 0.7;
export function lightLevel(phase: DayPhase): number { return phase === 'night' ? NIGHT_LIGHT : phase === 'dawn' || phase === 'dusk' ? 0.88 : 1; }
