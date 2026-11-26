import { CHUNK, DEPTH, WIDTH, blocked, districtAt, propsFor, randomFor, roadDistance } from './domain';

export const MAX_HEALTH = 100;
export const MAX_WANTED = 5;
export const WANTED_DECAY_DELAY = 8;

export type WeaponId = 'pistol' | 'smg';

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  damage: number;
  range: number;
  cooldown: number;
  magazine: number;
  reserve: number;
}

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  pistol: { id: 'pistol', name: '케스트렐 권총', damage: 36, range: 48, cooldown: 0.32, magazine: 12, reserve: 24 },
  smg: { id: 'smg', name: '와스프 기관단총', damage: 13, range: 34, cooldown: 0.1, magazine: 30, reserve: 60 },
};

export interface Vitals {
  health: number;
  money: number;
  wanted: number;
  calm: number;
  weapon: WeaponId | null;
  magazine: number;
  reserve: number;
  cooldown: number;
  reload: number;
  invulnerable: number;
}

export type PedKind = 'civilian' | 'police';
export type PedState = 'walk' | 'flee' | 'chase' | 'down';
export type Routine = 'stroll' | 'bench' | 'shop' | 'chat' | 'cross' | 'indoor';
export type Mood = 'calm' | 'wary' | 'startled' | 'panic' | 'calling' | 'avoid' | 'confront';

export interface Ped {
  id: string;
  x: number;
  z: number;
  yaw: number;
  health: number;
  cash: number;
  kind: PedKind;
  state: PedState;
  attack: number;
  down: number;
  chunk: string;
  activity: Routine;
  mood: Mood;
  courage: number;
  lawful: number;
  sociable: number;
  awareness: number;
  fear: number;
  anger: number;
  phase: number;
  hold: number;
  goalX: number;
  goalZ: number;
  homeX: number;
  homeZ: number;
  partner: string;
  crime: number;
  threatX: number;
  threatZ: number;
  hidden: boolean;
  band: number;
  think: number;
  pace: number;
}

export interface GroundItem {
  id: string;
  x: number;
  z: number;
  kind: 'weapon' | 'med';
  weapon: WeaponId | null;
  amount: number;
}

export interface ShotLine { x: number; z: number; tx: number; tz: number }
export interface RayHit { ped: Ped; distance: number }
export interface CrimeResult { status: 'quiet' | 'spotted' | 'robbed' | 'broke' | 'none'; amount: number }
export type Trigger = 'shot' | 'empty' | 'reload' | 'none';

const PURSE: Record<string, number> = { forest: 30, desert: 48, city: 90, rich: 260, slum: 28, base: 70 };
const PED_COUNT: Record<string, number> = { forest: 1, desert: 1, city: 2, rich: 2, slum: 2, base: 2 };

export function createVitals(): Vitals {
  return {
    health: MAX_HEALTH, money: 0, wanted: 0, calm: 0, weapon: null,
    magazine: 0, reserve: 0, cooldown: 0, reload: 0, invulnerable: 0,
  };
}

export function starCount(wanted: number): number {
  if (wanted <= 0) return 0;
  return Math.max(0, Math.min(MAX_WANTED, Math.ceil(wanted - 1e-9)));
}

export function starLabel(wanted: number): string {
  const stars = starCount(wanted);
  return '★'.repeat(stars) + '☆'.repeat(MAX_WANTED - stars);
}

export function addWanted(v: Vitals, amount: number) {
  v.wanted = Math.max(0, Math.min(MAX_WANTED, v.wanted + amount));
  v.calm = 0;
}

export function decayWanted(v: Vitals, dt: number) {
  if (v.wanted <= 0) { v.wanted = 0; v.calm = 0; return; }
  v.calm += dt;
  if (v.calm < WANTED_DECAY_DELAY) return;
  const rate = v.wanted >= 4 ? 0.05 : 0.14;
  v.wanted = Math.max(0, v.wanted - rate * dt);
}

export function makePed(id: string, x: number, z: number, extra: Partial<Ped> = {}): Ped {
  return {
    id, x, z,
    yaw: extra.yaw ?? 0,
    health: extra.health ?? 55,
    cash: extra.cash ?? 40,
    kind: extra.kind ?? 'civilian',
    state: extra.state ?? 'walk',
    attack: extra.attack ?? 0,
    down: extra.down ?? 0,
    chunk: extra.chunk ?? Math.floor(x / CHUNK) + ':' + Math.floor(z / CHUNK),
    activity: extra.activity ?? 'stroll',
    mood: extra.mood ?? 'calm',
    courage: extra.courage ?? 0.5,
    lawful: extra.lawful ?? 0.5,
    sociable: extra.sociable ?? 0.5,
    awareness: extra.awareness ?? 0.6,
    fear: extra.fear ?? 0,
    anger: extra.anger ?? 0.3,
    phase: extra.phase ?? 0,
    hold: extra.hold ?? 0,
    goalX: extra.goalX ?? x,
    goalZ: extra.goalZ ?? z,
    homeX: extra.homeX ?? x,
    homeZ: extra.homeZ ?? z,
    partner: extra.partner ?? '',
    crime: extra.crime ?? 0,
    threatX: extra.threatX ?? x,
    threatZ: extra.threatZ ?? z,
    hidden: extra.hidden ?? false,
    band: extra.band ?? -1,
    think: extra.think ?? 0,
    pace: extra.pace ?? 1.3,
  };
}

export function makeWeapon(id: string, x: number, z: number, weapon: WeaponId): GroundItem {
  return { id, x, z, kind: 'weapon', weapon, amount: WEAPONS[weapon].magazine };
}

export function makeMed(id: string, x: number, z: number): GroundItem {
  return { id, x, z, kind: 'med', weapon: null, amount: 40 };
}

export function populationFor(cx: number, cz: number): { peds: Ped[]; items: GroundItem[] } {
  const rand = randomFor(cx + 97, cz + 13);
  const id = districtAt(cx * CHUNK + 64, cz * CHUNK + 64).id;
  const props = propsFor(cx, cz);
  const peds: Ped[] = [];
  const items: GroundItem[] = [];
  const spot = (): { x: number; z: number } | null => {
    for (let n = 0; n < 10; n++) {
      const x = cx * CHUNK + 8 + rand() * (CHUNK - 16);
      const z = cz * CHUNK + 8 + rand() * (CHUNK - 16);
      if (roadDistance(x, z) < 3.2) continue;
      if (blocked(x, z, props, 0.8)) continue;
      if (peds.some(p => Math.hypot(p.x - x, p.z - z) < 4)) continue;
      if (items.some(p => Math.hypot(p.x - x, p.z - z) < 3)) continue;
      return { x, z };
    }
    return null;
  };
  const count = PED_COUNT[id] ?? 1;
  const purse = PURSE[id] ?? 40;
  const key = cx + ':' + cz;
  for (let i = 0; i < count; i++) {
    const at = spot();
    if (!at) continue;
    peds.push(makePed(key + ':p' + i, at.x, at.z, {
      chunk: key,
      cash: Math.round(purse * (0.75 + rand() * 0.5)),
      health: id === 'base' ? 70 : 50,
      yaw: rand() * Math.PI * 2,
    }));
  }
  if (rand() < 0.62) {
    const at = spot();
    if (at) items.push(makeWeapon(key + ':w', at.x, at.z, id === 'base' || rand() < 0.45 ? 'smg' : 'pistol'));
  }
  if (rand() < 0.34) {
    const at = spot();
    if (at) items.push(makeMed(key + ':m', at.x, at.z));
  }
  return { peds, items };
}

export function nearestPed(peds: readonly Ped[], x: number, z: number, range: number, civilian = true): Ped | null {
  let best: Ped | null = null;
  let dist = range;
  for (const ped of peds) {
    if (ped.health <= 0 || ped.hidden) continue;
    if (civilian && ped.kind !== 'civilian') continue;
    const gap = Math.hypot(ped.x - x, ped.z - z);
    if (gap < dist) { best = ped; dist = gap; }
  }
  return best;
}

export function nearestItem(items: readonly GroundItem[], x: number, z: number, range: number): GroundItem | null {
  let best: GroundItem | null = null;
  let dist = range;
  for (const item of items) {
    const gap = Math.hypot(item.x - x, item.z - z);
    if (gap < dist) { best = item; dist = gap; }
  }
  return best;
}

export function pickpocket(v: Vitals, ped: Ped, roll: number): CrimeResult {
  if (ped.kind !== 'civilian' || ped.health <= 0 || ped.cash < 8) return { status: 'broke', amount: 0 };
  const amount = Math.min(ped.cash, Math.max(10, Math.round(ped.cash * 0.35)));
  ped.cash -= amount;
  v.money += amount;
  ped.state = 'flee';
  if (roll >= 0.62) addWanted(v, 1);
  return { status: roll >= 0.62 ? 'spotted' : 'quiet', amount };
}

export function rob(v: Vitals, ped: Ped): CrimeResult {
  if (ped.kind !== 'civilian' || ped.health <= 0 || ped.cash < 8) return { status: 'broke', amount: 0 };
  const amount = Math.min(ped.cash, Math.max(20, Math.round(ped.cash * 0.9)));
  ped.cash = 0;
  v.money += amount;
  ped.state = 'flee';
  addWanted(v, v.weapon ? 1.6 : 1.2);
  if (!v.weapon) v.health = Math.max(0, v.health - 8);
  return { status: 'robbed', amount };
}

export function takeItem(v: Vitals, item: GroundItem): 'weapon' | 'ammo' | 'med' | 'full' | 'swap' {
  if (item.kind === 'med') {
    if (v.health >= MAX_HEALTH) return 'full';
    v.health = Math.min(MAX_HEALTH, v.health + item.amount);
    return 'med';
  }
  const spec = WEAPONS[item.weapon ?? 'pistol'];
  if (v.weapon === item.weapon) {
    v.reserve += spec.magazine;
    return 'ammo';
  }
  const swapping = v.weapon !== null;
  v.weapon = item.weapon;
  v.magazine = spec.magazine;
  v.reserve = spec.reserve;
  v.cooldown = 0;
  v.reload = 0;
  return swapping ? 'swap' : 'weapon';
}

export function armWeapon(v: Vitals, dt: number, fire: boolean, reload: boolean): Trigger {
  v.cooldown = Math.max(0, v.cooldown - dt);
  if (v.reload > 0) {
    v.reload = Math.max(0, v.reload - dt);
    if (v.reload === 0 && v.weapon) {
      const spec = WEAPONS[v.weapon];
      const load = Math.min(spec.magazine - v.magazine, v.reserve);
      v.magazine += load;
      v.reserve -= load;
    }
    return 'none';
  }
  if (!v.weapon) return fire ? 'empty' : 'none';
  const spec = WEAPONS[v.weapon];
  if (reload && v.magazine < spec.magazine && v.reserve > 0) {
    v.reload = 1.05;
    return 'reload';
  }
  if (!fire || v.cooldown > 0) return 'none';
  if (v.magazine <= 0) return 'empty';
  v.magazine -= 1;
  v.cooldown = spec.cooldown;
  return 'shot';
}

export function rayHit(x: number, z: number, yaw: number, range: number, peds: readonly Ped[], radius = 0.48): RayHit | null {
  const dx = Math.sin(yaw);
  const dz = -Math.cos(yaw);
  let best: RayHit | null = null;
  for (const ped of peds) {
    if (ped.health <= 0) continue;
    const ox = ped.x - x;
    const oz = ped.z - z;
    const t = ox * dx + oz * dz;
    if (t < 0.6 || t > range) continue;
    const lateral = Math.hypot(ox - dx * t, oz - dz * t);
    if (lateral > radius) continue;
    if (!best || t < best.distance) best = { ped, distance: t };
  }
  return best;
}

export function applyHit(ped: Ped, damage: number): boolean {
  ped.health = Math.max(0, ped.health - damage);
  if (ped.health <= 0) {
    ped.state = 'down';
    ped.down = 0;
    return true;
  }
  ped.state = ped.kind === 'civilian' ? 'flee' : 'chase';
  return false;
}

export function yawToward(sx: number, sz: number): number {
  return Math.atan2(sx, -sz);
}

export function stepActor(ped: Ped, dt: number, playerX: number, playerZ: number, blockedAt: (x: number, z: number) => boolean) {
  if (ped.health <= 0) { ped.state = 'down'; return; }
  const dx = playerX - ped.x;
  const dz = playerZ - ped.z;
  if (ped.kind === 'police') {
    ped.state = 'chase';
    ped.yaw = yawToward(dx, dz);
  } else if (ped.state === 'flee') ped.yaw = yawToward(-dx, -dz);
  else ped.yaw += Math.sin(ped.x * 0.017 + ped.z * 0.013) * dt * 0.35;
  const speed = ped.state === 'chase' ? 7.2 : ped.state === 'flee' ? 5.4 : 1.55;
  const mx = Math.sin(ped.yaw) * speed * dt;
  const mz = -Math.cos(ped.yaw) * speed * dt;
  if (ped.x + mx > 2 && ped.x + mx < WIDTH - 2 && !blockedAt(ped.x + mx, ped.z)) ped.x += mx;
  else ped.yaw += 1.4;
  if (ped.z + mz > 2 && ped.z + mz < DEPTH - 2 && !blockedAt(ped.x, ped.z + mz)) ped.z += mz;
  else ped.yaw += 1.1;
}

export function policeShot(ped: Ped, playerX: number, playerZ: number, dt: number): number {
  if (ped.kind !== 'police' || ped.health <= 0) return 0;
  ped.attack = Math.max(0, ped.attack - dt);
  const dx = playerX - ped.x;
  const dz = playerZ - ped.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 24 || dist < 1.4 || ped.attack > 0) return 0;
  const facing = (Math.sin(ped.yaw) * dx + -Math.cos(ped.yaw) * dz) / dist;
  if (facing < 0.82) return 0;
  ped.attack = 0.9;
  return dist < 9 ? 12 : 7;
}

export function snapRoad(value: number, limit: number): number {
  const maxK = Math.max(0, Math.floor((limit - 65) / 256));
  const k = Math.round((value - 64) / 256);
  return Math.max(0, Math.min(maxK, k)) * 256 + 64;
}

export function hospital(x: number, z: number): { x: number; z: number } {
  const district = districtAt(x, z);
  return { x: snapRoad(district.x, WIDTH), z: snapRoad(district.z, DEPTH) };
}

export function cashOnDeath(money: number): number {
  return Math.floor(Math.max(0, money) * 0.8);
}
