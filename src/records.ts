// 메인 페이지와 각 게임이 함께 쓰는 저장 기록 읽기. 게임 본체를 불러오지 않고도 메뉴에서 쓸 수 있게 분리했습니다.
export const CITY_KEY = 'waldo.city.v1';
export const RACE_KEY = 'waldo.race.v1';

export interface RaceSave { best: number; bestRace: number }

export function readCityCareer(): { matches: number; wins: number; best: number } {
  try { const r = JSON.parse(localStorage.getItem(CITY_KEY) ?? '{}') as Record<string, unknown>; const n = (v: unknown): number => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0; return { matches: n(r.matches), wins: n(r.wins), best: n(r.best) }; } catch { return { matches: 0, wins: 0, best: 0 }; }
}

export function readRaceSave(): RaceSave {
  try {
    const r = JSON.parse(localStorage.getItem(RACE_KEY) ?? '{}') as Record<string, unknown>;
    const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : Infinity);
    return { best: n(r.best), bestRace: n(r.bestRace) };
  } catch { return { best: Infinity, bestRace: Infinity }; }
}

export const fmtTime = (s: number): string => { if (!Number.isFinite(s)) return '--:--.---'; const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(3)}`; };
