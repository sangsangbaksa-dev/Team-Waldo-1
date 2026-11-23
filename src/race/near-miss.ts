import { BODY_HALF_WIDTH, type CarState } from './physics';

type NearMissCar = Pick<CarState, 'x' | 'z' | 'h' | 'vf'>;
export interface NearMissRival {
  id: number;
  car: NearMissCar;
  player?: boolean;
  link?: unknown;
}
interface Pass {
  active: boolean;
  startedAt: number;
  lastAhead: number;
  side: number;
  cooldownUntil: number;
}

export interface NearMissState {
  chain: number;
  bestChain: number;
  total: number;
  lastAt: number;
  targets: Map<number, Pass>;
}

export interface NearMissAward {
  chain: number;
  nitro: number;
}

export const NEAR_MISS_WINDOW = 11;
const MIN_SPEED = 30;
const MIN_RELATIVE_SPEED = 4;
const MIN_SIDE = 2 * BODY_HALF_WIDTH + 0.95;
const MAX_SIDE = 5.6;
const PASS_DISTANCE = 4;
const START_DISTANCE = 15;
const MAX_PASS_SECONDS = 3.2;
const COOLDOWN_SECONDS = 6;

export function createNearMiss(): NearMissState {
  return { chain: 0, bestChain: 0, total: 0, lastAt: -Infinity, targets: new Map() };
}

export function nearMissRemaining(s: NearMissState, clock: number): number {
  return s.chain ? Math.max(0, NEAR_MISS_WINDOW - (clock - s.lastAt)) : 0;
}

export function resetNearMiss(s: NearMissState): void {
  s.chain = 0;
  for (const target of s.targets.values()) target.active = false;
}

/**
 * Only a clean overtake counts: arm while the rival is ahead, then cross
 * behind its rear within a short window, staying clear of both bodies.
 * Remote cars are excluded so network interpolation cannot award a pass.
 */
export function stepNearMiss(s: NearMissState, me: NearMissCar, rivals: ReadonlyArray<NearMissRival>, clock: number, crashed = false): NearMissAward[] {
  const awards: NearMissAward[] = [];
  if (crashed || !Number.isFinite(clock)) {
    resetNearMiss(s);
    return awards;
  }
  if (s.chain && !nearMissRemaining(s, clock)) s.chain = 0;

  const fx = Math.cos(me.h), fz = Math.sin(me.h);
  for (const rival of rivals) {
    if (rival.player || rival.link) continue;
    const other = rival.car;
    const dx = other.x - me.x, dz = other.z - me.z;
    const ahead = dx * fx + dz * fz;
    const lateral = -dx * fz + dz * fx;
    const side = Math.abs(lateral);
    const eligible = me.vf >= MIN_SPEED && me.vf - other.vf >= MIN_RELATIVE_SPEED
      && Math.cos(me.h - other.h) >= 0.985 && side >= MIN_SIDE && side <= MAX_SIDE;
    let target = s.targets.get(rival.id);

    if (!target) {
      if (!eligible || ahead < PASS_DISTANCE || ahead > START_DISTANCE) continue;
      target = { active: false, startedAt: 0, lastAhead: 0, side: 0, cooldownUntil: 0 };
      s.targets.set(rival.id, target);
    }
    if (clock < target.cooldownUntil) continue;
    if (!eligible || (target.active && (clock - target.startedAt > MAX_PASS_SECONDS
      || Math.abs(ahead - target.lastAhead) > 2.5 || Math.sign(lateral) !== target.side))) {
      target.active = false;
      continue;
    }
    if (!target.active) {
      if (ahead >= PASS_DISTANCE && ahead <= START_DISTANCE) {
        target.active = true;
        target.startedAt = clock;
        target.side = Math.sign(lateral);
        target.lastAhead = ahead;
      }
      continue;
    }
    target.lastAhead = ahead;
    if (ahead > START_DISTANCE + 2) { target.active = false; continue; }
    if (ahead > -PASS_DISTANCE) continue;
    target.active = false;
    target.cooldownUntil = clock + COOLDOWN_SECONDS;
    s.chain = Math.min(9, s.chain + 1);
    s.bestChain = Math.max(s.bestChain, s.chain);
    s.total++;
    s.lastAt = clock;
    awards.push({ chain: s.chain, nitro: Math.min(0.14, 0.065 + s.chain * 0.015) });
  }
  return awards;
}
