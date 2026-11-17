// OUTLAW CITY — 시뮬레이션 코어. 화면과 무관하게 돌아가며(헤드리스 테스트 가능), 모든 모듈이 부르는 공용 서비스(전투·피해·폭발·탑승·줍기·리스폰)를 가집니다.
// AI 와 물리는 각 모듈이 맡습니다: peds(보행자 AI·스트리밍) · combat(적대 보병 AI) · traffic(교통) · police(수배·경찰) · vehicle(차량 물리) · missions(미션).
import {
  WEAPONS, WEAPON_ORDER, VEHICLES, PLAYER_ID, GRAVITY, blankPedInput, blankCarInput, blankMissionState, blankActivityState, blankJobState, clamp, makeRng, wrapAngle,
  type Ped, type PedInput, type CarInput, type PedKind, type Vehicle, type VehicleKind, type Pickup, type PickupKind, type Projectile, type SimEvent, type Crime, type CrimeKind,
  type Wanted, type JobState, type MissionState, type ActivityState, type CityMap, type WeaponId, type Gun, type Poi, type Team,
} from './types';
import { generateCity, moveCircle, rayStatic, groundHeight } from './world';
import { stepVehicle } from './vehicle';
import { stepPeds } from './peds';
import { stepCombat } from './combat';
import { stepTraffic } from './traffic';
import { stepPolice } from './police';
import { stepMissions } from './missions';
import { stepActivities } from './activities';
import { blankLife, computePerks, heroById, BASE_PERKS, type LifeState, type Perks } from './life';
import { stepLife } from './services';
import { stepJobs } from './jobs';

export interface SaveData { v: 1; stunts?: number[]; styleTotal?: number; cash: number; completed: string[]; guns: Array<[WeaponId, number, number]>; armor: number; collected: number[]; clock: number; kills: number; playSec: number; life?: LifeState }
export const STREAM_RADIUS = 190;
export const DAY_SECONDS = 1200;
/** 시간에 따른 날씨(0 맑음 ~ 1 폭우). 결정적이라 같은 시각엔 같은 날씨입니다. */
export const rainTarget = (t: number): number => { const w = Math.sin(t / 173) + 0.7 * Math.sin(t / 61 + 1.3) + 0.4 * Math.sin(t / 311 + 4); return Math.min(1, Math.max(0, (w - 0.35) / 0.9)); };

const PED_STATS: Record<PedKind, { hp: number; armor: number; team: Team }> = {
  player: { hp: 100, armor: 0, team: 'player' }, civ: { hp: 60, armor: 0, team: 'civ' }, cop: { hp: 100, armor: 0, team: 'cop' },
  swat: { hp: 150, armor: 60, team: 'cop' }, soldier: { hp: 220, armor: 100, team: 'cop' }, gang: { hp: 90, armor: 0, team: 'gang' }, boss: { hp: 320, armor: 80, team: 'gang' },
};
const NAMES = ['민수', '지훈', '서연', '도윤', '하은', '준서', '유진', '태양', '나래', '재현', '소라', '건우', '다온', '시우', '예린'];

/** 레이 대 회전 직사각형(수평 슬랩). 방향 d 는 정규화하지 않아도 되며 t 는 d 단위. 맞지 않으면 -1. */
export function rayVsObb(ox: number, oz: number, dx: number, dz: number, cx: number, cz: number, h: number, hl: number, hw: number): number {
  const c = Math.cos(h), s = Math.sin(h), rx = ox - cx, rz = oz - cz;
  const of = rx * c + rz * s, ol = -rx * s + rz * c, df = dx * c + dz * s, dl = -dx * s + dz * c;
  let t0 = 0, t1 = Infinity;
  for (const [o, d, e] of [[of, df, hl], [ol, dl, hw]] as const) {
    if (Math.abs(d) < 1e-9) { if (Math.abs(o) > e) return -1; continue; }
    let a = (-e - o) / d, b = (e - o) / d; if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return -1;
  }
  return t0;
}

export class Sim {
  map: CityMap; seed: number; t = 0; frame = 0; /** 시각(0~24시) */ clock = 14.8; /** 비 세기(0~1) */ rain = 0; rng: () => number;
  peds: Ped[] = []; vehicles: Vehicle[] = []; pickups: Pickup[] = []; projectiles: Projectile[] = []; events: SimEvent[] = []; crimes: Crime[] = [];
  /** 경찰이 도로에 깐 스파이크 스트립 */ spikes: Array<{ x: number; z: number; h: number }> = [];
  wanted: Wanted = { heat: 0, stars: 0, unseenT: 99, lastX: 0, lastZ: 0, evadeT: 0, cops: 0 };
  mission: MissionState = blankMissionState();
  /** 휴대폰으로 받는 일거리 */ job: JobState = blankJobState();
  /** 스타일 점수·스턴트 점프·사이드 활동(activities.ts) */ activity: ActivityState = blankActivityState();
  /** 주인공·부동산·차고·업적 */ life: LifeState = blankLife(); perk: Perks = { ...BASE_PERKS };
  civKills = 0; cash = 400; collected = new Set<number>(); kills = 0; playSec = 0;
  player!: Ped; /** 쓰러짐/체포 연출 타이머와 종류 */ deadT = 0; downKind: '' | 'wasted' | 'busted' = '';
  private pedMap = new Map<number, Ped>(); private vehMap = new Map<number, Vehicle>(); private nextId = 100; private lastAssault = new Map<number, number>();

  constructor(seed: number, save?: SaveData | null) {
    this.seed = seed; this.rng = makeRng(seed ^ 0x51ed270b); this.map = generateCity(seed);
    const start = this.map.pois.find(p => p.id === 'safe0') ?? this.map.pois.find(p => p.kind === 'safehouse') ?? this.map.pois[0];
    const sx = start?.x ?? 0, sz = start?.z ?? 0;
    const p = this.spawnPed('player', sx, sz + 3, { id: PLAYER_ID, name: '나', keep: true }); this.player = p;
    p.guns[0] = { id: 'fist', mag: 0, reserve: 0 }; p.guns[1] = { id: 'pistol', mag: 12, reserve: 48 }; p.cur = 1;
    this.seedPickups();
    if (save) this.applySave(save);
  }

  // ---------- 저장 ----------
  exportSave(): SaveData {
    const p = this.player;
    return { v: 1, stunts: [...this.activity.stunts], styleTotal: Math.floor(this.activity.style.total), cash: Math.floor(this.cash), completed: [...this.mission.completed], guns: p.guns.filter((g): g is Gun => !!g && g.id !== 'fist').map(g => [g.id, g.mag, g.reserve]), armor: Math.floor(p.armor), collected: [...this.collected], clock: this.clock, kills: this.kills, playSec: Math.floor(this.playSec), life: JSON.parse(JSON.stringify(this.life)) as LifeState };
  }
  applySave(s: SaveData): void {
    this.activity.stunts = [...(s.stunts ?? [])]; this.activity.style.total = s.styleTotal ?? 0; this.cash = s.cash; this.mission.completed = [...s.completed]; this.collected = new Set(s.collected); this.clock = s.clock; this.kills = s.kills; this.playSec = s.playSec; this.player.armor = s.armor;
    for (const [id, mag, reserve] of s.guns) { const i = WEAPON_ORDER.indexOf(id); if (i > 0) this.player.guns[i] = { id, mag, reserve }; }
    for (const pk of this.pickups) if (pk.collect >= 0 && this.collected.has(pk.collect)) pk.taken = true;
    if (s.life) { this.life = { ...blankLife(), ...s.life, skills: { ...blankLife().skills, ...s.life.skills } }; this.applyHero(this.life.hero, false); this.player.armor = s.armor; }
  }
  /** 주인공 시민을 정하고 능력치를 반영합니다. fresh 면 체력·방탄을 새로 채웁니다. */
  applyHero(id: string, fresh = true): void {
    const h = heroById(id); this.life.hero = h.id; this.refreshPerks(); const p = this.player; p.variant = h.variant; p.name = h.name;
    p.maxHp = this.perk.hp; if (fresh) { p.hp = p.maxHp; p.armor = this.perk.armor; } else p.hp = Math.min(p.maxHp, Math.max(p.hp, 1));
  }
  refreshPerks(): void { this.perk = computePerks(this.life); }
  /** 상점 가격(주인공 할인 반영) */ price(n: number): number { return Math.max(1, Math.ceil(n * this.perk.price)); }
  /** 일·활동으로 번 돈(주인공 수입 배율 반영) */ earn(n: number): number { const v = Math.round(n * this.perk.pay); this.addCash(v); return v; }
  /** 통계 카운터 */ count(key: string, n = 1): void { this.life.counters[key] = (this.life.counters[key] ?? 0) + n; }

  // ---------- 조회 ----------
  ped(id: number): Ped | undefined { return this.pedMap.get(id); }
  vehicle(id: number): Vehicle | undefined { return this.vehMap.get(id); }
  emit(e: SimEvent): void { this.events.push(e); }
  drain(): SimEvent[] { const e = this.events; this.events = []; return e; }
  say(text: string, sec = 3): void { this.emit({ t: 'msg', text, sec }); }
  hostile(a: Team, b: Team): boolean {
    if (a === b) return false;
    if (a === 'civ' || b === 'civ') return false;
    return true; // player·cop·gang 는 서로 적대
  }
  curGun(p: Ped): Gun | null { return p.guns[p.cur] ?? null; }
  eyeY(p: Ped): number { return p.y + (p.crouch ? 1.15 : 1.6); }
  nearPoi(x: number, z: number): Poi | null { let best: Poi | null = null, bd = Infinity; for (const q of this.map.pois) { const d = Math.hypot(q.x - x, q.z - z); if (d < q.r && d < bd) { bd = d; best = q; } } return best; }
  addCash(n: number): void { this.cash = Math.max(0, this.cash + n); this.emit({ t: 'cash', amount: n, total: this.cash }); }
  addCrime(kind: CrimeKind, x: number, z: number, by: number, victim: number, weight: number): void { this.crimes.push({ kind, x, z, by, victim, weight, t: this.t }); }
  setStars(stars: number): void { const prev = this.wanted.stars; if (stars === prev) return; this.wanted.stars = stars; this.emit({ t: 'wanted', stars, prev }); }
  /** 수평 시야: 건물에 가리지 않으면 true */
  canSee(ax: number, az: number, bx: number, bz: number, y = 1.5): boolean { const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz); if (d < 0.5) return true; return rayStatic(this.map, ax, y, az, dx / d, 0, dz / d, d) >= d - 0.3; }

  // ---------- 생성·제거 ----------
  spawnPed(kind: PedKind, x: number, z: number, o: Partial<Ped> = {}): Ped {
    const st = PED_STATS[kind], id = o.id ?? this.nextId++, r = this.rng;
    const p: Ped = {
      id, kind, team: st.team, variant: Math.floor(r() * 8), name: NAMES[Math.floor(r() * NAMES.length)],
      x, y: groundHeight(this.map, x, z), z, vx: 0, vz: 0, vy: 0, grounded: true, yaw: r() * Math.PI * 2, pitch: 0, hp: st.hp, maxHp: st.hp, armor: st.armor, alive: true, diedAt: 0,
      guns: WEAPON_ORDER.map(() => null), cur: 0, reload: 0, cd: 0.3, fireHeld: false, aiming: false, vehicle: 0, seat: 0, input: blankPedInput(), mode: 'idle',
      tx: x, tz: z, timer: 0, target: 0, fear: 0, aux: 0, aux2: 0, walk: 0, speed: 0, muzzle: 0, kick: 0, hurt: 0, hurtYaw: 0, lastHitBy: 0, crouch: false, punchT: 0, keep: false, tag: '',
      loot: kind === 'civ' ? 5 + Math.floor(r() * 55) : kind === 'player' ? 0 : 20 + Math.floor(r() * 80),
    };
    Object.assign(p, o); p.maxHp = o.maxHp ?? p.hp;
    p.guns[0] = { id: 'fist', mag: 0, reserve: 0 };
    if (!o.guns) {
      const give = (id: WeaponId, reserveMul = 3): void => { const d = WEAPONS[id]; p.guns[WEAPON_ORDER.indexOf(id)] = { id, mag: d.mag, reserve: d.mag * reserveMul }; };
      if (kind === 'cop') give('pistol'); else if (kind === 'swat') give(r() < 0.5 ? 'rifle' : 'smg'); else if (kind === 'soldier') give('rifle', 6);
      else if (kind === 'gang') give(r() < 0.5 ? 'pistol' : r() < 0.6 ? 'smg' : 'shotgun'); else if (kind === 'boss') { give('smg', 6); give('shotgun', 6); }
      p.cur = p.guns.findIndex((g, i) => i > 0 && !!g); if (p.cur < 0) p.cur = 0;
    }
    this.peds.push(p); this.pedMap.set(p.id, p); return p;
  }
  spawnVehicle(kind: VehicleKind, x: number, z: number, h: number, o: Partial<Vehicle> = {}): Vehicle {
    const d = VEHICLES[kind], id = this.nextId++, colors = [0xb23a32, 0x2c5f9e, 0xe8e8e8, 0x222428, 0xd9b13c, 0x3f7f4b, 0x7a7d84, 0x8a3fa0, 0xe06d1f];
    const v: Vehicle = {
      id, kind, color: colors[Math.floor(this.rng() * colors.length)], x, y: groundHeight(this.map, x, z), z, h, vx: 0, vz: 0, vf: 0, vl: 0, yawRate: 0, steer: 0, hp: d.hp, maxHp: d.hp, alive: true, burn: 0, wrecked: false,
      driver: 0, passengers: [], input: blankCarInput(), mode: 'parked', lane: -1, nextLane: -1, path: [], timer: 0, stuck: 0, target: 0, aux: 0, siren: false, hornT: 0, crashT: 0, pitch: 0, roll: 0, wheel: 0, stolen: false, keep: false, tag: '', locked: false,
    };
    Object.assign(v, o); this.vehicles.push(v); this.vehMap.set(v.id, v); return v;
  }
  removePed(p: Ped): void {
    if (p.id === PLAYER_ID) return; if (p.vehicle) { const v = this.vehMap.get(p.vehicle); if (v) { if (v.driver === p.id) v.driver = 0; v.passengers = v.passengers.filter(i => i !== p.id); } }
    this.pedMap.delete(p.id); const i = this.peds.indexOf(p); if (i >= 0) this.peds.splice(i, 1);
  }
  removeVehicle(v: Vehicle): void {
    for (const id of [v.driver, ...v.passengers]) { const p = this.pedMap.get(id); if (p) { p.vehicle = 0; if (p.id !== PLAYER_ID) this.removePed(p); else { p.x = v.x; p.z = v.z; } } }
    this.vehMap.delete(v.id); const i = this.vehicles.indexOf(v); if (i >= 0) this.vehicles.splice(i, 1);
  }
  spawnPickup(kind: PickupKind, x: number, z: number, o: Partial<Pickup> = {}): Pickup {
    const pk: Pickup = { id: this.nextId++, kind, x, y: groundHeight(this.map, x, z), z, amount: 0, weapon: null, taken: false, respawn: 0, collect: -1, ...o }; this.pickups.push(pk); return pk;
  }
  private seedPickups(): void {
    const r = makeRng(this.seed ^ 0x77aa), pts = this.map.walkPoints, placed: Array<{ x: number; z: number }> = []; let n = 0;
    for (let tries = 0; n < 30 && tries < 600 && pts.length; tries++) {
      const q = pts[Math.floor(r() * pts.length)]; if (placed.some(o => Math.hypot(o.x - q.x, o.z - q.z) < 70)) continue; placed.push(q);
      this.spawnPickup('package', q.x, q.z, { amount: 150, collect: n++ });
    }
    const guns: WeaponId[] = ['pistol', 'smg', 'shotgun', 'rifle', 'pistol', 'smg'];
    for (let i = 0; i < guns.length && pts.length; i++) { const q = pts[Math.floor(r() * pts.length)]; this.spawnPickup('weapon', q.x, q.z, { weapon: guns[i], amount: 1, respawn: 120 }); }
    for (const poi of this.map.pois) { if (poi.kind === 'hospital') this.spawnPickup('health', poi.x + 3, poi.z + 3, { amount: 60, respawn: 60 }); if (poi.kind === 'safehouse') this.spawnPickup('armor', poi.x + 3, poi.z - 3, { amount: 50, respawn: 180 }); }
  }

  // ---------- 피해 ----------
  damagePed(q: Ped, dmg: number, by: number, weapon: WeaponId | 'vehicle' | 'explosion' | 'fall' | 'fire', _head = false): void {
    if (!q.alive || dmg <= 0) return;
    if (q.armor > 0 && weapon !== 'fall' && weapon !== 'fire') { const soak = Math.min(q.armor, dmg * 0.6); q.armor -= soak; dmg -= soak; }
    q.hp -= dmg; q.hurt = 0.45; q.lastHitBy = by; const a = this.pedMap.get(by); if (a) q.hurtYaw = Math.atan2(a.z - q.z, a.x - q.x);
    if (by === PLAYER_ID && q.id !== PLAYER_ID && (q.team === 'civ' || q.team === 'cop') && weapon !== 'explosion') {
      const last = this.lastAssault.get(q.id) ?? -9; if (this.t - last > 1.2) { this.lastAssault.set(q.id, this.t); this.addCrime(q.team === 'cop' ? 'copAssault' : 'assault', q.x, q.z, by, q.id, q.team === 'cop' ? 1.5 : 0.6); }
    }
    if (q.hp <= 0) this.killPed(q, by, weapon);
  }
  killPed(q: Ped, by: number, weapon: WeaponId | 'vehicle' | 'explosion' | 'fall' | 'fire'): void {
    if (!q.alive) return; q.alive = false; q.hp = 0; q.diedAt = this.t; q.input = blankPedInput(); q.fireHeld = false;
    if (q.vehicle) { const v = this.vehMap.get(q.vehicle); if (v) { if (v.driver === q.id) { v.driver = 0; if (v.mode === 'traffic' || v.mode === 'police') v.mode = 'none'; v.input = blankCarInput(); v.input.brake = 1; } v.passengers = v.passengers.filter(i => i !== q.id); this.placeBeside(q, v); } q.vehicle = 0; }
    if (q.loot > 0 && q.id !== PLAYER_ID) this.spawnPickup('cash', q.x, q.z, { amount: Math.round(q.loot * (by === PLAYER_ID ? this.perk.loot : 1)) });
    this.emit({ t: 'death', id: q.id, by, weapon });
    if (by === PLAYER_ID && q.id !== PLAYER_ID) {
      this.kills++;
      if (q.team === 'civ') this.civKills++;
      if (q.team === 'civ') this.addCrime('murder', q.x, q.z, by, q.id, 2.2); else if (q.team === 'cop') this.addCrime('copMurder', q.x, q.z, by, q.id, q.kind === 'cop' ? 3 : 4);
    }
    if (q.id === PLAYER_ID) { this.downKind = 'wasted'; this.deadT = 0; this.emit({ t: 'wasted' }); }
  }
  damageVehicle(v: Vehicle, dmg: number, by: number): void {
    if (v.wrecked || dmg <= 0) return; v.hp -= dmg;
    if (v.hp <= 0) {
      v.hp = 0; v.wrecked = true; v.burn = 2.2 + this.rng() * 2.2; v.timer = 0; this.emit({ t: 'wreck', id: v.id }); v.target = by;
      for (const id of [v.driver, ...v.passengers]) { const p = this.pedMap.get(id); if (!p) continue; this.ejectFrom(p, v); if (p.alive) { this.damagePed(p, 12 + this.rng() * 14, by, 'vehicle'); if (p.id !== PLAYER_ID) { p.mode = 'flee'; p.fear = 1; p.timer = 8; } } }
      v.driver = 0; v.passengers = []; v.mode = 'none'; v.siren = false; v.input = blankCarInput();
    }
  }
  explode(x: number, y: number, z: number, r: number, dmg: number, by: number): void {
    this.emit({ t: 'explosion', x, y, z, r });
    for (const q of this.peds) { if (!q.alive) continue; const d = Math.hypot(q.x - x, q.y + 1 - y, q.z - z); if (d > r) continue; const f = 1 - d / r; this.damagePed(q, dmg * f, by, 'explosion'); const dd = Math.max(0.5, Math.hypot(q.x - x, q.z - z)); q.vx += (q.x - x) / dd * 9 * f; q.vz += (q.z - z) / dd * 9 * f; q.vy = Math.max(q.vy, 4 * f); q.grounded = false; if (q.id !== PLAYER_ID) { q.fear = 1; if (q.team === 'civ') { q.mode = 'flee'; q.timer = 8; } } }
    for (const v of this.vehicles.slice()) { const d = Math.hypot(v.x - x, v.y + 0.8 - y, v.z - z); if (d > r + 3) continue; const f = 1 - d / (r + 3); this.damageVehicle(v, dmg * f * 1.6, by); const dd = Math.max(0.5, Math.hypot(v.x - x, v.z - z)); v.vx += (v.x - x) / dd * 14 * f; v.vz += (v.z - z) / dd * 14 * f; v.crashT = 0.3; }
    if (by === PLAYER_ID) this.addCrime('explosion', x, z, by, 0, 2);
  }

  // ---------- 탑승 ----------
  vehicleDoor(v: Vehicle, side: 1 | -1): { x: number; z: number } { const d = VEHICLES[v.kind], off = d.halfW + 0.9; return { x: v.x + Math.sin(v.h) * off * side, z: v.z - Math.cos(v.h) * off * side }; }
  private placeBeside(p: Ped, v: Vehicle): void {
    for (const side of [1, -1] as const) { const q = this.vehicleDoor(v, side), m = moveCircle(this.map, q.x, q.z, 0.4, v.y, v.y + 1.8); if (!m.hit || side === -1) { p.x = m.x; p.z = m.z; break; } }
    p.y = groundHeight(this.map, p.x, p.z); p.vx = v.vx * 0.5; p.vz = v.vz * 0.5; p.grounded = true;
  }
  private ejectFrom(p: Ped, v: Vehicle): void { p.vehicle = 0; this.placeBeside(p, v); }
  /** 가까이 있는 탈 수 있는 차량(플레이어 기준) */
  nearestVehicle(p: Ped, maxD = 3.4): Vehicle | null {
    let best: Vehicle | null = null, bd = maxD;
    for (const v of this.vehicles) { if (v.wrecked || !v.alive) continue; const d = VEHICLES[v.kind], dx = p.x - v.x, dz = p.z - v.z, c = Math.cos(v.h), s = Math.sin(v.h), lf = Math.abs(dx * c + dz * s) - d.halfL, ll = Math.abs(-dx * s + dz * c) - d.halfW, e = Math.hypot(Math.max(0, lf), Math.max(0, ll)); if (e < bd) { bd = e; best = v; } }
    return best;
  }
  enterVehicle(p: Ped, v: Vehicle): boolean {
    if (p.vehicle || v.wrecked || !p.alive) return false;
    if (v.driver && v.driver !== p.id) {
      const old = this.pedMap.get(v.driver);
      if (v.locked && p.id === PLAYER_ID) { this.say('잠겨 있어 탈 수 없습니다', 2); return false; }
      if (old) {
        this.ejectFrom(old, v); old.vx += Math.cos(v.h + 1.57) * 3; old.vz += Math.sin(v.h + 1.57) * 3;
        if (old.team === 'civ') { old.mode = 'flee'; old.fear = 1; old.timer = 10; this.emit({ t: 'scream', id: old.id }); } else { old.mode = old.team === 'cop' ? 'attack' : 'attack'; old.target = p.id; }
        if (p.id === PLAYER_ID) { this.addCrime(old.team === 'cop' ? 'copAssault' : 'carTheft', v.x, v.z, p.id, old.id, old.team === 'cop' ? 2 : 1.2); v.stolen = true; }
      }
      v.passengers = v.passengers.filter(i => i !== v.driver);
    } else if (!v.driver && p.id === PLAYER_ID && v.mode !== 'parked' && v.mode !== 'none') { v.stolen = true; }
    else if (!v.driver && p.id === PLAYER_ID && v.mode === 'parked' && !v.keep && v.tag === '') { v.stolen = true; this.addCrime('carTheft', v.x, v.z, p.id, 0, 0.5); }
    v.driver = p.id; p.vehicle = v.id; p.seat = 0; p.vx = p.vz = 0; p.x = v.x; p.z = v.z; p.y = v.y;
    if (p.id === PLAYER_ID) { v.mode = 'none'; v.input = blankCarInput(); } this.emit({ t: 'enter', ped: p.id, vehicle: v.id }); return true;
  }
  exitVehicle(p: Ped): void {
    const v = this.vehMap.get(p.vehicle); if (!v) { p.vehicle = 0; return; }
    if (v.driver === p.id) v.driver = 0; v.passengers = v.passengers.filter(i => i !== p.id); p.vehicle = 0; this.placeBeside(p, v);
    if (p.id === PLAYER_ID) { v.mode = v.keep ? 'scripted' : 'parked'; v.input = blankCarInput(); v.input.handbrake = true; v.input.brake = 1; }
    this.emit({ t: 'exit', ped: p.id, vehicle: v.id });
  }

  // ---------- 사격 ----------
  private updateGun(p: Ped, dt: number): void {
    p.cd = Math.max(0, p.cd - dt); p.kick = Math.max(0, p.kick - dt * 7); p.muzzle = Math.max(0, p.muzzle - dt); p.hurt = Math.max(0, p.hurt - dt); p.punchT = Math.max(0, p.punchT - dt);
    const inp = p.input; p.aiming = inp.aim;
    if (inp.slot >= 0 && inp.slot < p.guns.length && p.guns[inp.slot] && inp.slot !== p.cur) { p.cur = inp.slot; p.reload = 0; p.cd = Math.max(p.cd, 0.3); inp.slot = -1; }
    const g = p.guns[p.cur]; if (!g) return; const def = WEAPONS[g.id];
    if (p.reload > 0) { p.reload -= dt; if (p.reload <= 0) { p.reload = 0; const n = Math.min(def.mag - g.mag, g.reserve); g.mag += n; g.reserve -= n; } }
    else if (!def.melee && ((inp.reload && g.mag < def.mag && g.reserve > 0) || (g.mag === 0 && g.reserve > 0 && inp.fire))) p.reload = def.reload * (p.id === PLAYER_ID ? this.perk.reload : 1);
    if (inp.fire && p.cd <= 0 && p.reload <= 0 && !p.vehicle && (def.auto || !p.fireHeld)) { if (def.melee) this.punch(p); else if (g.mag > 0) this.shoot(p, g); }
    p.fireHeld = inp.fire;
  }
  private punch(p: Ped): void {
    const mw = WEAPONS[this.curGun(p)?.id ?? 'fist'], melee = mw.melee ? mw : WEAPONS.fist;
    p.cd = melee.cd; p.punchT = 0.3; let best: Ped | null = null, bd = 99;
    for (const q of this.peds) { if (q === p || !q.alive || q.vehicle) continue; const d = Math.hypot(q.x - p.x, q.z - p.z); if (d > melee.range || d >= bd) continue; if (Math.abs(wrapAngle(Math.atan2(q.z - p.z, q.x - p.x) - p.yaw)) > 1.0) continue; best = q; bd = d; }
    this.emit({ t: 'shot', id: p.id, weapon: melee.id, ox: p.x, oy: p.y + 1.2, oz: p.z, ex: p.x + Math.cos(p.yaw) * 1.4, ey: p.y + 1.2, ez: p.z + Math.sin(p.yaw) * 1.4 });
    if (best) { const dmg = melee.dmg * (p.id === PLAYER_ID ? 1.4 * this.perk.melee : 1); this.damagePed(best, dmg, p.id, melee.id); best.vx += Math.cos(p.yaw) * (melee.id === 'bat' ? 8 : 5); best.vz += Math.sin(p.yaw) * (melee.id === 'bat' ? 8 : 5); this.emit({ t: 'hit', victim: best.id, attacker: p.id, dmg, head: false, x: best.x, y: best.y + 1.3, z: best.z, kind: 'ped' }); }
  }
  private shoot(p: Ped, g: Gun): void {
    const def = WEAPONS[g.id]; g.mag--; p.cd = def.cd; p.kick = Math.min(1, p.kick + def.recoil * 12); p.muzzle = 0.06;
    const ox = p.x + Math.cos(p.yaw) * 0.4, oy = this.eyeY(p) - 0.1, oz = p.z + Math.sin(p.yaw) * 0.4;
    if (g.id === 'rocket') {
      const cp = Math.cos(p.pitch), dx = Math.cos(p.yaw) * cp, dy = Math.sin(p.pitch), dz = Math.sin(p.yaw) * cp;
      this.projectiles.push({ id: this.nextId++, kind: 'rocket', x: ox, y: oy, z: oz, vx: dx * 70, vy: dy * 70, vz: dz * 70, owner: p.id, life: 6 });
      this.emit({ t: 'shot', id: p.id, weapon: 'rocket', ox, oy, oz, ex: ox + dx * 4, ey: oy + dy * 4, ez: oz + dz * 4 }); return;
    }
    if (g.id === 'grenade') {
      const cp = Math.cos(p.pitch + 0.25), dx = Math.cos(p.yaw) * cp, dy = Math.sin(p.pitch + 0.25), dz = Math.sin(p.yaw) * cp;
      this.projectiles.push({ id: this.nextId++, kind: 'grenade', x: ox, y: oy, z: oz, vx: dx * 16 + p.vx * 0.5, vy: dy * 16 + 3, vz: dz * 16 + p.vz * 0.5, owner: p.id, life: 2.3 });
      this.emit({ t: 'shot', id: p.id, weapon: 'grenade', ox, oy, oz, ex: ox + dx, ey: oy + dy, ez: oz + dz }); if (p.id === PLAYER_ID) this.count('grenades'); return;
    }
    const spread = def.spread * (p.id === PLAYER_ID ? this.perk.spread : 1) * (p.aiming ? 0.5 : 1) * (1 + Math.min(1.5, p.speed / 4) * 0.5) * (1 + p.kick * 0.4);
    for (let i = 0; i < def.pellets; i++) {
      const a = this.rng() * Math.PI * 2, r = spread * Math.sqrt(this.rng()), yaw = p.yaw + Math.cos(a) * r, pitch = p.pitch + Math.sin(a) * r;
      this.bullet(p, g.id, ox, oy, oz, yaw, pitch);
    }
  }
  /** 총알 한 발: 정적 지형·보행자·차량 중 가장 가까운 것에 맞습니다. */
  bullet(p: Ped, id: WeaponId, ox: number, oy: number, oz: number, yaw: number, pitch: number): void {
    const def = WEAPONS[id], cp = Math.cos(pitch), dx = Math.cos(yaw) * cp, dy = Math.sin(pitch), dz = Math.sin(yaw) * cp;
    let hitT = Math.min(rayStatic(this.map, ox, oy, oz, dx, dy, dz, def.range), def.range), kind: 'ped' | 'vehicle' | 'wall' | 'ground' = 'wall', tp: Ped | null = null, tv: Vehicle | null = null, head = false;
    if (dy < -1e-4) { const tg = (groundHeight(this.map, ox, oz) - oy) / dy; if (tg > 0 && tg < hitT) { hitT = tg; kind = 'ground'; } }
    const a = dx * dx + dz * dz;
    if (a > 1e-9) {
      for (const q of this.peds) {
        if (q === p || !q.alive || q.vehicle) continue; const px = ox - q.x, pz = oz - q.z, b = 2 * (px * dx + pz * dz), c = px * px + pz * pz - 0.42 * 0.42, disc = b * b - 4 * a * c; if (disc < 0) continue;
        let t = (-b - Math.sqrt(disc)) / (2 * a); if (t < 0) { if (c < 0) t = 0; else continue; } if (t >= hitT) continue;
        const y = oy + dy * t - q.y; if (y < 0 || y > 1.85) continue; hitT = t; tp = q; tv = null; kind = 'ped'; head = y > 1.45;
      }
      for (const v of this.vehicles) {
        const d = VEHICLES[v.kind]; if (Math.hypot(v.x - ox, v.z - oz) > hitT + d.halfL + 1) continue; const t = rayVsObb(ox, oz, dx, dz, v.x, v.z, v.h, d.halfL, d.halfW); if (t < 0 || t >= hitT) continue;
        const y = oy + dy * t - v.y; if (y < 0 || y > d.height) continue; hitT = t; tv = v; tp = null; kind = 'vehicle';
      }
    }
    const ex = ox + dx * hitT, ey = oy + dy * hitT, ez = oz + dz * hitT; this.emit({ t: 'shot', id: p.id, weapon: id, ox, oy, oz, ex, ey, ez });
    const fall = hitT <= def.range * 0.5 ? 1 : Math.max(0.4, 1 - 0.6 * (hitT - def.range * 0.5) / (def.range * 0.5));
    if (tp) { const dmg = def.dmg * fall * (head ? def.head : 1); this.emit({ t: 'hit', victim: tp.id, attacker: p.id, dmg, head, x: ex, y: ey, z: ez, kind: 'ped' }); this.damagePed(tp, dmg, p.id, id, head); }
    else if (tv) { const dmg = def.dmg * fall * 0.9; this.emit({ t: 'hit', victim: tv.id, attacker: p.id, dmg, head: false, x: ex, y: ey, z: ez, kind: 'vehicle' }); this.damageVehicle(tv, dmg, p.id); }
    else this.emit({ t: 'hit', victim: 0, attacker: p.id, dmg: 0, head: false, x: ex, y: ey, z: ez, kind });
    if (p.id === PLAYER_ID) this.addCrime('shooting', p.x, p.z, p.id, 0, 0.15);
  }

  // ---------- 보행 물리 ----------
  private movePed(p: Ped, dt: number): void {
    if (p.vehicle) { const v = this.vehMap.get(p.vehicle); if (v) { p.x = v.x; p.y = v.y; p.z = v.z; p.yaw = v.h; p.speed = Math.abs(v.vf); p.vx = v.vx; p.vz = v.vz; } return; }
    if (!p.alive) { p.vx *= Math.max(0, 1 - dt * 6); p.vz *= Math.max(0, 1 - dt * 6); }
    const inp = p.input, alive = p.alive;
    if (alive) {
      const want = inp.aim || inp.fire ? inp.yaw : p.yaw + clamp(wrapAngle(inp.yaw - p.yaw), -14 * dt, 14 * dt);
      p.yaw = want; p.pitch = clamp(inp.pitch, -1.2, 1.2); p.crouch = inp.crouch;
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw), mag = Math.min(1, Math.hypot(inp.mx, inp.mz)), top = (inp.sprint ? 7.0 * (p.id === PLAYER_ID ? this.perk.sprint : 1) : inp.aim ? 2.6 : 4.0) * (p.crouch ? 0.5 : 1) * mag;
      const wx = c * inp.mz - s * inp.mx, wz = s * inp.mz + c * inp.mx, wl = Math.hypot(wx, wz) || 1, k = Math.min(1, dt * (p.grounded ? 12 : 2.5));
      p.vx += (wx / wl * top - p.vx) * k; p.vz += (wz / wl * top - p.vz) * k;
      if (inp.jump && p.grounded && !p.crouch) { p.vy = 7.2; p.grounded = false; }
    }
    p.x += p.vx * dt; p.z += p.vz * dt;
    const m = moveCircle(this.map, p.x, p.z, 0.4, p.y, p.y + 1.8); p.x = m.x; p.z = m.z;
    for (const v of this.vehicles) { // 차량 밖으로 밀어냅니다
      const d = VEHICLES[v.kind]; if (Math.abs(v.x - p.x) > d.halfL + 1.6 || Math.abs(v.z - p.z) > d.halfL + 1.6) continue; if (p.y > v.y + d.height - 0.2) continue;
      const dx = p.x - v.x, dz = p.z - v.z, c = Math.cos(v.h), s = Math.sin(v.h); let lf = dx * c + dz * s, ll = -dx * s + dz * c; const ef = d.halfL + 0.4, el = d.halfW + 0.4;
      if (Math.abs(lf) < ef && Math.abs(ll) < el) { if (ef - Math.abs(lf) < el - Math.abs(ll)) lf = Math.sign(lf || 1) * ef; else ll = Math.sign(ll || 1) * el; p.x = v.x + lf * c - ll * s; p.z = v.z + lf * s + ll * c; }
    }
    const lim = this.map.half - 2; p.x = clamp(p.x, -lim, lim); p.z = clamp(p.z, -lim, lim);
    const gy = groundHeight(this.map, p.x, p.z);
    if (!p.grounded || p.y > gy + 0.05) { p.vy -= GRAVITY * dt; p.y += p.vy * dt; if (p.y <= gy) { if (p.vy < -13 && alive) this.damagePed(p, (-p.vy - 12) * 6, 0, 'fall'); p.y = gy; p.vy = 0; p.grounded = true; } else p.grounded = false; } else { p.y = gy; p.vy = 0; }
    p.speed = Math.hypot(p.vx, p.vz); if (alive) p.walk += p.speed * dt;
  }

  // ---------- 줍기·탄·화재 ----------
  private stepPickups(dt: number): void {
    const p = this.player;
    for (const pk of this.pickups) {
      if (pk.taken) { if (pk.respawn > 0) { pk.respawn -= dt; if (pk.respawn <= 0) { pk.taken = false; pk.respawn = pk.kind === 'weapon' ? 120 : pk.kind === 'armor' ? 180 : 60; } } continue; }
      if (!p.alive || p.vehicle) continue; if (Math.abs(pk.x - p.x) > 1.8 || Math.abs(pk.z - p.z) > 1.8 || Math.abs(pk.y - p.y) > 2.2) continue;
      if (pk.kind === 'health' && p.hp >= p.maxHp) continue; if (pk.kind === 'armor' && p.armor >= 100) continue;
      if (pk.kind === 'cash') this.addCash(pk.amount); else if (pk.kind === 'health') p.hp = Math.min(p.maxHp, p.hp + pk.amount * this.perk.heal); else if (pk.kind === 'armor') p.armor = Math.min(100, p.armor + pk.amount);
      else if (pk.kind === 'weapon' && pk.weapon) this.giveWeapon(p, pk.weapon); else if (pk.kind === 'ammo') { const g = this.curGun(p); if (g) g.reserve = Math.min(WEAPONS[g.id].reserve, g.reserve + pk.amount); }
      else if (pk.kind === 'package') { this.collected.add(pk.collect); this.addCash(pk.amount); this.say(`숨겨진 꾸러미 ${this.collected.size}/30`, 3); }
      pk.taken = true; this.emit({ t: 'pickup', ped: p.id, kind: pk.kind, amount: pk.amount });
    }
    if (this.pickups.length > 400) this.pickups = this.pickups.filter(q => !(q.taken && q.respawn <= 0 && q.collect < 0 && q.kind === 'cash'));
  }
  giveWeapon(p: Ped, id: WeaponId): void {
    const i = WEAPON_ORDER.indexOf(id), d = WEAPONS[id], g = p.guns[i];
    if (g) g.reserve = Math.min(d.reserve, g.reserve + d.mag * 2); else p.guns[i] = { id, mag: d.mag, reserve: d.mag * 3 };
    if (p.id === PLAYER_ID) { p.cur = i; this.say(`${d.name} 획득`, 2); }
  }
  private stepProjectiles(dt: number): void {
    for (const r of this.projectiles) {
      if (r.kind === 'grenade') {
        r.vy -= GRAVITY * dt; const hs = Math.hypot(r.vx, r.vz);
        if (hs > 0.01) { const t = rayStatic(this.map, r.x, r.y, r.z, r.vx / hs, 0, r.vz / hs, hs * dt + 0.25); if (t < hs * dt + 0.25) { r.vx *= -0.35; r.vz *= -0.35; } else { r.x += r.vx * dt; r.z += r.vz * dt; } }
        r.y += r.vy * dt; const gy = groundHeight(this.map, r.x, r.z) + 0.12;
        if (r.y < gy) { r.y = gy; if (r.vy < 0) r.vy *= -0.35; r.vx *= 0.72; r.vz *= 0.72; }
        r.life -= dt; if (r.life <= 0) { r.life = -1; this.explode(r.x, r.y, r.z, 8, WEAPONS.grenade.dmg, r.owner); }
        continue;
      }
      const sp = Math.hypot(r.vx, r.vy, r.vz), nx = r.vx / sp, ny = r.vy / sp, nz = r.vz / sp, step = sp * dt;
      let boom = false; const t = rayStatic(this.map, r.x, r.y, r.z, nx, ny, nz, step + 0.4); if (t <= step + 0.3) boom = true;
      r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt; r.life -= dt; if (r.life <= 0 || r.y <= groundHeight(this.map, r.x, r.z) + 0.05) boom = true;
      if (!boom) for (const q of this.peds) if (q.alive && q.id !== r.owner && !q.vehicle && Math.hypot(q.x - r.x, q.z - r.z) < 1.0 && r.y > q.y && r.y < q.y + 1.9) { boom = true; break; }
      if (!boom) for (const v of this.vehicles) { const d = VEHICLES[v.kind]; if (Math.hypot(v.x - r.x, v.z - r.z) < d.halfL + 0.5 && r.y > v.y && r.y < v.y + d.height) { const dx = r.x - v.x, dz = r.z - v.z, c = Math.cos(v.h), s = Math.sin(v.h); if (Math.abs(dx * c + dz * s) < d.halfL && Math.abs(-dx * s + dz * c) < d.halfW) { boom = true; break; } } }
      if (boom) { r.life = -1; this.explode(r.x, r.y, r.z, 9, WEAPONS.rocket.dmg, r.owner); }
    }
    this.projectiles = this.projectiles.filter(r => r.life > 0);
  }
  private stepFire(dt: number): void {
    for (const v of this.vehicles.slice()) {
      if (!v.wrecked) continue; v.timer += dt;
      if (v.burn > 0) { v.burn -= dt; if (v.burn <= 0) { v.burn = -1; this.explode(v.x, v.y + 1, v.z, 7, 120, v.target); } }
      if (v.timer > 70 || (v.burn < 0 && Math.hypot(v.x - this.player.x, v.z - this.player.z) > STREAM_RADIUS * 1.4)) { if (v.keep && v.timer < 600) continue; this.removeVehicle(v); }
    }
  }

  // ---------- 서비스(상점·안전가옥) ----------
  buyWeapon(id: WeaponId): string {
    const poi = this.nearPoi(this.player.x, this.player.z); if (!poi || poi.kind !== 'gunshop') return '총기점이 아닙니다';
    const d = WEAPONS[id], have = this.player.guns[WEAPON_ORDER.indexOf(id)], price = this.price(have ? Math.ceil(d.price * 0.2) : d.price);
    if (this.cash < price) return '돈이 부족합니다'; this.addCash(-price);
    if (have) have.reserve = d.reserve; else { this.player.guns[WEAPON_ORDER.indexOf(id)] = { id, mag: d.mag, reserve: d.mag * 4 }; } this.player.cur = WEAPON_ORDER.indexOf(id); return have ? `${d.name} 탄약 보충` : `${d.name} 구입`;
  }
  buyArmor(): string { const poi = this.nearPoi(this.player.x, this.player.z); if (!poi || poi.kind !== 'gunshop') return '총기점이 아닙니다'; const ap = this.price(300); if (this.cash < ap) return '돈이 부족합니다'; this.addCash(-ap); this.player.armor = 100; return '방탄복 구입'; }
  /** 안전가옥에서 쉬기: 체력 회복·저장·시간 경과 */
  sleep(): string { const p = this.player, poi = this.nearPoi(p.x, p.z); if (!poi || poi.kind !== 'safehouse') return '안전가옥이 아닙니다'; if (this.wanted.stars > 0) return '수배 중에는 쉴 수 없습니다'; p.hp = p.maxHp; this.clock = (this.clock + 8) % 24; this.emit({ t: 'save' }); return '푹 쉬었습니다. 저장되었습니다'; }
  /** 도색 가게: 차를 새로 칠하고 수배를 풀어 줍니다(경찰이 보고 있지 않을 때). */
  paynspray(): string {
    const p = this.player, v = this.vehMap.get(p.vehicle), poi = this.nearPoi(p.x, p.z); if (!v || !poi || poi.kind !== 'paynspray') return '도색 가게 안에서 차를 타고 있어야 합니다';
    if (this.wanted.unseenT < 2 && this.wanted.stars > 0) return '경찰이 보고 있어서 지금은 안 됩니다'; const pp = this.price(150); if (this.cash < pp) return '돈이 부족합니다';
    this.addCash(-pp); v.color = Math.floor(this.rng() * 0xffffff); v.hp = v.maxHp; v.flat = false; this.wanted.heat = 0; this.wanted.evadeT = 0; this.setStars(0); return '새 차가 되었습니다. 수배가 풀렸습니다';
  }
  respawnPlayer(kind: 'wasted' | 'busted'): void {
    const p = this.player, spot = this.map.pois.find(q => q.kind === (kind === 'wasted' ? 'hospital' : 'police')) ?? this.map.pois.find(q => q.kind === 'safehouse') ?? this.map.pois[0];
    if (p.vehicle) { const v = this.vehMap.get(p.vehicle); if (v) { v.driver = 0; v.mode = 'parked'; } p.vehicle = 0; }
    p.alive = true; p.hp = p.maxHp; p.armor = 0; p.x = (spot?.x ?? 0) + 2; p.z = (spot?.z ?? 0) + 2; p.y = groundHeight(this.map, p.x, p.z); p.vx = p.vz = p.vy = 0; p.input = blankPedInput(); p.reload = 0;
    const fine = Math.min(this.cash, Math.floor(this.cash * (kind === 'wasted' ? 0.1 : 0.2)) + 100); this.addCash(-fine);
    if (kind === 'busted') for (let i = 1; i < p.guns.length; i++) if (p.guns[i] && p.guns[i]!.id !== 'pistol') p.guns[i] = null;
    p.cur = p.guns.findIndex((g, i) => i > 0 && !!g); if (p.cur < 0) p.cur = 0;
    this.wanted.heat = 0; this.wanted.evadeT = 0; this.setStars(0); this.downKind = ''; this.deadT = 0; this.emit({ t: 'respawn' });
    if (this.mission.active) this.mission.failed = kind === 'wasted' ? '쓰러졌습니다' : '체포되었습니다';
  }

  // ---------- 매 틱 ----------
  /** pin: 플레이어 보행 입력, cin: 차량 입력. pin.enter 는 눌린 프레임에만 true 여야 합니다. */
  step(dt: number, pin: PedInput, cin: CarInput): void {
    this.t += dt; this.frame++; this.playSec += dt; this.clock = (this.clock + dt * 24 / DAY_SECONDS) % 24; this.rain += (rainTarget(this.t) - this.rain) * Math.min(1, dt * 0.25);
    const p = this.player;
    if (p.alive) {
      p.input = { ...pin };
      if (p.vehicle) { const v = this.vehMap.get(p.vehicle); if (v) { v.input = { ...cin }; if (pin.enter) this.exitVehicle(p); } else p.vehicle = 0; }
      else if (pin.enter) { const v = this.nearestVehicle(p); if (v) this.enterVehicle(p, v); }
    } else if (this.downKind) { this.deadT += dt; if (this.deadT > (this.downKind === 'wasted' ? 4 : 3)) this.respawnPlayer(this.downKind); }
    stepPeds(this, dt); stepCombat(this, dt); stepTraffic(this, dt); stepPolice(this, dt);
    for (const q of this.peds) { if (q.alive && !q.vehicle) this.updateGun(q, dt); this.movePed(q, dt); }
    for (const v of this.vehicles) stepVehicle(this, v, dt);
    this.stepProjectiles(dt); this.stepPickups(dt); this.stepFire(dt); stepMissions(this, dt); stepActivities(this, dt); stepLife(this, dt); stepJobs(this, dt);
    for (const q of this.peds.slice()) if (!q.alive && !q.keep && q.id !== PLAYER_ID && this.t - q.diedAt > 25) this.removePed(q);
  }
}
