export type ObjectiveKind = 'clean' | 'rapid';
export interface WaveObjective {
  readonly kind: ObjectiveKind;
  readonly startedAt: number;
  damaged: boolean;
  kills: number;
  settled: boolean;
}
export function createWaveObjective(wave: number, now: number): WaveObjective {
  return { kind: wave % 2 === 0 ? 'rapid' : 'clean', startedAt: now, damaged: false, kills: 0, settled: false };
}
export const RAPID_LIMIT = 45;
export function objectiveFailed(o: WaveObjective, now: number): boolean {
  return o.kind === 'clean' ? o.damaged : now - o.startedAt > RAPID_LIMIT;
}
export function settleObjective(o: WaveObjective, now: number): boolean {
  if (o.settled) return false;
  o.settled = true;
  return o.kills > 0 && !objectiveFailed(o, now);
}
