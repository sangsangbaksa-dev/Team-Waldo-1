// ZERO ZONE — 저장 기록(전적·최다 킬). 메인 페이지가 게임 본체를 불러오지 않고도 읽을 수 있게 따로 둡니다.
export const SHOOTER_KEY = 'waldo.shooter.v1';
export interface ShooterCareer { matches: number; wins: number; bestKills: number; level: string }
const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(v)) : 0);
export function readShooterCareer(): ShooterCareer {
  try { const r = JSON.parse(localStorage.getItem(SHOOTER_KEY) ?? '{}') as Record<string, unknown>; const matches = n(r.matches); return { matches, wins: Math.min(matches, n(r.wins)), bestKills: n(r.bestKills), level: typeof r.level === 'string' ? r.level : 'normal' }; }
  catch { return { matches: 0, wins: 0, bestKills: 0, level: 'normal' }; }
}
export function writeShooterCareer(c: ShooterCareer): void { try { localStorage.setItem(SHOOTER_KEY, JSON.stringify(c)); } catch { /* 저장하지 못해도 계속할 수 있습니다. */ } }
export function recordShooterMatch(win: boolean, kills: number): void { const c = readShooterCareer(); c.matches = Math.min(Number.MAX_SAFE_INTEGER, c.matches + 1); c.wins = Math.min(c.matches, c.wins + Number(win)); c.bestKills = Math.max(c.bestKills, n(kills)); writeShooterCareer(c); }
