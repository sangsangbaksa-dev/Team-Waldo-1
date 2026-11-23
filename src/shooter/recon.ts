/** 한 경기에서만 사용하는 정찰 펄스. 위치는 스캔 당시의 좌표로 고정됩니다. */
export const RECON = { charges: 2, cooldown: 55, range: 125, duration: 7, maxTargets: 6 } as const;

export interface ReconUnit {
  id: number;
  x: number;
  z: number;
  alive: boolean;
  air: number;
}
export interface ReconOperator extends ReconUnit { veh: number }
export interface ReconMark { id: number; x: number; z: number; expires: number }
export interface ReconState { charges: number; readyAt: number; marks: ReconMark[] }

export function freshRecon(): ReconState {
  return { charges: RECON.charges, readyAt: 0, marks: [] };
}

export function useRecon(
  state: ReconState,
  time: number,
  operator: ReconOperator,
  players: readonly ReconUnit[],
): { state: ReconState; found: number } | null {
  if (!Number.isFinite(time) || !operator.alive || operator.air !== 0 || operator.veh >= 0 || state.charges <= 0 || time < state.readyAt) return null;
  const range2 = RECON.range * RECON.range;
  const marks = players
    .filter(p => p.id !== operator.id && p.alive && p.air === 0 && (p.x - operator.x) ** 2 + (p.z - operator.z) ** 2 <= range2)
    .sort((a, b) => ((a.x - operator.x) ** 2 + (a.z - operator.z) ** 2) - ((b.x - operator.x) ** 2 + (b.z - operator.z) ** 2))
    .slice(0, RECON.maxTargets)
    .map(p => ({ id: p.id, x: p.x, z: p.z, expires: time + RECON.duration }));
  return { state: { charges: state.charges - 1, readyAt: time + RECON.cooldown, marks }, found: marks.length };
}
