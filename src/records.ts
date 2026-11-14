// 메인 페이지와 각 게임이 함께 쓰는 저장 기록 읽기. 게임 본체를 불러오지 않고도 메뉴에서 쓸 수 있게 분리했습니다.
export const CITY_KEY = 'waldo.city.v1';
export const RACE_KEY = 'waldo.race.v1';
const RACE_KEY_V2 = 'waldo.race.v2';

export function readCityCareer(): { matches: number; wins: number; best: number } {
  try { const r = JSON.parse(localStorage.getItem(CITY_KEY) ?? '{}') as Record<string, unknown>; const n = (v: unknown): number => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0; return { matches: n(r.matches), wins: n(r.wins), best: n(r.best) }; } catch { return { matches: 0, wins: 0, best: 0 }; }
}

export const RACE_SETUP_KEY = 'waldo.race.setup.v1';

/** 코스별 최고 랩과 코스·랩 수별 최고 기록(초). 키는 `코스` 와 `코스:랩수`. */
export interface RaceRecords { bestLap: Record<string, number>; bestRace: Record<string, number>; last: { map: string; label: string } | null }
export const raceRaceKey = (map: string, laps: number): string => `${map}:${laps}`;

const seconds = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
function timeTable(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof raw === 'object' && raw !== null) for (const [k, v] of Object.entries(raw)) if (seconds(v)) out[k] = v;
  return out;
}

export function readRaceRecords(): RaceRecords {
  const rec: RaceRecords = { bestLap: {}, bestRace: {}, last: null };
  try {
    const raw = localStorage.getItem(RACE_KEY_V2);
    if (raw) {
      const r = JSON.parse(raw) as Record<string, unknown>, last = r.last as Record<string, unknown> | null | undefined;
      rec.bestLap = timeTable(r.bestLap); rec.bestRace = timeTable(r.bestRace);
      if (last && typeof last.map === 'string' && typeof last.label === 'string') rec.last = { map: last.map, label: last.label };
      return rec;
    }
    // 이전 버전(코스가 하나, 3랩 고정)의 기록은 선셋 서킷 기록으로 옮겨 읽습니다.
    const old = JSON.parse(localStorage.getItem(RACE_KEY) ?? '{}') as Record<string, unknown>;
    if (seconds(old.best)) { rec.bestLap.sunset = old.best; rec.last = { map: 'sunset', label: '선셋 서킷' }; }
    if (seconds(old.bestRace)) rec.bestRace[raceRaceKey('sunset', 3)] = old.bestRace;
  } catch { /* 기록 없이도 플레이할 수 있습니다. */ }
  return rec;
}
export function writeRaceRecords(rec: RaceRecords): void {
  try { localStorage.setItem(RACE_KEY_V2, JSON.stringify(rec)); } catch { /* 저장 불가 환경 */ }
}
export function readRaceSetupRaw(): unknown {
  try { return JSON.parse(localStorage.getItem(RACE_SETUP_KEY) ?? 'null'); } catch { return null; }
}
export function writeRaceSetupRaw(v: unknown): void {
  try { localStorage.setItem(RACE_SETUP_KEY, JSON.stringify(v)); } catch { /* 선택은 저장하지 않아도 됩니다. */ }
}

export const fmtTime = (s: number): string => { if (!Number.isFinite(s)) return '--:--.---'; const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(3)}`; };
