import { starCount } from './street';

export interface DispatchPolicy {
  stars: number;
  foot: number;
  police: number;
  military: number;
  blocks: number;
  response: number;
  search: number;
  cooldown: number;
  sight: number;
}

export const DISPATCH: readonly DispatchPolicy[] = [
  { stars: 0, foot: 0, police: 0, military: 0, blocks: 0, response: 0, search: 0, cooldown: 0, sight: 0 },
  { stars: 1, foot: 1, police: 1, military: 0, blocks: 0, response: 4, search: 8, cooldown: 12, sight: 48 },
  { stars: 2, foot: 2, police: 2, military: 0, blocks: 0, response: 3, search: 8, cooldown: 12, sight: 56 },
  { stars: 3, foot: 3, police: 3, military: 0, blocks: 1, response: 2, search: 9, cooldown: 14, sight: 64 },
  { stars: 4, foot: 4, police: 4, military: 0, blocks: 2, response: 1.5, search: 10, cooldown: 16, sight: 72 },
  { stars: 5, foot: 4, police: 3, military: 2, blocks: 2, response: 1, search: 12, cooldown: 18, sight: 84 },
];

export type PursuitPhase = 'clear' | 'responding' | 'engaged' | 'searching' | 'cooldown';

export interface PursuitClock {
  phase: PursuitPhase;
  timer: number;
  blind: number;
  lastX: number;
  lastZ: number;
}

export interface UnitCommand {
  foot: number;
  police: number;
  military: number;
  blocks: number;
  allowSpawn: boolean;
  withdraw: boolean;
}

export type PursuitMode = 'intercept' | 'chase' | 'search' | 'block' | 'withdraw';
export type UnitKind = 'foot' | 'police' | 'military' | 'block';

export function policyFor(stars: number): DispatchPolicy {
  const level = Math.max(0, Math.min(5, starCount(stars)));
  return DISPATCH[level] ?? DISPATCH[0]!;
}

export function initialPursuit(x: number, z: number): PursuitClock {
  return { phase: 'clear', timer: 0, blind: 0, lastX: x, lastZ: z };
}

export function stepPursuit(
  clock: PursuitClock,
  stars: number,
  seen: boolean,
  crime: boolean,
  x: number,
  z: number,
  dt: number,
): PursuitClock {
  if (stars <= 0) return { phase: 'clear', timer: 0, blind: 0, lastX: x, lastZ: z };
  const policy = policyFor(stars);
  if (crime && clock.phase === 'cooldown') {
    return { phase: 'responding', timer: policy.response, blind: 0, lastX: x, lastZ: z };
  }
  const next: PursuitClock = {
    phase: clock.phase,
    timer: clock.timer,
    blind: seen ? 0 : clock.blind + dt,
    lastX: seen ? x : clock.lastX,
    lastZ: seen ? z : clock.lastZ,
  };
  if (next.phase === 'clear') {
    return { phase: 'responding', timer: policy.response, blind: next.blind, lastX: x, lastZ: z };
  }
  if (next.phase === 'responding') {
    next.timer -= dt;
    if (next.timer <= 0) {
      next.phase = seen ? 'engaged' : 'searching';
      next.timer = policy.search;
    }
    return next;
  }
  if (next.phase === 'engaged') {
    if (!seen) {
      next.phase = 'searching';
      next.timer = policy.search;
    }
    return next;
  }
  if (next.phase === 'searching') {
    if (seen) return { ...next, phase: 'engaged', timer: 0 };
    next.timer -= dt;
    if (next.timer <= 0) return { ...next, phase: 'cooldown', timer: policy.cooldown };
    return next;
  }
  next.timer -= dt;
  if (next.timer <= 0) return { ...next, phase: 'responding', timer: policy.response };
  return next;
}

export function dispatchCommand(stars: number, phase: PursuitPhase): UnitCommand {
  if (stars <= 0 || phase === 'clear' || phase === 'cooldown') {
    return { foot: 0, police: 0, military: 0, blocks: 0, allowSpawn: false, withdraw: true };
  }
  const policy = policyFor(stars);
  const spawn = phase === 'engaged' || phase === 'searching';
  return {
    foot: policy.foot,
    police: policy.police,
    military: policy.military,
    blocks: policy.blocks,
    allowSpawn: spawn,
    withdraw: false,
  };
}

export function spawnBudget(current: number, target: number, allow: boolean): number {
  if (!allow || current >= target) return 0;
  return 1;
}

export function pursuitMode(phase: PursuitPhase, seen: boolean, kind: UnitKind): PursuitMode {
  if (kind === 'block') return phase === 'cooldown' || phase === 'clear' ? 'withdraw' : 'block';
  if (phase === 'cooldown' || phase === 'clear') return 'withdraw';
  if (phase === 'searching' || !seen) return phase === 'searching' ? 'search' : 'intercept';
  return 'chase';
}

export class CrimeLedger {
  private readonly seen = new Set<string>();
  private readonly order: string[] = [];

  claim(id: string): boolean {
    if (this.seen.has(id)) return false;
    this.seen.add(id);
    this.order.push(id);
    if (this.order.length > 64) {
      const oldest = this.order.shift();
      if (oldest) this.seen.delete(oldest);
    }
    return true;
  }
}

export function retainPursuit<T extends { persistent: boolean; x: number; z: number }>(
  units: readonly T[],
  x: number,
  z: number,
  distance: number,
): T[] {
  return units.filter(unit => unit.persistent || Math.hypot(unit.x - x, unit.z - z) <= distance);
}
