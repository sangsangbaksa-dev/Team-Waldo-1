/** Application: player motor and pedestrian routines. Depends only on domain rules and the world map. */

import { CHUNK, DEPTH, WIDTH, blocked, districtAt, propsFor, roadDistance, roadHalf, type WorldProp } from '../world/domain';
import {
  idleStance, listeningPose, mulberry, playerLook, poseAt, wardrobeFor, yawToward,
  type Clip, type Locale, type Pose, type Role, type Wardrobe, type YawMode,
} from './domain';

export type Activity = 'stroll' | 'talk' | 'phone';
export type Stage = 'ground' | 'crouch' | 'air' | 'land' | 'punch' | 'enter';

export interface Motor {
  clip: Clip;
  phase: number;
  lift: number;
  emphasis: number;
  stage: Stage;
  time: number;
  vy: number;
}

export interface MotorIntent {
  moving: boolean;
  sprint: boolean;
  jump: boolean;
  punch: boolean;
  /** 0..1 while climbing into or out of a vehicle, otherwise null. */
  enter: number | null;
}

export interface Resident {
  id: string;
  x: number;
  z: number;
  yaw: number;
  locale: Locale;
  role: Role;
  activity: Activity;
  phone: 'ear' | 'screen';
  wardrobe: Wardrobe;
  path: { x: number; z: number }[];
  pathIndex: number;
  pause: number;
  phase: number;
  clip: Clip;
  emphasis: number;
  partnerId: string | null;
  speaker: boolean;
  talkT: number;
}

export function createMotor(): Motor {
  return { clip: 'idle', phase: 0, lift: 0, emphasis: 0, stage: 'ground', time: 0, vy: 0 };
}

export function stepMotor(motor: Motor, intent: MotorIntent, seconds: number): Motor {
  const dt = Math.max(0, Math.min(0.05, seconds));
  if (intent.enter != null) {
    motor.stage = 'enter';
    motor.clip = 'enter';
    motor.phase = Math.max(0, Math.min(1, intent.enter));
    motor.lift = 0;
    motor.vy = 0;
    motor.emphasis = 0;
    motor.time = motor.phase;
    return motor;
  }
  if (motor.stage === 'enter') motor.stage = 'ground';

  if (motor.stage === 'punch') {
    motor.time += dt;
    motor.clip = 'punch';
    motor.phase = Math.min(1, motor.time / 0.48);
    motor.lift = 0;
    if (motor.time < 0.48) return motor;
    motor.stage = 'ground';
  }

  if (motor.stage === 'crouch') {
    motor.time += dt;
    motor.clip = 'jump';
    motor.phase = Math.min(0.16, (motor.time / 0.11) * 0.16);
    motor.lift = 0;
    if (motor.time < 0.11) return motor;
    motor.stage = 'air';
    motor.vy = 6.1;
    motor.time = 0;
  }

  if (motor.stage === 'air') {
    motor.vy -= 17.5 * dt;
    motor.lift = Math.max(0, motor.lift + motor.vy * dt);
    motor.clip = 'jump';
    motor.phase = motor.vy >= 0 ? 0.3 + 0.22 * (1 - motor.vy / 6.1) : 0.55 + 0.25 * Math.min(1, -motor.vy / 8);
    if (motor.lift <= 0 && motor.vy < 0) {
      motor.lift = 0;
      motor.vy = 0;
      motor.stage = 'land';
      motor.time = 0;
    } else return motor;
  }

  if (motor.stage === 'land') {
    motor.time += dt;
    motor.clip = 'jump';
    motor.phase = 0.82 + 0.18 * Math.min(1, motor.time / 0.16);
    motor.lift = 0;
    motor.vy = 0;
    if (motor.time < 0.16) return motor;
    motor.stage = 'ground';
  }

  if (motor.stage === 'ground' && intent.punch) {
    motor.stage = 'punch';
    motor.time = 0;
    motor.clip = 'punch';
    motor.phase = 0;
    motor.lift = 0;
    motor.vy = 0;
    return motor;
  }

  if (motor.stage === 'ground' && intent.jump) {
    motor.stage = 'crouch';
    motor.time = 0;
    motor.clip = 'jump';
    motor.phase = 0;
    motor.lift = 0;
    motor.vy = 0;
    return motor;
  }

  motor.lift = 0;
  motor.vy = 0;
  motor.emphasis = 0;
  if (intent.moving) {
    motor.clip = intent.sprint ? 'run' : 'walk';
    motor.phase = (motor.phase + dt / (intent.sprint ? 0.44 : 0.78)) % 1;
  } else {
    motor.clip = 'idle';
    motor.phase = (motor.phase + dt / 2.6) % 1;
  }
  return motor;
}

function saltOf(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return hash >>> 0;
}

export function residentPose(resident: Resident): Pose {
  if (resident.clip === 'idle') return idleStance(saltOf(resident.id), resident.phase);
  if (resident.activity === 'talk' && resident.emphasis < 0.5) return listeningPose(resident.phase);
  return poseAt(resident.clip, resident.phase, resident.emphasis);
}

function localeOf(x: number, z: number): Locale {
  return districtAt(x, z).id;
}

function harborOpen(x: number, z: number, props: (cx: number, cz: number) => readonly WorldProp[]): boolean {
  if (x < 4 || z < 4 || x > WIDTH - 4 || z > DEPTH - 4) return false;
  const clearance = roadDistance(x, z);
  if (clearance < 1.15 || clearance > 5.5) return false;
  const cx = Math.floor(x / CHUNK);
  const cz = Math.floor(z / CHUNK);
  for (let i = cx - 1; i <= cx + 1; i += 1) {
    for (let j = cz - 1; j <= cz + 1; j += 1) {
      if (i < 0 || j < 0 || i >= WIDTH / CHUNK || j >= DEPTH / CHUNK) continue;
      if (blocked(x, z, props(i, j), 0.5)) return false;
    }
  }
  return true;
}

function makeResident(spec: {
  id: string;
  x: number;
  z: number;
  locale: Locale;
  role: Role;
  activity: Activity;
  phone: 'ear' | 'screen';
  salt: number;
  path: { x: number; z: number }[];
  partnerId: string | null;
  speaker: boolean;
}): Resident {
  const wardrobe = spec.role === 'player' ? playerLook() : wardrobeFor(spec.locale, spec.salt, spec.role);
  const march = spec.role === 'soldier' ? 1 : spec.role === 'officer' ? 0.7 : 0;
  return {
    id: spec.id, x: spec.x, z: spec.z, yaw: 0, locale: spec.locale, role: spec.role,
    activity: spec.activity, phone: spec.phone, wardrobe, path: spec.path, pathIndex: 0,
    pause: 0, phase: (spec.salt % 100) / 100, clip: spec.activity === 'talk' ? 'talk' : spec.activity === 'phone' ? 'phone' : 'idle',
    emphasis: spec.activity === 'phone' ? (spec.phone === 'screen' ? 1 : 0) : spec.activity === 'talk' ? (spec.speaker ? 1 : 0.28) : march,
    partnerId: spec.partnerId, speaker: spec.speaker, talkT: (spec.salt % 17) / 10,
  };
}

function sidewalkPath(x: number, z: number, axis: 'x' | 'z', open: (x: number, z: number) => boolean): { x: number; z: number }[] {
  const path: { x: number; z: number }[] = [];
  for (const delta of [-16, -4, 10, 22]) {
    const point = axis === 'z' ? { x, z: z + delta } : { x: x + delta, z };
    if (open(point.x, point.z)) path.push(point);
  }
  return path;
}

export function residentsForChunk(cx: number, cz: number): Resident[] {
  const vertical = cx % 2 === 0;
  const horizontal = cz % 2 === 0;
  if (!vertical && !horizontal) return [];
  const originX = cx * CHUNK;
  const originZ = cz * CHUNK;
  const locale = localeOf(originX + 64, originZ + 64);
  const rand = mulberry((Math.imul(cx + 3, 374761393) ^ Math.imul(cz + 5, 668265263) ^ 0x9e3779b9) >>> 0);
  const cache = new Map<string, readonly WorldProp[]>();
  const props = (ix: number, iz: number) => {
    const key = `${ix}:${iz}`;
    let found = cache.get(key);
    if (!found) {
      found = propsFor(ix, iz);
      cache.set(key, found);
    }
    return found;
  };
  const open = (x: number, z: number) => harborOpen(x, z, props);
  const out: Resident[] = [];
  const halfV = vertical ? roadHalf('x', originX + 64) : 0;
  const halfH = horizontal ? roadHalf('z', originZ + 64) : 0;
  const side = rand() < 0.5 ? -1 : 1;
  const saltBase = cx * 1000 + cz * 17;

  if (vertical && horizontal && (locale === 'rich' || locale === 'city' || locale === 'slum')) {
    const ax = originX + 64 + side * (halfV + 2.35);
    const az = originZ + 64 + side * (halfH + 2.35);
    const bz = az + 0.95;
    if (open(ax, az) && open(ax, bz)) {
      const idA = `${cx}:${cz}:talk:a`;
      const idB = `${cx}:${cz}:talk:b`;
      out.push(makeResident({
        id: idA, x: ax, z: az, locale, role: 'local', activity: 'talk', phone: 'ear',
        salt: saltBase + 1, path: [], partnerId: idB, speaker: true,
      }));
      out.push(makeResident({
        id: idB, x: ax, z: az + 0.95, locale, role: 'local', activity: 'talk', phone: 'screen',
        salt: saltBase + 2, path: [], partnerId: idA, speaker: false,
      }));
    }
  }

  const along = vertical ? 'z' as const : 'x' as const;
  const road = along === 'z' ? originX + 64 : originZ + 64;
  const half = along === 'z' ? halfV : halfH;
  const offset = side * (half + 2.35);
  const local = (cz + cx) % 2 === 0 ? 46 : 78;
  const solo = along === 'z'
    ? { x: road + offset, z: originZ + local }
    : { x: originX + local, z: road + offset };
  if (open(solo.x, solo.z)) {
    const cityOfficer = locale === 'city' && (cx + cz) % 4 === 0;
    const role: Role = locale === 'base' ? 'soldier' : cityOfficer ? 'officer' : 'local';
    let activity: Activity = 'stroll';
    if (role === 'local' && (locale === 'slum' || locale === 'desert' || locale === 'rich')) activity = 'phone';
    if (role === 'soldier' || role === 'officer') activity = 'stroll';
    const phone = rand() < 0.55 ? 'screen' : 'ear';
    const path = activity === 'stroll' ? sidewalkPath(solo.x, solo.z, along, open) : [];
    if (activity === 'stroll' && path.length < 2) activity = 'phone';
    out.push(makeResident({
      id: `${cx}:${cz}:solo`, x: solo.x, z: solo.z, locale, role, activity, phone,
      salt: saltBase + 3, path: activity === 'stroll' ? path : [], partnerId: null, speaker: false,
    }));
  }

  if (locale === 'base' && vertical) {
    const patrol = { x: originX + 64 - side * (halfV + 2.35), z: originZ + 96 };
    if (open(patrol.x, patrol.z) && !out.some(r => Math.hypot(r.x - patrol.x, r.z - patrol.z) < 2)) {
      const path = sidewalkPath(patrol.x, patrol.z, 'z', open);
      out.push(makeResident({
        id: `${cx}:${cz}:patrol`, x: patrol.x, z: patrol.z, locale, role: 'soldier',
        activity: path.length >= 2 ? 'stroll' : 'phone', phone: 'ear', salt: saltBase + 4,
        path, partnerId: null, speaker: false,
      }));
    }
  }

  const axes: Array<'x' | 'z'> = [];
  if (vertical) axes.push('z');
  if (horizontal) axes.push('x');
  let extra = 0;
  for (const axis of axes) {
    for (const local of [18, 108]) {
      for (const sign of [-1, 1] as const) {
        const half = axis === 'z' ? halfV : halfH;
        const road = axis === 'z' ? originX + 64 : originZ + 64;
        const offset = sign * (half + 2.35);
        const point = axis === 'z'
          ? { x: road + offset, z: originZ + local }
          : { x: originX + local, z: road + offset };
        if (!open(point.x, point.z) || out.some(r => Math.hypot(r.x - point.x, r.z - point.z) < 2.4)) continue;
        const role: Role = locale === 'base' ? 'soldier' : 'local';
        let activity: Activity = role === 'soldier' || locale === 'city' || locale === 'forest' ? 'stroll' : 'phone';
        const phone: 'ear' | 'screen' = (saltBase + extra) % 2 === 0 ? 'screen' : 'ear';
        const path = activity === 'stroll' ? sidewalkPath(point.x, point.z, axis, open) : [];
        if (activity === 'stroll' && path.length < 2) activity = 'phone';
        out.push(makeResident({
          id: `${cx}:${cz}:walk:${extra}`, x: point.x, z: point.z, locale, role, activity, phone,
          salt: saltBase + 20 + extra, path: activity === 'stroll' ? path : [],
          partnerId: null, speaker: false,
        }));
        extra += 1;
      }
    }
  }

  for (const resident of out) {
    if (resident.activity === 'talk' && resident.partnerId) {
      const partner = out.find(other => other.id === resident.partnerId);
      if (partner) resident.yaw = yawToward(partner.x - resident.x, partner.z - resident.z, 'harbor');
    } else if (resident.path[0]) {
      resident.yaw = yawToward(resident.path[0].x - resident.x, resident.path[0].z - resident.z, 'harbor');
    }
  }
  return out;
}

export interface DriveResidentOptions {
  roads: readonly number[];
  limit: number;
  sidewalk: number;
  localeAt: (x: number, z: number) => Locale;
  avoid: (x: number, z: number) => boolean;
  capPerLocale?: number;
}

export function driveResidents(options: DriveResidentOptions): Resident[] {
  const cap = options.capPerLocale ?? 3;
  const buckets = new Map<Locale, Resident[]>();
  let n = 0;
  const consider = (x: number, z: number, axis: 'x' | 'z') => {
    if (!options.avoid(x, z)) return;
    const locale = options.localeAt(x, z);
    const list = buckets.get(locale) ?? [];
    if (list.length >= cap) return;
    const salt = (n += 1) * 17 + Math.round(x) + Math.round(z) * 3;
    const role: Role = locale === 'base' ? 'soldier' : locale === 'city' && list.length === 0 ? 'officer' : 'local';
    let activity: Activity = role === 'soldier' || role === 'officer' ? 'stroll'
      : locale === 'forest' ? 'stroll'
        : locale === 'slum' || locale === 'desert' ? 'phone'
          : locale === 'rich' || locale === 'city' ? 'talk' : 'stroll';
    const partnerSpot = axis === 'z' ? { x, z: z + 0.95 } : { x: x + 0.95, z };
    let partner: Resident | null = null;
    if (activity === 'talk') {
      if (!options.avoid(partnerSpot.x, partnerSpot.z) || list.length + 2 > cap) activity = locale === 'rich' ? 'phone' : 'stroll';
    }
    const phone = salt % 2 === 0 ? 'screen' : 'ear';
    const id = `drive:${locale}:${list.length}:${salt}`;
    const path = activity === 'stroll' ? sidewalkPath(x, z, axis, options.avoid) : [];
    if (activity === 'stroll' && path.length < 2) activity = 'phone';
    const resident = makeResident({
      id, x, z, locale, role, activity, phone, salt, path: activity === 'stroll' ? path : [],
      partnerId: null, speaker: true,
    });
    if (activity === 'talk') {
      const partnerId = `${id}:b`;
      resident.partnerId = partnerId;
      partner = makeResident({
        id: partnerId, x: partnerSpot.x, z: partnerSpot.z, locale, role: 'local', activity: 'talk',
        phone: 'ear', salt: salt + 1, path: [], partnerId: id, speaker: false,
      });
      resident.yaw = yawToward(partner.x - resident.x, partner.z - resident.z, 'drive');
      partner.yaw = yawToward(resident.x - partner.x, resident.z - partner.z, 'drive');
    } else if (resident.path[0]) {
      resident.yaw = yawToward(resident.path[0].x - resident.x, resident.path[0].z - resident.z, 'drive');
    }
    list.push(resident);
    if (partner) list.push(partner);
    buckets.set(locale, list);
  };
  const reach = options.limit - 36;
  const stations = [0];
  for (let t = 24; t <= reach; t += 24) stations.push(t, -t);
  for (const road of options.roads) {
    for (const side of [-1, 1]) {
      const line = road + side * options.sidewalk;
      for (const t of stations) {
        consider(line, t, 'z');
        consider(t, line, 'x');
      }
    }
  }
  return [...buckets.values()].flat();
}

function rankNearest(all: readonly Resident[], x: number, z: number, cap: number): Resident[] {
  const groups = new Map<string, Resident[]>();
  for (const resident of all) {
    const key = resident.partnerId ? [resident.id, resident.partnerId].sort().join('|') : resident.id;
    const group = groups.get(key) ?? [];
    group.push(resident);
    groups.set(key, group);
  }
  const ranked = [...groups.values()].map(group => ({
    group,
    distance: Math.min(...group.map(resident => (resident.x - x) ** 2 + (resident.z - z) ** 2)),
  })).sort((a, b) => a.distance - b.distance);
  const out: Resident[] = [];
  for (const item of ranked) {
    if (out.length + item.group.length > cap) continue;
    out.push(...item.group);
  }
  return out;
}

function stepResident(
  resident: Resident,
  dt: number,
  avoid: (x: number, z: number) => boolean,
  player: { x: number; z: number },
  byId: ReadonlyMap<string, Resident>,
  mode: YawMode,
): void {
  if (resident.activity === 'talk') {
    const partner = resident.partnerId ? byId.get(resident.partnerId) : undefined;
    if (partner) resident.yaw = yawToward(partner.x - resident.x, partner.z - resident.z, mode);
    resident.talkT += dt;
    if (resident.talkT >= 3.4) {
      resident.talkT = 0;
      resident.speaker = !resident.speaker;
    }
    resident.clip = 'talk';
    resident.phase = (resident.phase + dt / 1.5) % 1;
    resident.emphasis = resident.speaker ? 1 : 0.28;
    return;
  }
  if (resident.activity === 'phone') {
    resident.clip = 'phone';
    resident.phase = (resident.phase + dt / 2.4) % 1;
    resident.emphasis = resident.phone === 'screen' ? 1 : 0;
    return;
  }
  if (resident.pause > 0 || resident.path.length < 2) {
    resident.pause = Math.max(0, resident.pause - dt);
    resident.clip = 'idle';
    resident.phase = (resident.phase + dt / 2.5) % 1;
    resident.emphasis = 0;
    return;
  }
  const target = resident.path[resident.pathIndex % resident.path.length]!;
  const dx = target.x - resident.x;
  const dz = target.z - resident.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.45) {
    resident.pathIndex = (resident.pathIndex + 1) % resident.path.length;
    resident.pause = 0.25 + ((resident.pathIndex * 17) % 8) / 10;
    resident.clip = 'idle';
    return;
  }
  const speed = resident.role === 'soldier' ? 1.65 : resident.role === 'officer' ? 1.45 : 1.25;
  const step = Math.min(dist, speed * dt);
  let nx = resident.x + (dx / dist) * step;
  let nz = resident.z + (dz / dist) * step;
  if (Math.hypot(nx - player.x, nz - player.z) < 0.9) {
    resident.clip = 'idle';
    resident.pause = 0.2;
    return;
  }
  if (!avoid(nx, nz)) {
    const sideX = -dz / dist;
    const sideZ = dx / dist;
    if (avoid(nx + sideX * 0.45, nz + sideZ * 0.45)) {
      nx += sideX * 0.45;
      nz += sideZ * 0.45;
    } else {
      resident.pathIndex = (resident.pathIndex + 1) % resident.path.length;
      resident.pause = 0.35;
      resident.clip = 'idle';
      return;
    }
  }
  resident.x = nx;
  resident.z = nz;
  const face = yawToward(dx, dz, mode);
  let delta = face - resident.yaw;
  delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  resident.yaw += delta * Math.min(1, dt * 6);
  resident.clip = 'walk';
  resident.phase = (resident.phase + dt / (resident.role === 'soldier' ? 0.62 : 0.78)) % 1;
  resident.emphasis = resident.role === 'soldier' ? 1 : resident.role === 'officer' ? 0.7 : 0;
}

export class Residents {
  list: Resident[] = [];
  private cx = Number.NaN;
  private cz = Number.NaN;
  private readonly props = new Map<string, WorldProp[]>();

  constructor(private readonly mode: YawMode) {}

  follow(x: number, z: number): void {
    if (this.mode !== 'harbor') return;
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    if (cx === this.cx && cz === this.cz) return;
    this.cx = cx;
    this.cz = cz;
    const spawned: Resident[] = [];
    for (let i = cx - 2; i <= cx + 2; i += 1) {
      for (let j = cz - 2; j <= cz + 2; j += 1) {
        if (i < 0 || j < 0 || i >= WIDTH / CHUNK || j >= DEPTH / CHUNK) continue;
        spawned.push(...residentsForChunk(i, j));
      }
    }
    const wanted = rankNearest(spawned, x, z, 18);
    const previous = new Map(this.list.map(resident => [resident.id, resident]));
    this.list = wanted.map(resident => previous.get(resident.id) ?? resident);
    this.props.clear();
  }

  load(list: readonly Resident[]): void {
    this.list = list.map(resident => ({ ...resident, path: resident.path.map(point => ({ ...point })) }));
  }

  step(seconds: number, player: { x: number; z: number }, avoid?: (x: number, z: number) => boolean): void {
    const dt = Math.max(0, Math.min(0.05, seconds));
    const clear = avoid ?? ((x: number, z: number) => this.harborClear(x, z));
    const byId = new Map(this.list.map(resident => [resident.id, resident]));
    for (const resident of this.list) stepResident(resident, dt, clear, player, byId, this.mode);
  }

  private harborClear(x: number, z: number): boolean {
    return harborOpen(x, z, (cx, cz) => {
      const key = `${cx}:${cz}`;
      let props = this.props.get(key);
      if (!props) {
        props = propsFor(cx, cz);
        this.props.set(key, props);
      }
      return props;
    });
  }
}
