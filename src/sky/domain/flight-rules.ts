export const WORLD_R = 3200;
export const SEA_Y = 0;
export const MIN_SPEED = 70, MAX_SPEED = 230, CRUISE = 140;
export const GUN_RANGE = 650, GUN_DMG = 7, MISSILE_DMG = 55;
export const LOCK_CONE = Math.cos(16 * Math.PI / 180), LOCK_RANGE = 1700, LOCK_TIME = 0.9;

const islands = [
  { x: -700, z: -900, r: 520, h: 300 }, { x: 1200, z: 300, r: 640, h: 380 }, { x: -1500, z: 900, r: 420, h: 220 },
  { x: 300, z: 1700, r: 560, h: 330 }, { x: 2000, z: -1500, r: 480, h: 260 }, { x: -2100, z: -1700, r: 600, h: 350 }, { x: 100, z: -200, r: 260, h: 120 },
];
export function terrainY(x: number, z: number): number {
  let h = 0;
  for (const i of islands) {
    const d = Math.hypot(x - i.x, z - i.z) / i.r;
    if (d < 1) { const k = 1 - d * d; h = Math.max(h, i.h * k * k * (0.8 + 0.2 * Math.sin(x * 0.011) * Math.cos(z * 0.013))); }
  }
  return h;
}
export type Team = 'player' | 'enemy';
export type Kind = 'fighter' | 'bomber' | 'ace' | 'boss';
export interface Difficulty { id: 'easy' | 'normal' | 'hard'; name: string; enemyHp: number; skill: number; count: number }
export const DIFFS: Difficulty[] = [
  { id: 'easy', name: '신병', enemyHp: 0.8, skill: 0.55, count: 0.8 },
  { id: 'normal', name: '에이스', enemyHp: 1, skill: 0.8, count: 1 },
  { id: 'hard', name: '전설', enemyHp: 1.3, skill: 1.1, count: 1.25 },
];
export interface Input { pitch: number; roll: number; yaw?: number; throttle: number; fire: boolean; missile: boolean; flare: boolean; boost?: boolean }
export const killPoints = (kind: Kind, combo: number): number =>
  Math.round((kind === 'boss' ? 2500 : kind === 'bomber' ? 300 : kind === 'ace' ? 500 : 200) * (1 + (combo - 1) * 0.25));

export interface FlightState { kind: Kind; team: Team; boosting: boolean; speed: number; pitch: number; yaw: number; roll: number; g: number }
const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));
/** Mutates scalar flight state; position and quaternion integration remain in the simulation adapter. */
export function advanceFlight(j: FlightState, pitchIn: number, rollIn: number, throttle: number, dt: number, yawIn: number, afterburner: number): void {
  const heavy = j.kind === 'bomber' || j.kind === 'boss';
  const targetSpeed = ((1 - throttle) * MIN_SPEED + throttle * MAX_SPEED) * (heavy ? 0.7 : 1) * (j.team === 'player' ? 1 + 0.3 * afterburner : j.boosting ? 1.3 : 1);
  j.speed += (targetSpeed - Math.sin(j.pitch) * 90 - j.speed) * Math.min(1, dt * 0.9);
  j.speed = clamp(j.speed, MIN_SPEED * 0.8, MAX_SPEED * 1.45);
  const agile = j.kind === 'boss' ? 0.4 : j.kind === 'bomber' ? 0.55 : 1;
  const rate = (1.0 + (1 - (j.speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED)) * 0.4) * agile;
  const player = j.team === 'player';
  const authority = player ? clamp((j.speed - MIN_SPEED * 0.6) / (MIN_SPEED * 0.3), 0.55, 1) : 1;
  const rudder = player ? clamp(yawIn, -1, 1) : 0;
  j.roll += ((rollIn * 1.25 + rudder * 0.12) - j.roll) * Math.min(1, dt * 3.2 * authority);
  const yawRate = -Math.sin(j.roll) * rate * 1.15 * authority - rudder * 0.5 * authority;
  j.yaw += yawRate * dt;
  let pitchRate = (pitchIn * rate * 0.9 + Math.abs(Math.sin(j.roll)) * 0.18) * authority;
  if (player) {
    j.g = clamp(1 + Math.hypot(yawRate * Math.cos(j.pitch), pitchRate) * j.speed / 35, 0.5, 9);
    pitchRate *= 1 - Math.max(0, j.g - 6) * 0.04;
    if (j.speed < MIN_SPEED * 0.9) pitchRate -= 0.12 * (1 - authority) / 0.45;
  }
  j.pitch += pitchRate * dt;
  if (player && Math.abs(rollIn) < 0.04 && Math.abs(pitchIn) < 0.04) j.pitch *= 1 - Math.min(1, dt * 0.4);
  j.pitch = clamp(j.pitch, -1.2, 1.2);
}
