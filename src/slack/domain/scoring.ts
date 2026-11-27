export interface ScoreState { fun: number; study: number; strikes: number; sus: number; goal: number }
export function scoreRun(s: ScoreState, comboBonus: number): number {
  return Math.max(0, Math.round(s.fun * 10 + comboBonus + s.study * 3 - s.strikes * 150));
}
export function gradeRun(s: ScoreState, used: number, level: number): 'S' | 'A' | 'B' | 'C' | 'D' {
  const quality = s.fun / s.goal * 80 + s.study * 0.2 + used * 1.5 - s.strikes * 10 - s.sus * 0.12 + (level - 1) * 6;
  return s.fun < s.goal ? (s.fun >= s.goal * 0.6 ? 'C' : 'D') : quality >= 114 ? 'S' : quality >= 100 ? 'A' : quality >= 86 ? 'B' : 'C';
}
