import { DEPTH, WIDTH, districtAt, roadHalf, type District } from '../domain';
import { yawToward, type Ped } from '../street';
import type { Ear } from './audio';
import { bandOf } from './regions';

export interface Stimulus {
  kind: 'gun' | 'rob' | 'pocket' | 'crash' | 'theft';
  x: number;
  z: number;
  radius: number;
  crime: number;
  victim: string;
  seen: boolean;
}

export interface CrowdContext {
  dt: number;
  hours: number;
  playerX: number;
  playerZ: number;
  stimuli: readonly Stimulus[];
  blocked: (x: number, z: number) => boolean;
  cars: readonly { x: number; z: number; speed: number }[];
}

export interface CrowdResult {
  reports: { pedId: string; crime: number }[];
  ears: Ear[];
}

const DAY: Record<District, Ped['activity'][]> = {
  forest: ['stroll', 'bench', 'stroll', 'bench'],
  city: ['cross', 'shop', 'chat', 'stroll', 'cross'],
  rich: ['bench', 'chat', 'stroll', 'shop'],
  desert: ['stroll', 'shop', 'stroll', 'bench'],
  slum: ['chat', 'shop', 'cross', 'stroll', 'chat'],
  base: ['stroll', 'cross', 'stroll', 'bench'],
};

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function unit(seed: number, shift: number): number {
  return ((seed >>> shift) & 255) / 255;
}

export function traitsOf(id: string): { courage: number; lawful: number; sociable: number; awareness: number; pace: number } {
  const seed = hash(id);
  return {
    courage: unit(seed, 0),
    lawful: unit(seed, 8),
    sociable: unit(seed, 16),
    awareness: 0.35 + unit(seed, 24) * 0.65,
    pace: 1.05 + unit(seed, 4) * 0.6,
  };
}

function clampPoint(x: number, z: number): { x: number; z: number } {
  return { x: Math.max(4, Math.min(WIDTH - 4, x)), z: Math.max(4, Math.min(DEPTH - 4, z)) };
}

function blendAngle(from: number, to: number, t: number): number {
  return from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;
}

function nearestStreet(x: number, z: number): { axis: 'x' | 'z'; center: number; half: number } | null {
  let best: { axis: 'x' | 'z'; center: number; half: number; score: number } | null = null;
  for (const axis of ['x', 'z'] as const) {
    const value = axis === 'x' ? x : z;
    for (const delta of [0, -256, 256]) {
      const center = Math.round((value - 64) / 256) * 256 + 64 + delta;
      const half = roadHalf(axis, center);
      if (!half) continue;
      const score = Math.abs(value - center) + (half > 8 ? 40 : 0);
      if (!best || score < best.score) best = { axis, center, half, score };
    }
  }
  return best ? { axis: best.axis, center: best.center, half: best.half } : null;
}

function sidewalk(x: number, z: number, salt: number): { x: number; z: number } {
  const road = nearestStreet(x, z);
  if (!road) return clampPoint(x + (salt - 0.5) * 8, z + (salt - 0.5) * 8);
  const side = road.axis === 'x' ? (x >= road.center ? 1 : -1) : (z >= road.center ? 1 : -1);
  const offset = side * (road.half + 2.5);
  if (road.axis === 'x') return clampPoint(road.center + offset, z + (salt - 0.5) * 14);
  return clampPoint(x + (salt - 0.5) * 14, road.center + offset);
}

function arrived(ped: Ped): boolean {
  return Math.hypot(ped.goalX - ped.x, ped.goalZ - ped.z) < 0.85;
}

function move(ped: Ped, dt: number, speed: number, blocked: (x: number, z: number) => boolean) {
  const dx = ped.goalX - ped.x;
  const dz = ped.goalZ - ped.z;
  if (Math.hypot(dx, dz) < 0.45) return;
  ped.yaw = yawToward(dx, dz);
  const mx = Math.sin(ped.yaw) * speed * dt;
  const mz = -Math.cos(ped.yaw) * speed * dt;
  if (ped.x + mx > 3 && ped.x + mx < WIDTH - 3 && !blocked(ped.x + mx, ped.z)) ped.x += mx;
  else ped.yaw += 0.9;
  if (ped.z + mz > 3 && ped.z + mz < DEPTH - 3 && !blocked(ped.x, ped.z + mz)) ped.z += mz;
  else ped.yaw += 0.7;
}

function separate(ped: Ped, peds: readonly Ped[], blocked: (x: number, z: number) => boolean) {
  let sx = 0;
  let sz = 0;
  for (const other of peds) {
    if (other === ped || other.health <= 0 || other.hidden) continue;
    const dx = ped.x - other.x;
    const dz = ped.z - other.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.04 && dist < 1.15) {
      sx += (dx / dist) * (1.15 - dist);
      sz += (dz / dist) * (1.15 - dist);
    }
  }
  if (Math.abs(sx) + Math.abs(sz) < 0.01) return;
  if (!blocked(ped.x + sx, ped.z)) ped.x += sx * 0.35;
  if (!blocked(ped.x, ped.z + sz)) ped.z += sz * 0.35;
}

export function seedCrowd(peds: Ped[], hours: number) {
  const band = bandOf(hours);
  for (const ped of peds) {
    if (ped.kind !== 'civilian' || ped.health <= 0 || ped.band >= 0) continue;
    const traits = traitsOf(ped.id);
    ped.courage = traits.courage;
    ped.lawful = traits.lawful;
    ped.sociable = traits.sociable;
    ped.awareness = traits.awareness;
    ped.pace = traits.pace;
    ped.homeX = ped.x;
    ped.homeZ = ped.z;
    assign(ped, hours, true);
    if (ped.id.startsWith('starter')) {
      ped.activity = 'bench';
      ped.hidden = false;
      ped.goalX = ped.x;
      ped.goalZ = ped.z;
      ped.phase = 40;
      ped.band = band;
    }
  }
  pairChats(peds, hours);
}

function assign(ped: Ped, hours: number, first: boolean) {
  const band = bandOf(hours);
  const district = districtAt(ped.homeX, ped.homeZ).id;
  const menu = DAY[district];
  const pick = menu[hash(ped.id + ':' + band) % menu.length] ?? 'stroll';
  ped.band = band;
  ped.partner = '';
  if (band === 0 || band === 4) {
    ped.activity = district === 'base' || hash(ped.id) % 3 === 0 ? 'stroll' : 'indoor';
    ped.hidden = ped.activity === 'indoor';
    ped.goalX = ped.homeX;
    ped.goalZ = ped.homeZ;
    ped.phase = ped.hidden ? 8 : 0;
    return;
  }
  ped.activity = pick === 'chat' ? 'stroll' : pick;
  ped.hidden = band === 1 && ped.activity === 'shop';
  ped.phase = ped.hidden ? 2.4 : 0;
  const salt = unit(hash(ped.id + ':' + band), 2);
  const spot = ped.activity === 'bench' || ped.activity === 'shop'
    ? { x: ped.homeX, z: ped.homeZ }
    : sidewalk(ped.homeX, ped.homeZ, salt);
  ped.goalX = spot.x;
  ped.goalZ = spot.z;
  if (!first && ped.activity === 'cross') aimCross(ped, 0);
}

function pairChats(peds: readonly Ped[], hours: number) {
  const band = bandOf(hours);
  if (band !== 2 && band !== 3) return;
  const social = peds.filter(ped => ped.kind === 'civilian' && ped.health > 0 && ped.sociable > 0.55 && !ped.id.startsWith('starter') && ped.activity !== 'indoor');
  for (let i = 0; i + 1 < social.length; i += 2) {
    const a = social[i];
    const b = social[i + 1];
    if (!a || !b) continue;
    const district = districtAt(a.x, a.z).id;
    if (district === 'forest' || district === 'base') continue;
    const x = (a.x + b.x) / 2;
    const z = (a.z + b.z) / 2;
    for (const ped of [a, b]) {
      ped.activity = 'chat';
      ped.hidden = false;
      ped.homeX = x;
      ped.homeZ = z;
      ped.goalX = x;
      ped.goalZ = z;
    }
    a.partner = b.id;
    b.partner = a.id;
  }
}

function aimCross(ped: Ped, phase: number) {
  const road = nearestStreet(ped.x, ped.z);
  if (!road || road.half > 8) {
    ped.activity = 'stroll';
    return;
  }
  const sign = road.axis === 'x' ? (ped.x >= road.center ? 1 : -1) : (ped.z >= road.center ? 1 : -1);
  const near = sign * (road.half + 2.3);
  const far = -sign * (road.half + 2.3);
  ped.phase = phase;
  if (road.axis === 'x') {
    ped.goalX = road.center + (phase >= 2 ? far : near);
    ped.goalZ = ped.z;
  } else {
    ped.goalX = ped.x;
    ped.goalZ = road.center + (phase >= 2 ? far : near);
  }
}

function routine(ped: Ped, ctx: CrowdContext, partner: Ped | undefined) {
  const speed = ped.pace * (bandOf(ctx.hours) === 0 ? 1.12 : bandOf(ctx.hours) === 1 ? 0.9 : 1);
  ped.think += ctx.dt;
  if (ped.activity === 'indoor' || (ped.hidden && ped.activity === 'shop' && ped.phase > 0)) {
    ped.hidden = true;
    ped.phase -= ctx.dt;
    if (ped.phase <= 0) {
      ped.hidden = false;
      ped.activity = 'stroll';
      const spot = sidewalk(ped.x, ped.z, unit(hash(ped.id), 3));
      ped.goalX = spot.x;
      ped.goalZ = spot.z;
    }
    return;
  }
  if (ped.activity === 'chat' && partner && partner.health > 0 && partner.mood !== 'panic' && partner.state !== 'flee') {
    ped.goalX = partner.x + Math.cos(hash(ped.id)) * 0.2;
    ped.goalZ = partner.z;
    if (Math.hypot(partner.x - ped.x, partner.z - ped.z) > 1.6) move(ped, ctx.dt, speed * 0.8, ctx.blocked);
    else ped.yaw = blendAngle(ped.yaw, yawToward(partner.x - ped.x, partner.z - ped.z), 0.2);
    return;
  }
  if (ped.activity === 'chat') ped.activity = 'stroll';
  if (ped.activity === 'bench') {
    ped.goalX = ped.homeX;
    ped.goalZ = ped.homeZ;
    if (arrived(ped)) {
      if (ped.phase <= 0) ped.phase = 5 + ped.sociable * 3;
      ped.phase -= ctx.dt;
      if (ped.phase <= 0) {
        ped.activity = 'stroll';
        const spot = sidewalk(ped.x, ped.z, ped.think % 1);
        ped.goalX = spot.x;
        ped.goalZ = spot.z;
      }
      return;
    }
    move(ped, ctx.dt, speed * 0.85, ctx.blocked);
    return;
  }
  if (ped.activity === 'shop') {
    if (arrived(ped)) {
      ped.hidden = true;
      ped.phase = 3.5 + ped.pace;
      return;
    }
    move(ped, ctx.dt, speed, ctx.blocked);
    return;
  }
  if (ped.activity === 'cross') {
    if (ped.phase === 0) aimCross(ped, 0.01);
    if (ped.phase < 1 && arrived(ped)) {
      ped.phase = 1;
      ped.hold = 0.7;
    }
    if (ped.phase === 1) {
      const blockedByCar = ctx.cars.some(car => car.speed > 1.2 && Math.hypot(car.x - ped.x, car.z - ped.z) < 12);
      if (ped.hold <= 0 && !blockedByCar) aimCross(ped, 2);
      return;
    }
    if (ped.phase >= 2 && arrived(ped)) {
      ped.activity = 'stroll';
      ped.phase = 0;
      return;
    }
    move(ped, ctx.dt, speed * 1.05, ctx.blocked);
    return;
  }
  if (arrived(ped) && ped.think > 0.35) {
    const spot = sidewalk(ped.homeX + Math.sin(ped.think) * 10, ped.homeZ + Math.cos(ped.think * 0.7) * 10, (ped.think % 1));
    ped.goalX = spot.x;
    ped.goalZ = spot.z;
    ped.think = 0;
  }
  move(ped, ctx.dt, speed, ctx.blocked);
}

function scream(ped: Ped, ears: Ear[], fresh: boolean) {
  if (!fresh) return;
  ears.push({ kind: ped.courage > 0.55 ? 'shout' : 'scream', x: ped.x, z: ped.z, gain: 0.8 + ped.fear * 0.3, pitch: 0.85 + ped.pace * 0.25 });
}

function panic(ped: Ped, x: number, z: number, ears: Ear[]) {
  const fresh = ped.mood !== 'panic';
  ped.mood = 'panic';
  ped.state = 'flee';
  ped.hidden = false;
  ped.hold = Math.max(ped.hold, 1.2);
  ped.threatX = x;
  ped.threatZ = z;
  ped.fear = Math.max(ped.fear, 0.7);
  scream(ped, ears, fresh);
}

function beginCall(ped: Ped, stimulus: Stimulus) {
  if (ped.mood === 'panic' || ped.mood === 'calling') return;
  if (ped.crime === stimulus.crime && ped.phase < 0) return;
  ped.mood = 'calling';
  ped.state = 'walk';
  ped.crime = stimulus.crime;
  ped.phase = 3.2;
  ped.hold = 0.35;
  ped.hidden = false;
  ped.threatX = stimulus.x;
  ped.threatZ = stimulus.z;
}

function consider(ped: Ped, stimulus: Stimulus, ears: Ear[]) {
  const dist = Math.hypot(ped.x - stimulus.x, ped.z - stimulus.z);
  const victim = stimulus.victim === ped.id;
  if (!victim && dist > stimulus.radius) return;
  if (!victim && stimulus.kind === 'pocket' && !stimulus.seen) return;
  if (!victim && ped.awareness < 0.42 && dist > stimulus.radius * 0.5) return;
  const near = 1 - Math.min(1, dist / Math.max(1, stimulus.radius));
  const weight = stimulus.kind === 'gun' ? 0.9 : stimulus.kind === 'rob' || stimulus.kind === 'theft' ? 0.72 : 0.5;
  ped.fear = Math.min(1, ped.fear + near * weight * (1.2 - ped.courage));
  if (victim) {
    panic(ped, stimulus.x, stimulus.z, ears);
    return;
  }
    if (stimulus.kind === 'gun') {
    if (ped.fear > 0.62 || dist < 12 + (1 - ped.courage) * 12) panic(ped, stimulus.x, stimulus.z, ears);
    else if (ped.lawful > 0.62 && ped.courage > 0.28 && dist < 36) beginCall(ped, stimulus);
    else if (ped.awareness > 0.5 && ped.mood !== 'panic' && ped.mood !== 'calling') {
      ped.mood = 'startled';
      ped.hold = Math.max(ped.hold, 0.5);
    }
    return;
  }
  if (stimulus.kind === 'rob' || stimulus.kind === 'theft') {
    if (ped.fear > 0.66 || ped.courage < 0.3) panic(ped, stimulus.x, stimulus.z, ears);
    else if (ped.courage > 0.74 && ped.lawful < 0.4 && dist < 9) {
      ped.mood = 'confront';
      ped.hold = 1.1;
      scream(ped, ears, true);
    } else if (ped.lawful > 0.46) beginCall(ped, stimulus);
    else {
      ped.mood = 'startled';
      ped.hold = Math.max(ped.hold, 0.5);
    }
    return;
  }
  if (stimulus.kind === 'pocket') {
    if (ped.courage > 0.72 && ped.lawful < 0.35 && dist < 6) {
      ped.mood = 'confront';
      ped.hold = 1;
      ears.push({ kind: 'shout', x: ped.x, z: ped.z, gain: 0.7, pitch: 0.9 });
    } else if (ped.lawful > 0.5) beginCall(ped, stimulus);
    else {
      ped.mood = 'startled';
      ped.hold = Math.max(ped.hold, 0.45);
    }
    return;
  }
  if (stimulus.seen || ped.fear > 0.62) panic(ped, stimulus.x, stimulus.z, ears);
  else if (ped.courage > 0.62 && dist < 8) {
    ped.mood = 'confront';
    ped.hold = 0.9;
    ears.push({ kind: 'shout', x: ped.x, z: ped.z, gain: 0.65, pitch: 0.95 });
  } else ped.mood = 'startled';
}

export function scare(ped: Ped, x: number, z: number, severe: boolean): Ear | null {
  if (ped.health <= 0 || ped.kind !== 'civilian') return null;
  const ears: Ear[] = [];
  if (severe || ped.courage < 0.45) panic(ped, x, z, ears);
  else {
    ped.mood = 'startled';
    ped.hold = 0.8;
    ped.fear = Math.min(1, ped.fear + 0.35);
  }
  return ears[0] ?? null;
}

export function stepCrowd(peds: readonly Ped[], ctx: CrowdContext): CrowdResult {
  const ears: Ear[] = [];
  const reports: { pedId: string; crime: number }[] = [];
  let reband = false;
  const panicked = new Set(peds.filter(ped => ped.health > 0 && (ped.mood === 'panic' || ped.state === 'flee')).map(ped => ped.id));
  for (const ped of peds) {
    if (ped.kind !== 'civilian') continue;
    if (ped.health <= 0) {
      ped.state = 'down';
      ped.hidden = false;
      continue;
    }
    if (ped.band < 0) seedCrowd([ped], ctx.hours);
    else if (ped.band !== bandOf(ctx.hours) && ped.mood === 'calm') {
      assign(ped, ctx.hours, false);
      reband = true;
    }
    if (ped.state === 'flee' && ped.mood === 'calm') panic(ped, ctx.playerX, ctx.playerZ, ears);
    ped.hold = Math.max(0, ped.hold - ctx.dt);
    ped.fear = Math.max(0, ped.fear - ctx.dt * 0.1);
    if (!ped.hidden || Math.hypot(ped.x - ctx.playerX, ped.z - ctx.playerZ) < 10) {
      for (const stimulus of ctx.stimuli) consider(ped, stimulus, ears);
    }
    if (ped.mood === 'calm' && ped.awareness > 0.4) {
      const crowd = peds.some(other => other !== ped && panicked.has(other.id) && Math.hypot(other.x - ped.x, other.z - ped.z) < 8);
      const source = peds.find(other => other !== ped && panicked.has(other.id) && Math.hypot(other.x - ped.x, other.z - ped.z) < 8);
      if (crowd && source) {
        ped.fear = Math.min(1, ped.fear + 0.3);
        if (ped.fear > 0.65 && ped.courage < 0.72) panic(ped, source.x, source.z, ears);
        else if (ped.mood === 'calm') {
          ped.mood = 'startled';
          ped.hold = Math.max(ped.hold, 0.4);
        }
      }
    }
    const partner = ped.partner ? peds.find(other => other.id === ped.partner) : undefined;
    if (partner && (partner.mood === 'panic' || partner.state === 'flee') && ped.mood === 'calm' && ped.awareness > 0.35) {
      ped.fear = Math.min(1, ped.fear + 0.25);
      ped.mood = 'startled';
    }
    if (ped.mood === 'panic') {
      const awayX = ped.x - ped.threatX;
      const awayZ = ped.z - ped.threatZ;
      const dist = Math.hypot(awayX, awayZ) || 1;
      ped.goalX = ped.x + (awayX / dist) * 8;
      ped.goalZ = ped.z + (awayZ / dist) * 8;
      move(ped, ctx.dt, 3.6 + ped.pace * 1.3, ctx.blocked);
      if (ped.hold <= 0 && ped.fear < 0.28 && dist > 14) ped.mood = 'wary';
      continue;
    }
    if (ped.mood === 'calling') {
      ped.yaw = blendAngle(ped.yaw, yawToward(ctx.playerX - ped.x, ctx.playerZ - ped.z), 0.35);
      const close = Math.hypot(ctx.playerX - ped.x, ctx.playerZ - ped.z) < 3.2;
      if (close || ped.fear > 0.72) {
        panic(ped, ctx.playerX, ctx.playerZ, ears);
        continue;
      }
      ped.phase -= ctx.dt;
      if (ped.phase <= 0) {
        if (ped.crime > 0) reports.push({ pedId: ped.id, crime: ped.crime });
        ped.phase = -1;
        ped.mood = 'wary';
        ears.push({ kind: 'phone', x: ped.x, z: ped.z, gain: 0.7, pitch: 1 });
      }
      continue;
    }
    if (ped.mood === 'confront') {
      ped.yaw = yawToward(ctx.playerX - ped.x, ctx.playerZ - ped.z);
      if (ped.hold <= 0) {
        if (ped.lawful > 0.5 && ped.crime > 0) ped.mood = 'calling';
        else panic(ped, ctx.playerX, ctx.playerZ, ears);
        if (ped.mood === 'calling') ped.phase = 3;
      }
      continue;
    }
    if (ped.mood === 'avoid') {
      move(ped, ctx.dt, ped.pace * 1.4, ctx.blocked);
      if (ped.hold <= 0) ped.mood = 'wary';
      continue;
    }
    if (ped.mood === 'startled' && ped.hold <= 0) ped.mood = 'wary';
    routine(ped, ctx, partner);
    separate(ped, peds, ctx.blocked);
    const dx = ctx.playerX - ped.x;
    const dz = ctx.playerZ - ped.z;
    const playerDist = Math.hypot(dx, dz);
    if ((ped.mood === 'calm' || ped.mood === 'wary') && playerDist < 8 && playerDist > 0.2 && ped.activity !== 'cross') {
      ped.yaw = blendAngle(ped.yaw, yawToward(dx, dz), ped.activity === 'chat' ? 0.18 : 0.4);
      const comfort = ped.activity === 'chat' ? 1.45 : 2.1;
      if (playerDist < comfort) {
        ped.mood = 'avoid';
        ped.hold = 0.85;
        ped.goalX = ped.x + (-dz / playerDist) * 2.6;
        ped.goalZ = ped.z + (dx / playerDist) * 2.6;
      }
    }
  }
  if (reband) pairChats(peds, ctx.hours);
  return { reports, ears };
}
