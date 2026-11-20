// ZERO ZONE — 경기 시뮬레이션: 이동·사격·피해·전리품·줄어드는 자기장·승패. 화면과 무관해서 테스트와 봇 대 봇 시뮬레이션에서 그대로 돌립니다.
import { AIR, BOOST, BOTS, BOT_NAMES, DIFFICULTIES, DRIVE, HELMET_CUT, HEAL, ARMOR_PTS, ARMOR_ABS, MAP_HALF, PARTS, adsSpread, canFit, partFit, PLAYER, RED, SKIN_TONES, TEAM_COLORS, VEHICLES, WEAPONS, ZONES, magOf, makeRng, partHandling, type Attachments, type Difficulty, type DriveKind, type Mode, type PartId, type WeaponId } from './config';
import { blockedAt, circleHits, generateMap, lineClear, moveBox, pushOut, rayWorld, slideMove, type GameMap, type Loot } from './world';
import { WATER_SLOW, waterDepth } from './terrain';
import { thinkBot, thinkAir, newBrain, type BotBrain } from './bot';

export interface Input { mx: number; mz: number; yaw: number; pitch: number; fire: boolean; sprint: boolean; reload: boolean; interact: boolean; ads: boolean; slot: number; /** 수류탄 던지기(눌린 프레임) */ nade?: boolean; /** 웅크리기(누르고 있는 동안) */ crouch?: boolean; /** 점프(비행기에서 뛰어내리기) · 낙하산 펴기 */ jump?: boolean; /** 치료 시작: 1 붕대 · 2 구급상자 */ heal?: number }
export const blankInput = (): Input => ({ mx: 0, mz: 0, yaw: 0, pitch: 0, fire: false, sprint: false, reload: false, interact: false, ads: false, slot: -1 });
/** 광선과 차체(옆에서 본 직사각형 × 높이)의 첫 교차 거리(없으면 Infinity). */
export function rayVehicle(v: Vehicle, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): number {
  const c = Math.cos(v.yaw), s = Math.sin(v.yaw), px = ox - v.x, pz = oz - v.z, lo = { x: px * c + pz * s, y: oy, z: -px * s + pz * c }, ld = { x: dx * c + dz * s, y: dy, z: -dx * s + dz * c };
  let t0 = 0, t1 = maxT;
  const slab = (o: number, d: number, a: number, b: number): boolean => { if (Math.abs(d) < 1e-9) return o >= a && o <= b; let u = (a - o) / d, w = (b - o) / d; if (u > w) { const k = u; u = w; w = k; } if (u > t0) t0 = u; if (w < t1) t1 = w; return t0 <= t1; };
  return slab(lo.x, ld.x, -v.w / 2, v.w / 2) && slab(lo.y, ld.y, 0.15, v.h) && slab(lo.z, ld.z, -v.d / 2, v.d / 2) ? t0 : Infinity;
}
/** 비행기 항로: 시작점에서 방향(dx,dz)으로 plane m/s 로 날아 len 미터 뒤에 지도를 벗어납니다. */
export interface Plane { x0: number; z0: number; dx: number; dz: number; speed: number; len: number; end: number }
/** 0 땅 · 1 비행기 안 · 2 자유낙하 · 3 낙하산 */
export type AirState = 0 | 1 | 2 | 3;
/** 쓰러진 이유: 무기 · 자기장 · 수류탄 · 차량(치임·사고·폭발) · 폭격 */
export type Cause = WeaponId | 'zone' | 'grenade' | 'vehicle' | 'bomb';
/** 운전할 수 있는 차량. 서 있을 때는 지도의 충돌 상자(box)로 길을 막고, 움직이는 동안에는 상자를 끄고 직접 충돌을 셉니다. */
export interface Vehicle {
  id: number; kind: DriveKind; x: number; z: number; /** 차가 향한 방향(라디안, 선수의 yaw 와 같은 약속) */ yaw: number; speed: number; hp: number; max: number;
  /** 운전자 선수 번호(-1 없음) */ driver: number; wreck: boolean; moving: boolean; w: number; d: number; h: number; c: number; v: number; box: number; lastBy: number; soundT: number; hits: Map<number, number>;
  /** 온라인: 이 차의 움직임을 다른 브라우저가 계산합니다(여기서는 받은 상태를 따라가고 치기만 판정). */ remote: boolean;
}
/** 폭격 구역: call 에 경고, start~end 사이에 포탄이 떨어집니다. */
export interface RedZone { x: number; z: number; r: number; call: number; start: number; end: number; next: number; called: boolean; ended: boolean; /** 포탄 위치 전용 난수(모든 브라우저가 같은 자리에 떨어뜨리도록) */ rng: () => number }
export interface Shell { id: number; x: number; z: number; t0: number; land: number }
export interface Gun { id: WeaponId; mag: number; reserve: number; att: Attachments }
/** 보급 투하: call 시각에 비행기가 지나며 상자를 떨어뜨리고, at 시각에 착지해 전리품이 열립니다. */
/** 웅크림 정도(0~1)에 따른 눈높이·키·머리 높이 */
export const eyeOf = (p: { crouch: number }): number => PLAYER.eye - (PLAYER.eye - PLAYER.crouchEye) * p.crouch;
export const heightOf = (cr: number): number => PLAYER.height - (PLAYER.height - PLAYER.crouchHeight) * cr;
export const headOf = (cr: number): number => PLAYER.head - (PLAYER.head - PLAYER.crouchHead) * cr;
/** 던져진 수류탄 */
export interface Nade { id: number; owner: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; fuse: number }
export const NADE = { max: 5, pick: 2, fuse: 2.7, speed: 17, radius: 7, dmg: 150, cd: 1.2 };
export interface Drop { x: number; z: number; at: number; fall: number; called: boolean; landed: boolean; /** 상자 안 전리품 번호의 시작(모든 브라우저가 같은 번호) */ ids: number; rng: () => number }
export interface Player {
  id: number; name: string; bot: boolean; remote: boolean; color: number; skin: number;
  x: number; z: number; yaw: number; pitch: number; vx: number; vz: number; hp: number; armor: number; helmet: number; boost: number; alive: boolean;
  guns: (Gun | null)[]; cur: number; reload: number; cd: number; fireHeld: boolean; interactHeld: boolean;
  kills: number; place: number; diedAt: number; input: Input; brain: BotBrain | null;
  /** 낙하 상태와 지면으로부터의 높이(m) */ air: AirState; alt: number; jumpHeld: boolean; landedAt: number;
  /** 웅크린 정도 0(서 있음)~1(완전히 웅크림) */ crouch: number; walk: number; kick: number; muzzle: number; hurt: number; hurtYaw: number; ads: boolean; speed: number; lastHitBy: number; emptyT: number;
  /** 수류탄 개수·재사용 대기 */ nades: number; nadeCd: number; nadeHeld: boolean;
  /** 치료 도구 개수 · 시전 남은 시간(0이면 안 하는 중)과 종류 · 방탄복 등급 */ bandages: number; kits: number; healT: number; healKind: 'bandage' | 'kit'; armorLv: number;
  /** 경기 기록: 준 피해 · 머리 명중 수 · 나를 쓰러뜨린 선수와 무기 */ dmgDealt: number; heads: number; killedBy: number; killedWeapon: Cause | null; /** 타고 있는 차량 번호(-1 없음) */ veh: number;
}
export type MatchEvent =
  | { t: 'shot'; id: number; weapon: WeaponId; ox: number; oy: number; oz: number; ends: number[]; remote: boolean; sup?: boolean }
  | { t: 'hit'; victim: number; attacker: number; dmg: number; head: boolean; x: number; y: number; z: number; wall: boolean }
  | { t: 'kill'; victim: number; attacker: number; weapon: Cause }
  | { t: 'pickup'; id: number; loot: number; kind: Loot['kind']; weapon: WeaponId | null; part?: PartId | null; level?: number }
  | { t: 'drop'; stage: 'call' | 'land'; x: number; z: number }
  | { t: 'veh'; stage: 'enter' | 'exit' | 'crash' | 'boom'; id: number; x: number; z: number }
  | { t: 'red'; stage: 'call' | 'start' | 'end'; x: number; z: number; r: number }
  | { t: 'jump'; id: number } | { t: 'chute'; id: number } | { t: 'land'; id: number }
  | { t: 'nade'; stage: 'throw' | 'boom'; id: number; x: number; y: number; z: number; /** 던질 때의 속도(온라인으로 같은 수류탄을 다시 만들 때 씁니다) */ vx?: number; vy?: number; vz?: number; remote?: boolean }
  /** 새로 생긴 전리품(쓰러진 선수의 총, 바꿔 낀 파츠 등). 온라인에서는 만든 쪽이 모두에게 알립니다. */
  | { t: 'loot'; loot: Loot }
  /** 온라인 손님이 차에 타려고 함(방장이 허락해야 탑니다) */ | { t: 'vreq'; id: number }
  /** 온라인 손님이 운전하다 부딪혀 차가 상함(차 내구도는 방장이 관리합니다) */ | { t: 'vhurt'; id: number; dmg: number }
  | { t: 'heal'; id: number; stage: 'start' | 'done' | 'cancel'; kind: 'bandage' | 'kit' }
  | { t: 'reload'; id: number } | { t: 'empty'; id: number } | { t: 'over'; winner: number };

export interface ZoneState { cx: number; cz: number; r: number; nextCx: number; nextCz: number; nextR: number; shrinking: boolean; phase: number; timeLeft: number; dps: number }

export interface MatchOptions { seed: number; mode: Mode; difficulty: Difficulty; /** 사람(또는 원격) 선수 이름들. 나머지는 봇이 채웁니다. */ humans: Array<{ name: string; remote?: boolean }>; fill?: number; /** 비행기에서 낙하산으로 시작(배틀로열). 꺼 두면 땅에서 시작합니다. */ air?: boolean; /** 운전할 수 있는 차량(배틀로열) */ vehicles?: boolean; /** 폭격 구역(배틀로열) */ bombs?: boolean;
  /** 온라인 방에서 AI·차량·차 내구도를 이 브라우저가 계산하는지(방장). false 면 AI 는 받은 위치를 따라가는 꼭두각시입니다. 기본 true. */ authority?: boolean;
  /** 이 브라우저가 새로 만드는 전리품 번호의 시작(온라인에서 참가자마다 겹치지 않게). 기본 0. */ lootBase?: number }

export class Match {
  map: GameMap; mode: Mode; difficulty: Difficulty; seed: number;
  players: Player[] = []; loot: Loot[]; t = 0; over = false; winner = -1; events: MatchEvent[] = [];
  /** 최근 총소리(봇이 듣습니다) */ sounds: Array<{ x: number; z: number; t: number; by: number; quiet?: boolean }> = [];
  /** 보급 투하(솔로 배틀로열만) */ drops: Drop[] = [];
  /** 날아다니는 수류탄 */ nades: Nade[] = []; private nadeId = 1;
  /** 운전할 수 있는 차량 · 폭격 구역과 떨어지는 포탄 */ vehicles: Vehicle[] = []; reds: RedZone[] = []; shells: Shell[] = []; private shellId = 1;
  /** 비행기 항로(낙하 시작일 때만) */ plane: Plane | null = null;
  /** 자기장 시간이 흐르기 시작하는 때(낙하하는 동안은 기다립니다) */ zoneDelay = 0;
  rng: () => number;
  /** AI·차량 내구도를 이 브라우저가 계산하는지(솔로와 방장은 true) */ authority: boolean;
  private centers: Array<{ x: number; z: number; r: number }>; private starts: number[]; private nextLoot: number;

  constructor(o: MatchOptions) {
    this.seed = o.seed; this.mode = o.mode; this.difficulty = o.difficulty; this.authority = o.authority ?? true;
    this.map = generateMap(o.seed, o.mode); this.loot = this.map.loot.map(l => ({ ...l })); this.nextLoot = this.loot.length + 1000 + (o.lootBase ?? 0);
    this.rng = makeRng(o.seed ^ 0x9e3779b9);
    if (o.air && o.mode === 'br') {
      const pr = makeRng(o.seed ^ 0x3c6ef372), a = pr() * Math.PI * 2, half0 = MAP_HALF.br, off = (pr() - 0.5) * half0 * 0.9, len = half0 * 2.7, dx = Math.cos(a), dz = Math.sin(a);
      this.plane = { x0: -dx * len / 2 - dz * off, z0: -dz * len / 2 + dx * off, dx, dz, speed: AIR.plane, len, end: len / AIR.plane }; this.zoneDelay = AIR.delay;
    }
    // 자기장 중심은 시드로 정해 두 브라우저가 같은 원을 봅니다.
    const zr = makeRng(o.seed ^ 0x2545f491), half = MAP_HALF[o.mode], phases = ZONES[o.mode];
    this.centers = []; this.starts = []; let prev = { x: 0, z: 0, r: half * 1.35 }, at = 0;
    for (const ph of phases) {
      let c = { x: prev.x, z: prev.z, r: ph.radius };
      for (let i = 0; i < 12; i++) {
        const a = zr() * Math.PI * 2, d = Math.sqrt(zr()) * Math.max(0, prev.r - ph.radius) * 0.85;
        c = { x: prev.x + Math.cos(a) * d, z: prev.z + Math.sin(a) * d, r: ph.radius }; if (Math.hypot(c.x, c.z) + ph.radius * 0.5 <= half) break;
      }
      this.starts.push(at); at += ph.wait + ph.shrink; this.centers.push(c); prev = c;
    }
    if (o.mode === 'br') {
      const dr = makeRng(o.seed ^ 0x51ed270b);
      for (const at of [105 + this.zoneDelay, 218 + this.zoneDelay]) for (let i = 0; i < 30; i++) {
        const a = dr() * Math.PI * 2, r = Math.sqrt(dr()) * half * 0.62, x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (!blockedAt(this.map, x, z, 3.2) || i === 29) { const k = this.drops.length; this.drops.push({ x, z, at, fall: 16, called: false, landed: false, ids: 900000 + k * 32, rng: makeRng(o.seed ^ (0x6a09e667 + k * 7919)) }); break; }
      }
    }
    if (o.mode === 'br' && o.bombs) {
      const rr = makeRng(o.seed ^ 0x7f4a7c15);
      for (const [ri, at] of RED.calls.entries()) {
        const call = at + this.zoneDelay, z = this.zoneAt(call + RED.warn), cs = this.map.compounds.filter(c => Math.hypot(c.x - z.cx, c.z - z.cz) < z.r * 0.85); let x: number, zz: number;
        if (cs.length && rr() < 0.7) { const c = cs[Math.floor(rr() * cs.length)]; x = c.x; zz = c.z; } else { const a = rr() * Math.PI * 2, d = Math.sqrt(rr()) * z.r * 0.7; x = z.cx + Math.cos(a) * d; zz = z.cz + Math.sin(a) * d; }
        this.reds.push({ x, z: zz, r: RED.r, call, start: call + RED.warn, end: call + RED.warn + RED.dur, next: 0, called: false, ended: false, rng: makeRng(o.seed ^ (0x1f83d9ab + ri * 104729)) });
      }
    }
    if (o.vehicles && o.mode === 'br') this.initVehicles();
    const total = o.fill ?? (o.mode === 'br' ? 20 : o.humans.length), names = [...BOT_NAMES].sort(() => this.rng() - 0.5), air = !!this.plane;
    for (let i = 0; i < total; i++) {
      const h = o.humans[i], sp = air ? this.planeAt(0) : this.map.spawns[i % this.map.spawns.length], bi = i - o.humans.length, cyc = Math.floor(bi / names.length);
      const p: Player = {
        id: i, name: h?.name ?? names[bi % names.length] + (cyc > 0 ? String(cyc + 1) : ''), bot: !h, remote: !!h?.remote, color: TEAM_COLORS[i % TEAM_COLORS.length], skin: SKIN_TONES[i % SKIN_TONES.length],
        x: sp.x, z: sp.z, yaw: air ? Math.atan2(this.plane!.dz, this.plane!.dx) : Math.atan2(-sp.z, -sp.x), pitch: 0, vx: 0, vz: 0, hp: PLAYER.hp, armor: 0, helmet: 0, boost: 0, alive: true,
        guns: [{ id: 'pistol', mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.mag * 2, att: {} }, null], cur: 0, reload: 0, cd: 0.4, fireHeld: false, interactHeld: false,
        kills: 0, place: 0, diedAt: 0, input: blankInput(), brain: null, air: air ? 1 : 0, alt: air ? AIR.alt : 0, jumpHeld: false, landedAt: 0, crouch: 0, walk: 0, kick: 0, muzzle: 0, hurt: 0, hurtYaw: 0, ads: false, speed: 0, lastHitBy: -1, emptyT: 0, nades: 0, nadeCd: 0, nadeHeld: false,
        bandages: 0, kits: 0, healT: 0, healKind: 'bandage', armorLv: 0, dmgDealt: 0, heads: 0, killedBy: -1, killedWeapon: null, veh: -1,
      };
      if (p.bot) { p.brain = newBrain(this.rng, BOTS[o.difficulty]); if (air) this.planDrop(p); }
      p.input.yaw = p.yaw; this.players.push(p);
    }
    // 방장이 아닌 브라우저의 AI 는 방장이 보내는 위치를 따라가기만 합니다.
    if (!this.authority) { for (const p of this.players) if (p.bot) { p.remote = true; p.brain = null; } for (const v of this.vehicles) v.remote = true; }
  }
  /** 방장이 나갔을 때 이 브라우저가 AI 와 (사람이 몰지 않는) 차량을 넘겨받습니다. */
  takeAuthority(humanDriven: (v: Vehicle) => boolean = () => false): void {
    if (this.authority) return; this.authority = true;
    for (const p of this.players) if (p.bot) { p.remote = false; p.brain = newBrain(this.rng, BOTS[this.difficulty]); p.input = blankInput(); p.input.yaw = p.yaw; if (p.air === 1 && this.plane) this.planDrop(p); }
    for (const v of this.vehicles) if (v.remote && !humanDriven(v)) v.remote = false;
  }

  /** 시각 t 의 자기장. */
  zoneAt(time: number): ZoneState {
    const t = Math.max(0, time - this.zoneDelay), half = this.map.half, phases = ZONES[this.mode];
    let prev = { x: 0, z: 0, r: half * 1.35 };
    for (let i = 0; i < phases.length; i++) {
      const ph = phases[i], c = this.centers[i], s = this.starts[i];
      if (t < s + ph.wait) return { cx: prev.x, cz: prev.z, r: prev.r, nextCx: c.x, nextCz: c.z, nextR: c.r, shrinking: false, phase: i, timeLeft: s + ph.wait - t, dps: ph.dps };
      if (t < s + ph.wait + ph.shrink) { const k = (t - s - ph.wait) / ph.shrink; return { cx: prev.x + (c.x - prev.x) * k, cz: prev.z + (c.z - prev.z) * k, r: prev.r + (c.r - prev.r) * k, nextCx: c.x, nextCz: c.z, nextR: c.r, shrinking: true, phase: i, timeLeft: s + ph.wait + ph.shrink - t, dps: ph.dps }; }
      prev = c;
    }
    const last = phases[phases.length - 1], over = t - (this.starts[phases.length - 1] + last.wait + last.shrink);
    return { cx: prev.x, cz: prev.z, r: prev.r, nextCx: prev.x, nextCz: prev.z, nextR: prev.r, shrinking: false, phase: phases.length, timeLeft: 0, dps: last.dps * (1 + over / 12) };
  }
  get zone(): ZoneState { return this.zoneAt(this.t); }

  aliveCount(): number { let n = 0; for (const p of this.players) if (p.alive) n++; return n; }
  drain(): MatchEvent[] { const e = this.events; this.events = []; return e; }
  gun(p: Player): Gun | null { return p.guns[p.cur]; }

  step(dt: number): void {
    if (this.over) return;
    this.t += dt;
    const zone = this.zone;
    this.sounds = this.sounds.filter(s => this.t - s.t < 2.5);
    this.stepDrops(); this.stepNades(dt); this.stepVehicles(dt); this.stepReds(dt);
    // 멀리 있는 AI(사람 시야 밖)는 생각을 0.2초에 한 번만 해서 100명이 뛰어도 가볍게 돕니다.
    const humans: Player[] = []; for (const q of this.players) if (!q.bot && q.alive) humans.push(q);
    for (const p of this.players) {
      if (!p.alive) continue;
      if (p.remote) { this.stepPuppet(p, dt); continue; }
      if (p.air) { this.stepAir(p, dt); continue; }
      if (p.veh >= 0) this.stepDriver(p, dt);
      else {
        if (p.bot && p.brain) {
          const b = p.brain; b.acc += dt; let far = true; for (const h of humans) if (Math.abs(h.x - p.x) < 150 && Math.abs(h.z - p.z) < 150) { far = false; break; }
          if (!far || b.acc >= 0.2) { thinkBot(this, p, b.acc, zone); b.acc = 0; }
        }
        this.update(p, dt);
      }
      if ((p.x - zone.cx) ** 2 + (p.z - zone.cz) ** 2 > zone.r ** 2) this.damage(p, zone.dps * dt, -1, 'zone', false, p.x, 1, p.z, true);
    }
    // 마지막 한 명이 남으면 끝납니다(동시에 모두 쓰러졌다면 마지막에 쓰러진 쪽이 승자).
    if (!this.over) {
      let survivor = -1, alive = 0;
      for (const p of this.players) if (p.alive) { survivor = p.id; if (++alive > 1) break; }
      if (alive <= 1 && this.players.length > 1) this.finish(alive === 1 ? survivor : this.lastDead());
    }
  }
  /** 다른 브라우저가 움직이는 선수: 받은 상태는 밖에서 넣고, 여기서는 반동·피격 표시만 줄이고 차를 따라갑니다. */
  private stepPuppet(p: Player, dt: number): void {
    p.cd = Math.max(0, p.cd - dt); p.kick = Math.max(0, p.kick - dt * 7); p.muzzle = Math.max(0, p.muzzle - dt); p.hurt = Math.max(0, p.hurt - dt); p.emptyT = Math.max(0, p.emptyT - dt);
    if (p.veh >= 0) { const v = this.vehicles[p.veh]; if (v && !v.wreck) { p.x = v.x; p.z = v.z; p.speed = Math.abs(v.speed); } else p.veh = -1; }
    p.walk += p.speed * dt;
  }
  /** 비행기의 위치(시각 t). 항로를 벗어난 뒤에도 같은 방향으로 계속 날아갑니다. */
  planeAt(t: number): { x: number; z: number } { const pl = this.plane!, d = pl.speed * t; return { x: pl.x0 + pl.dx * d, z: pl.z0 + pl.dz * d }; }
  /** 이 봇이 어디로 내릴지, 비행기가 목표에 얼마나 가까워지면 뛸지 정합니다. */
  private planDrop(p: Player): void {
    const b = p.brain!, rng = this.rng, cs = this.map.compounds, half = this.map.half; let best = -1;
    // 후보 여덟 곳 중 먼저 정해진 봇들의 목표와 가장 멀리 떨어진 곳을 고릅니다(한 곳에 몰려 내리지 않게).
    for (let k = 0; k < 8; k++) {
      const a = rng() * Math.PI * 2; let x: number, z: number;
      if (cs.length && rng() < 0.45) { const c = cs[Math.floor(rng() * cs.length)], r = Math.sqrt(rng()) * c.r * 0.8; x = c.x + Math.cos(a) * r; z = c.z + Math.sin(a) * r; }
      else { const r = Math.sqrt(rng()) * half * 0.9; x = Math.cos(a) * r; z = Math.sin(a) * r; }
      let near = Infinity; for (const q of this.players) if (q !== p && q.brain && q.id < p.id) near = Math.min(near, Math.hypot(q.brain.dropX - x, q.brain.dropZ - z));
      if (near > best) { best = near; b.dropX = x; b.dropZ = z; }
    }
    b.jumpDist = 140 + rng() * 110; b.openAlt = AIR.open + 15 + rng() * 85;
  }
  /** 비행기 안·자유낙하·낙하산 중인 선수 한 명을 진행합니다. 착지하면 air 가 0 이 되어 보통 선수로 돌아갑니다. */
  private stepAir(p: Player, dt: number): void {
    const inp = p.input, pl = this.plane!; if (p.bot && p.brain) thinkAir(this, p);
    const wantJump = !!inp.jump && !p.jumpHeld; p.jumpHeld = !!inp.jump;
    if (!p.bot) { p.yaw = inp.yaw; p.pitch = Math.max(-1.45, Math.min(1.45, inp.pitch)); }
    p.speed = 0; p.vx *= 0; p.hurt = 0;
    if (p.air === 1) {
      const at = this.planeAt(Math.min(this.t, pl.end)); p.x = at.x; p.z = at.z; p.alt = AIR.alt;
      if (wantJump || this.t >= pl.end) { p.air = 2; p.vx = 0; p.vz = 0; this.events.push({ t: 'jump', id: p.id }); }
      return;
    }
    const fx = Math.cos(p.yaw), fz = Math.sin(p.yaw), mz = Math.max(-1, Math.min(1, inp.mz)), mx = Math.max(-1, Math.min(1, inp.mx)), fwd = mz > 0.2;
    let wx = fx * mz - fz * mx, wz = fz * mz + fx * mx; const wl = Math.hypot(wx, wz); if (wl > 1) { wx /= wl; wz /= wl; }
    let top: number, fall: number;
    if (p.air === 2) {
      const dive = inp.sprint && fwd; top = dive ? AIR.diveH : fwd ? AIR.fallFast : AIR.fallH; fall = dive ? AIR.dive : AIR.fall;
      if ((wantJump && p.alt <= AIR.manualOpen) || p.alt <= AIR.open) { p.air = 3; this.events.push({ t: 'chute', id: p.id }); }
    } else { const run = inp.sprint && fwd; top = run ? AIR.chuteRun : fwd ? AIR.chuteGo : AIR.chuteH; fall = run ? AIR.chuteFast : AIR.chute; }
    const k = Math.min(1, dt * 3); p.vx += (wx * top - p.vx) * k; p.vz += (wz * top - p.vz) * k;
    p.x += p.vx * dt; p.z += p.vz * dt; p.alt -= (p.air === 3 && p.alt < 4 ? Math.max(3, fall * 0.5) : fall) * dt;
    const lim = this.map.half - 1; p.x = Math.max(-lim, Math.min(lim, p.x)); p.z = Math.max(-lim, Math.min(lim, p.z));
    if (p.alt <= 0) { p.alt = 0; p.air = 0; p.vx = 0; p.vz = 0; pushOut(this.map, p, PLAYER.radius); p.landedAt = this.t; p.cd = Math.max(p.cd, 0.5); this.events.push({ t: 'land', id: p.id }); }
  }
  private stepDrops(): void {
    for (const d of this.drops) {
      if (!d.called && this.t >= d.at - d.fall) { d.called = true; this.events.push({ t: 'drop', stage: 'call', x: d.x, z: d.z }); }
      if (!d.landed && this.t >= d.at) {
        d.landed = true; this.events.push({ t: 'drop', stage: 'land', x: d.x, z: d.z });
        const goods: Array<Omit<Loot, 'id' | 'x' | 'z' | 'taken'>> = [
          { kind: 'weapon', weapon: d.rng() < 0.5 ? 'sniper' : 'rifle', part: null, level: 0, att: d.rng() < 0.5 ? { sight: 'scope4' } : { muzzle: 'comp' } },
          { kind: 'attach', weapon: null, part: 'scope4', level: 0 }, { kind: 'attach', weapon: null, part: 'extmag', level: 0 }, { kind: 'attach', weapon: null, part: 'suppressor', level: 0 },
          { kind: 'helmet', weapon: null, part: null, level: 3 }, { kind: 'armor', weapon: null, part: null, level: 3 }, { kind: 'medkit', weapon: null, part: null, level: 0 }, { kind: 'boost', weapon: null, part: null, level: 0 },
        ];
        goods.forEach((g, i) => { const a = (i / goods.length) * Math.PI * 2; this.loot.push({ ...g, id: d.ids + i, x: d.x + Math.cos(a) * 1.7, z: d.z + Math.sin(a) * 1.7, taken: false }); });
      }
    }
  }

  // ---------- 차량 ----------
  private initVehicles(): void {
    for (const pr of this.map.props) {
      if (pr.wreck || pr.box === undefined || !(pr.kind in VEHICLES)) continue; const kind = pr.kind as DriveKind, S = VEHICLES[kind];
      this.vehicles.push({ id: this.vehicles.length, kind, x: pr.x, z: pr.z, yaw: -(pr.ry + pr.jit), speed: 0, hp: S.hp, max: S.hp, driver: -1, wreck: false, moving: false, w: pr.w, d: pr.d, h: pr.h, c: pr.c, v: pr.v, box: pr.box, lastBy: -1, soundT: 0, hits: new Map(), remote: false });
    }
  }
  /** 서 있는 차는 길을 막는 상자, 움직이는 차는 상자를 끕니다. */
  parkBox(v: Vehicle, on: boolean): void {
    if (!on) { moveBox(this.map, v.box, { y0: 999, y1: 1000 }); return; }
    const c = Math.abs(Math.cos(v.yaw)), s = Math.abs(Math.sin(v.yaw)), hx = c * v.w / 2 + s * v.d / 2, hz = s * v.w / 2 + c * v.d / 2;
    moveBox(this.map, v.box, { x0: v.x - hx, x1: v.x + hx, z0: v.z - hz, z1: v.z + hz, y0: 0, y1: v.h });
  }
  /** 타기 좋은 차: 차체 가장자리까지 DRIVE.board 이내의 가장 가까운 빈 차(없으면 null). */
  vehicleNear(p: { x: number; z: number }): Vehicle | null {
    let best: Vehicle | null = null, bd = DRIVE.board;
    for (const v of this.vehicles) {
      if (v.wreck || v.driver >= 0) continue; const dx = p.x - v.x, dz = p.z - v.z; if (Math.abs(dx) > 8 || Math.abs(dz) > 8) continue;
      const c = Math.cos(v.yaw), s = Math.sin(v.yaw), lx = dx * c + dz * s, lz = -dx * s + dz * c, d = Math.hypot(Math.max(0, Math.abs(lx) - v.w / 2), Math.max(0, Math.abs(lz) - v.d / 2));
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
  /** 차에 태웁니다(온라인에서는 방장의 허락을 받은 뒤 부릅니다). */
  enterVehicle(p: Player, v: Vehicle): void {
    p.veh = v.id; v.driver = p.id; v.moving = true; this.parkBox(v, false); p.healT = 0; p.reload = 0; p.ads = false; p.crouch = 0; p.vx = p.vz = 0; p.x = v.x; p.z = v.z; p.hurt = 0;
    this.events.push({ t: 'veh', stage: 'enter', id: v.id, x: v.x, z: v.z });
  }
  /** 내릴 자리: 차 옆(오른쪽·왼쪽)·뒤·앞 중 서 있을 수 있는 첫 곳. */
  private exitSpot(v: Vehicle): { x: number; z: number } {
    const c = Math.cos(v.yaw), s = Math.sin(v.yaw), side = v.d / 2 + 0.95, end = v.w / 2 + 0.95;
    for (const [a, b] of [[-s * side, c * side], [s * side, -c * side], [-c * end, -s * end], [c * end, s * end]]) { const x = v.x + a, z = v.z + b; if (!circleHits(this.map, x, z, PLAYER.radius) && Math.abs(x) < this.map.half - 1 && Math.abs(z) < this.map.half - 1) return { x, z }; }
    return { x: v.x, z: v.z };
  }
  leaveVehicle(p: Player, hurt = true): void {
    const v = this.vehicles[p.veh]; p.veh = -1; if (!v) return; v.driver = -1; const spot = this.exitSpot(v); p.x = spot.x; p.z = spot.z; p.vx = p.vz = 0; p.cd = Math.max(p.cd, 0.45); pushOut(this.map, p, PLAYER.radius);
    this.events.push({ t: 'veh', stage: 'exit', id: v.id, x: v.x, z: v.z });
    if (hurt && Math.abs(v.speed) > 14) this.damage(p, (Math.abs(v.speed) - 14) * 2.2, -1, 'vehicle', false, p.x, 1, p.z, false);
  }
  /** 운전 중인 선수: 위치는 차를 따라가고, E 로 내립니다(발사·치료는 못 합니다). */
  private stepDriver(p: Player, dt: number): void {
    const v = this.vehicles[p.veh], inp = p.input; if (!v) { p.veh = -1; return; }
    p.cd = Math.max(0, p.cd - dt); p.kick = Math.max(0, p.kick - dt * 7); p.muzzle = Math.max(0, p.muzzle - dt); p.hurt = Math.max(0, p.hurt - dt); p.emptyT = Math.max(0, p.emptyT - dt);
    p.yaw = inp.yaw; p.pitch = Math.max(-1.45, Math.min(1.45, inp.pitch)); p.ads = false; p.crouch = 0; p.x = v.x; p.z = v.z; p.speed = Math.abs(v.speed); p.vx = Math.cos(v.yaw) * v.speed; p.vz = Math.sin(v.yaw) * v.speed; p.walk += p.speed * dt;
    const wantE = inp.interact && !p.interactHeld; p.interactHeld = inp.interact; p.fireHeld = !!inp.fire;
    if (wantE) this.leaveVehicle(p);
  }
  private vBlocked(v: Vehicle, x: number, z: number, yaw: number): boolean {
    const lim = this.map.half - 2; if (Math.abs(x) > lim || Math.abs(z) > lim) return true;
    const r = v.d * 0.46, off = Math.max(0, v.w / 2 - r), c = Math.cos(yaw), s = Math.sin(yaw);
    for (const k of [-off, 0, off]) { const px = x + c * k, pz = z + s * k; if (circleHits(this.map, px, pz, r) || waterDepth(this.map.terrain, px, pz) >= 2) return true; }
    for (const o of this.vehicles) if (o !== v && !o.wreck && o.moving && Math.hypot(o.x - x, o.z - z) < (v.w + o.w) * 0.28) return true;
    return false;
  }
  /** 차 내구도를 깎습니다. 온라인 손님 쪽에서는 아무것도 하지 않고, 방장이 계산해 알려 줍니다. */
  hurtVehicle(v: Vehicle, dmg: number, by: number): void {
    if (v.wreck || dmg <= 0 || !this.authority) return; if (by >= 0) v.lastBy = by; v.hp -= dmg; if (v.hp <= 0) this.explodeVehicle(v, v.lastBy);
  }
  /** 차가 터집니다(온라인 손님은 방장이 알려 준 때 부릅니다). */
  explodeVehicle(v: Vehicle, by: number): void {
    if (v.wreck) return; const drv = v.driver >= 0 ? this.players[v.driver] : null; v.wreck = true; v.hp = 0; v.speed = 0; v.moving = false;
    if (drv) this.leaveVehicle(drv, false); v.driver = -1; this.parkBox(v, true);
    this.events.push({ t: 'veh', stage: 'boom', id: v.id, x: v.x, z: v.z }); this.events.push({ t: 'nade', stage: 'boom', id: by, x: v.x, y: 1, z: v.z }); this.sounds.push({ x: v.x, z: v.z, t: this.t, by });
    for (const q of this.players) {
      if (!q.alive || q.air || q.veh >= 0) continue; const d = Math.hypot(q.x - v.x, q.z - v.z); if (d > DRIVE.boomR) continue;
      let dmg = DRIVE.boomDmg * (1 - d / DRIVE.boomR); if (q === drv) dmg = Math.max(dmg, 55); this.damage(q, dmg, by, 'vehicle', false, q.x, 1.2, q.z, false);
    }
    for (const o of this.vehicles) { if (o === v || o.wreck) continue; const d = Math.hypot(o.x - v.x, o.z - v.z); if (d < DRIVE.boomR + 2) this.hurtVehicle(o, 160 * (1 - d / (DRIVE.boomR + 2)), by); }
  }
  private stepVehicles(dt: number): void {
    for (const v of this.vehicles) {
      if (v.wreck || (!v.moving && v.driver < 0)) continue;
      if (v.remote) { this.runOver(v); continue; }
      const S = VEHICLES[v.kind], drv = v.driver >= 0 ? this.players[v.driver] : null, inp = drv?.input, wet = waterDepth(this.map.terrain, v.x, v.z), top = S.top * (wet ? 0.45 : 1);
      const thr = inp ? Math.max(-1, Math.min(1, inp.mz)) : 0, st = inp ? Math.max(-1, Math.min(1, inp.mx)) : 0, hb = !!inp?.jump && !!drv;
      if (thr > 0) v.speed += (v.speed < 0 ? S.accel * DRIVE.brake : S.accel * Math.max(0.05, 1 - Math.max(0, v.speed) / top)) * thr * dt;
      else if (thr < 0) { if (v.speed > 0.4) v.speed -= S.accel * DRIVE.brake * dt; else v.speed = Math.max(-top * DRIVE.reverse, v.speed - S.accel * 0.7 * dt); }
      else v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), DRIVE.drag * dt);
      if (hb || !drv) v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), (hb ? DRIVE.handbrake : 9) * dt);
      v.speed = Math.max(-top * DRIVE.reverse, Math.min(top, v.speed));
      const sp = Math.abs(v.speed), newYaw = v.yaw + st * S.turn * Math.min(1, sp / 7) * (1 - 0.45 * Math.min(1, sp / S.top)) * (hb ? 1.5 : 1) * Math.sign(v.speed || 1) * dt;
      if (!this.vBlocked(v, v.x, v.z, newYaw)) v.yaw = newYaw;
      const mx = Math.cos(v.yaw) * v.speed * dt, mz = Math.sin(v.yaw) * v.speed * dt;
      if (!this.vBlocked(v, v.x + mx, v.z + mz, v.yaw)) { v.x += mx; v.z += mz; }
      else if (!this.vBlocked(v, v.x + mx, v.z, v.yaw)) { v.x += mx; v.speed *= 0.97; }
      else if (!this.vBlocked(v, v.x, v.z + mz, v.yaw)) { v.z += mz; v.speed *= 0.97; }
      else if (sp > 1) {
        // 정면 충돌: 튕겨 나오고 속도에 따라 차체와 운전자가 다칩니다
        v.speed = -v.speed * 0.25; this.events.push({ t: 'veh', stage: 'crash', id: v.id, x: v.x, z: v.z }); this.sounds.push({ x: v.x, z: v.z, t: this.t, by: v.driver });
        if (sp > DRIVE.crashMin) {
          if (drv && sp > 9) this.damage(drv, (sp - 9) * DRIVE.crashDriver, -1, 'vehicle', false, v.x, 1, v.z, false);
          const body = (sp - DRIVE.crashMin) * DRIVE.crashBody; if (this.authority) this.hurtVehicle(v, body, -1); else this.events.push({ t: 'vhurt', id: v.id, dmg: body }); if (v.wreck) continue;
        }
      }
      if (drv) { drv.x = v.x; drv.z = v.z; if (sp > 8 && this.t - v.soundT > 0.7) { v.soundT = this.t; this.sounds.push({ x: v.x, z: v.z, t: this.t, by: drv.id }); } }
      this.runOver(v);
      if (!drv && Math.abs(v.speed) < 0.15) { v.speed = 0; v.moving = false; this.parkBox(v, true); }
    }
  }

  /** 달리는 차에 치인 선수(각 브라우저는 자기가 계산하는 선수만 실제로 다칩니다). */
  private runOver(v: Vehicle): void {
    const sp = Math.abs(v.speed); if (sp <= DRIVE.runMin) return;
    const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
    for (const q of this.players) {
      if (!q.alive || q.air || q.veh >= 0 || q.id === v.driver) continue; const dx = q.x - v.x, dz = q.z - v.z; if (Math.abs(dx) > 7 || Math.abs(dz) > 7) continue;
      const lx = dx * c + dz * s, lz = -dx * s + dz * c; if (Math.abs(lx) > v.w / 2 + 0.3 || Math.abs(lz) > v.d / 2 + 0.3 || (v.hits.get(q.id) ?? -9) > this.t - DRIVE.runCd) continue;
      v.hits.set(q.id, this.t); this.damage(q, sp * DRIVE.runDmg, v.driver, 'vehicle', false, q.x, 1, q.z, false); if (!v.remote) v.speed *= 0.94;
    }
  }

  // ---------- 폭격 ----------
  /** (x,z) 를 덮고 있는 폭격 구역(경고가 켜진 뒤 마지막 포탄이 떨어질 때까지). margin 만큼 넓게 봅니다. */
  redAt(x: number, z: number, margin = 0): RedZone | null {
    for (const r of this.reds) if (r.called && this.t < r.end + RED.fall && Math.hypot(x - r.x, z - r.z) < r.r + margin) return r;
    return null;
  }
  private stepReds(dt: number): void {
    for (const r of this.reds) {
      if (!r.called && this.t >= r.call) { r.called = true; this.events.push({ t: 'red', stage: 'call', x: r.x, z: r.z, r: r.r }); }
      if (!r.called) continue;
      if (this.t >= r.start && this.t < r.end) {
        r.next -= dt;
        while (r.next <= 0) { r.next += RED.every * (0.6 + r.rng() * 0.8); const a = r.rng() * Math.PI * 2, d = Math.sqrt(r.rng()) * r.r; this.shells.push({ id: this.shellId++, x: r.x + Math.cos(a) * d, z: r.z + Math.sin(a) * d, t0: this.t, land: this.t + RED.fall }); }
      }
      if (!r.ended && this.t >= r.end) { r.ended = true; this.events.push({ t: 'red', stage: 'end', x: r.x, z: r.z, r: r.r }); }
    }
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const sh = this.shells[i]; if (this.t < sh.land) continue; this.shells.splice(i, 1);
      this.events.push({ t: 'nade', stage: 'boom', id: -1, x: sh.x, y: 0.4, z: sh.z });
      for (const q of this.players) {
        if (!q.alive || q.air) continue; const d = Math.hypot(q.x - sh.x, q.z - sh.z); if (d > RED.blast) continue;
        let dmg = RED.dmg * (1 - d / RED.blast); if (this.map.buildings.some(b => Math.abs(q.x - b.x) < b.w / 2 && Math.abs(q.z - b.z) < b.d / 2)) dmg *= 0.5; if (dmg >= 1) this.damage(q, dmg, -1, 'bomb', false, q.x, 1.2, q.z, false);
      }
      for (const v of this.vehicles) { if (v.wreck) continue; const d = Math.hypot(v.x - sh.x, v.z - sh.z); if (d < RED.blast) this.hurtVehicle(v, 170 * (1 - d / RED.blast), -1); }
    }
  }

  private lastDead(): number { let best = -1, at = -1; for (const p of this.players) if (p.diedAt > at) { at = p.diedAt; best = p.id; } return best; }
  finish(winner: number): void { if (this.over) return; this.over = true; this.winner = winner; const w = this.players[winner]; if (w && w.alive) w.place = 1; this.events.push({ t: 'over', winner }); }

  private update(p: Player, dt: number): void {
    const inp = p.input;
    if (p.boost > 0) { p.boost = Math.max(0, p.boost - dt); if (!p.remote && p.hp < BOOST.cap) p.hp = Math.min(BOOST.cap, p.hp + BOOST.heal * dt); }
    p.cd = Math.max(0, p.cd - dt); p.kick = Math.max(0, p.kick - dt * 7); p.muzzle = Math.max(0, p.muzzle - dt); p.hurt = Math.max(0, p.hurt - dt); p.emptyT = Math.max(0, p.emptyT - dt);
    if (!p.remote) {
      p.yaw = inp.yaw; p.pitch = Math.max(-1.45, Math.min(1.45, inp.pitch)); p.ads = inp.ads && p.reload <= 0;
      const fx = Math.cos(p.yaw), fz = Math.sin(p.yaw), rx = -fz, rz = fx;
      let wx = fx * inp.mz + rx * inp.mx, wz = fz * inp.mz + rz * inp.mx; const wl = Math.hypot(wx, wz); if (wl > 1) { wx /= wl; wz /= wl; }
      p.crouch += ((inp.crouch && p.air === 0 ? 1 : 0) - p.crouch) * Math.min(1, dt * 12);
      const wet = waterDepth(this.map.terrain, p.x, p.z), run = inp.sprint && inp.mz > 0.2 && !p.ads && wet < 2 && p.crouch < 0.3 && p.healT <= 0, top = (run ? PLAYER.sprint : PLAYER.walk) * WATER_SLOW[wet] * (1 - (1 - PLAYER.crouchSpeed) * p.crouch) * (p.ads ? 0.6 : 1) * (p.healT > 0 ? HEAL.walk : 1) * (p.bot ? BOTS[this.difficulty].speed : 1) * (p.boost > 0 ? BOOST.speed : 1);
      const k = Math.min(1, dt * (wl > 0.05 ? 15 : 22)); p.vx += (wx * top - p.vx) * k; p.vz += (wz * top - p.vz) * k;
      if (slideMove(this.map, p, p.vx * dt, p.vz * dt, PLAYER.radius)) { /* 벽에 닿은 쪽 속도는 죽입니다 */ if (blockedAt(this.map, p.x + Math.sign(p.vx) * 0.05, p.z, PLAYER.radius)) p.vx = 0; if (blockedAt(this.map, p.x, p.z + Math.sign(p.vz) * 0.05, PLAYER.radius)) p.vz = 0; }
      const lim = this.map.half - 1; p.x = Math.max(-lim, Math.min(lim, p.x)); p.z = Math.max(-lim, Math.min(lim, p.z));
      p.speed = Math.hypot(p.vx, p.vz); p.walk += p.speed * dt;
    }
    // 치료: 붕대·구급상자를 쓰는 동안 시간이 지나야 회복됩니다(쏘면 중단).
    if (!p.remote) {
      if (p.healT > 0) {
        const H = p.healKind === 'kit' ? HEAL.kit : HEAL.bandage;
        if (inp.fire || inp.nade || p.air) { p.healT = 0; this.events.push({ t: 'heal', id: p.id, stage: 'cancel', kind: p.healKind }); }
        else { p.healT -= dt; if (p.healT <= 0) { p.healT = 0; p.hp = Math.min(Math.max(p.hp, H.cap), p.hp + H.amount); this.events.push({ t: 'heal', id: p.id, stage: 'done', kind: p.healKind }); } }
      } else if (inp.heal && p.air === 0) {
        const want = inp.heal; inp.heal = 0;
        const kind = want === 2 ? 'kit' : 'bandage', H = kind === 'kit' ? HEAL.kit : HEAL.bandage;
        if ((kind === 'kit' ? p.kits : p.bandages) > 0 && p.hp < H.cap) { if (kind === 'kit') p.kits--; else p.bandages--; p.healKind = kind; p.healT = H.time; p.reload = 0; this.events.push({ t: 'heal', id: p.id, stage: 'start', kind }); }
      }
    }
    // 수류탄
    p.nadeCd -= dt; if (inp.nade && !p.nadeHeld && p.nades > 0 && p.nadeCd <= 0 && p.air === 0 && !p.remote) this.throwNade(p); p.nadeHeld = !!inp.nade;
    // 무기 교체
    if (inp.slot >= 0 && inp.slot < 2 && inp.slot !== p.cur && p.guns[inp.slot]) { p.cur = inp.slot; p.reload = 0; p.cd = Math.max(p.cd, 0.35); inp.slot = -1; }
    const gun = p.guns[p.cur]; const def = gun ? WEAPONS[gun.id] : null; if (gun && !gun.att) gun.att = {};
    if (gun && def) {
      if (p.reload > 0) { p.reload -= dt; if (p.reload <= 0) { p.reload = 0; const n = Math.max(0, Math.min(magOf(def.id, gun.att) - gun.mag, gun.reserve)); gun.mag += n; gun.reserve -= n; } }
      else if ((inp.reload && gun.mag < magOf(def.id, gun.att) && gun.reserve > 0) || (gun.mag === 0 && gun.reserve > 0 && inp.fire)) { p.reload = def.reload * partHandling(gun.att).reload; this.events.push({ t: 'reload', id: p.id }); }
      if (inp.fire && p.cd <= 0 && p.reload <= 0 && (def.auto || !p.fireHeld)) {
        if (gun.mag > 0) this.shoot(p, gun, def.id); else if (p.emptyT <= 0) { p.emptyT = 0.5; this.events.push({ t: 'empty', id: p.id }); }
      }
    }
    // Bots request sustained engagement; simulate repeated trigger presses for semi-auto guns.
    // Human players still need to release the trigger between shots.
    p.fireHeld = inp.fire && !(p.bot && def && !def.auto);
    // 줍기
    const wantE = inp.interact && !p.interactHeld; p.interactHeld = inp.interact;
    let took = false;
    if (!p.remote) for (const l of this.loot) {
      if (l.taken) continue; const dx = l.x - p.x, dz = l.z - p.z; if (dx * dx + dz * dz > PLAYER.pickup * PLAYER.pickup) continue;
      if (l.kind === 'weapon') { if (wantE) { this.takeWeapon(p, l); took = true; break; } continue; }
      if (l.kind === 'attach') { if (this.takePart(p, l, wantE)) { took = true; break; } continue; }
      this.takeAuto(p, l);
    }
    // 주울 무기가 없을 때 E 는 가까운 차량에 탑니다
    if (wantE && !took && !p.bot && !p.remote && p.air === 0 && this.vehicles.length) { const v = this.vehicleNear(p); if (v) { if (this.authority) this.enterVehicle(p, v); else this.events.push({ t: 'vreq', id: v.id }); } }
  }

  private throwNade(p: Player): void {
    p.nades--; p.nadeCd = NADE.cd; const cp = Math.cos(p.pitch), eye = eyeOf(p), fx = Math.cos(p.yaw) * cp, fz = Math.sin(p.yaw) * cp;
    const n: Nade = { id: this.nadeId++, owner: p.id, x: p.x + fx * 0.6, y: eye - 0.1, z: p.z + fz * 0.6, vx: fx * NADE.speed + p.vx * 0.5, vy: Math.sin(p.pitch) * NADE.speed + 4.5, vz: fz * NADE.speed + p.vz * 0.5, fuse: NADE.fuse };
    this.nades.push(n); this.sounds.push({ x: p.x, z: p.z, t: this.t, by: p.id, quiet: true }); this.events.push({ t: 'nade', stage: 'throw', id: p.id, x: n.x, y: n.y, z: n.z, vx: n.vx, vy: n.vy, vz: n.vz });
  }
  /** 다른 브라우저에서 던진 수류탄을 똑같이 만들어 굴립니다(터지면 이 브라우저가 계산하는 선수만 다칩니다). */
  addNade(owner: number, x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    const n: Nade = { id: this.nadeId++, owner, x, y, z, vx, vy, vz, fuse: NADE.fuse }; this.nades.push(n);
    this.sounds.push({ x, z, t: this.t, by: owner, quiet: true }); this.events.push({ t: 'nade', stage: 'throw', id: owner, x, y, z, remote: true });
  }
  private stepNades(dt: number): void {
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const n = this.nades[i]; n.fuse -= dt; n.vy -= 18 * dt;
      const nx = n.x + n.vx * dt, nz = n.z + n.vz * dt;
      if (blockedAt(this.map, nx, n.z, 0.15)) n.vx *= -0.45; else n.x = nx;
      if (blockedAt(this.map, n.x, nz, 0.15)) n.vz *= -0.45; else n.z = nz;
      n.y += n.vy * dt; if (n.y < 0.12) { n.y = 0.12; n.vy = Math.abs(n.vy) > 2 ? -n.vy * 0.38 : 0; n.vx *= 0.7; n.vz *= 0.7; }
      if (n.fuse > 0) continue;
      this.nades.splice(i, 1); this.events.push({ t: 'nade', stage: 'boom', id: n.owner, x: n.x, y: n.y, z: n.z });
      this.sounds.push({ x: n.x, z: n.z, t: this.t, by: n.owner });
      for (const v of this.vehicles) { if (v.wreck) continue; const d = Math.hypot(v.x - n.x, v.z - n.z); if (d < NADE.radius + 1.5) this.hurtVehicle(v, NADE.dmg * 1.4 * (1 - d / (NADE.radius + 1.5)), n.owner); }
      for (const q of this.players) {
        if (!q.alive || q.air || q.veh >= 0) continue; const d = Math.hypot(q.x - n.x, q.z - n.z, (1 - n.y) * 0.5); if (d > NADE.radius) continue;
        let dmg = NADE.dmg * (1 - d / NADE.radius) ** 1.2; if (!lineClear(this.map, n.x, Math.max(0.3, n.y), n.z, q.x, 1.0, q.z)) dmg *= 0.3; if (dmg < 3) continue;
        this.damage(q, dmg, n.owner, 'grenade', false, q.x, 1.2, q.z, false);
      }
    }
  }
  /** 새 전리품을 놓고 알립니다. */
  private spawnLoot(l: Omit<Loot, 'id' | 'taken'>): void { const it = { ...l, id: this.nextLoot++, taken: false } as Loot; this.loot.push(it); this.events.push({ t: 'loot', loot: it }); }
  /** 다른 브라우저가 만든 전리품을 받습니다(이미 있으면 무시). */
  addLoot(l: Loot): void { if (!this.loot.some(x => x.id === l.id)) this.loot.push({ ...l }); }
  private take(p: Player, l: Loot): void { l.taken = true; this.events.push({ t: 'pickup', id: p.id, loot: l.id, kind: l.kind, weapon: l.weapon, part: l.part ?? null, level: l.level ?? 0 }); }
  /** 다른 쪽(원격)이 먼저 주운 전리품을 치웁니다. */
  removeLoot(id: number): void { const l = this.loot.find(x => x.id === id); if (l) l.taken = true; }
  private takeAuto(p: Player, l: Loot): void {
    if (l.kind === 'grenade') { if (p.nades >= NADE.max) return; p.nades = Math.min(NADE.max, p.nades + NADE.pick); this.take(p, l); }
    else if (l.kind === 'bandage') { if (p.bandages >= HEAL.bandage.max) return; p.bandages = Math.min(HEAL.bandage.max, p.bandages + HEAL.bandage.pick); this.take(p, l); }
    else if (l.kind === 'medkit') { if (p.kits >= HEAL.kit.max) return; p.kits = Math.min(HEAL.kit.max, p.kits + HEAL.kit.pick); this.take(p, l); }
    else if (l.kind === 'armor') {
      // 더 높은 등급이면 갈아입고, 같은 등급은 많이 상했을 때만 새것으로 바꿉니다.
      const lv = Math.max(1, Math.min(3, l.level || 2)); if (lv < p.armorLv || (lv === p.armorLv && p.armor > ARMOR_PTS[lv] * 0.5)) return;
      p.armorLv = lv; p.armor = ARMOR_PTS[lv]; this.take(p, l);
    }
    else if (l.kind === 'helmet') { if (p.helmet >= (l.level ?? 1)) return; p.helmet = l.level ?? 1; this.take(p, l); }
    else if (l.kind === 'boost') { if (p.boost > BOOST.time * 0.6) return; p.boost = BOOST.time; this.take(p, l); }
    else if (l.kind === 'ammo') {
      let any = false; for (const g of p.guns) if (g && g.reserve < WEAPONS[g.id].mag * 6) { g.reserve = Math.min(WEAPONS[g.id].mag * 6, g.reserve + Math.ceil(WEAPONS[g.id].mag * 1.5)); any = true; }
      if (any) this.take(p, l);
    }
  }
  /** 파츠를 달 총: 들고 있는 총이 맞으면 그 총, 아니면 다른 칸의 총. 이미 같은 파츠면 null. */
  partTarget(p: Player, part: PartId): { gun: Gun; fit: 'new' | 'upgrade' | 'swap' } | null {
    for (const g of [p.guns[p.cur], p.guns[1 - p.cur]]) {
      if (!g || !canFit(g.id, part)) continue;
      const fit = partFit(g.att, part); if (fit === 'same') continue; return { gun: g, fit };
    }
    return null;
  }
  private takePart(p: Player, l: Loot, wantE: boolean): boolean {
    const part = l.part!, t = this.partTarget(p, part); if (!t || (t.fit === 'swap' && !wantE)) return false;
    const slot = PARTS[part].slot, old = t.gun.att[slot];
    if (old) this.spawnLoot({ kind: 'attach', weapon: null, part: old, level: 0, x: p.x + Math.cos(p.yaw) * 1.1, z: p.z + Math.sin(p.yaw) * 1.1 });
    t.gun.att[slot] = part; this.take(p, l); return true;
  }
  private takeWeapon(p: Player, l: Loot): void {
    const id = l.weapon!, def = WEAPONS[id], same = p.guns.find(g => g?.id === id);
    if (same) { same.reserve = Math.min(def.mag * 6, same.reserve + def.mag * 2); this.take(p, l); return; }
    const att: Attachments = { ...(l.att ?? {}) };
    const free = p.guns.indexOf(null);
    const rankAt = (i: number): number => WEAPONS[p.guns[i]!.id].rank;
    const slot = free >= 0 ? free : p.bot && rankAt(1 - p.cur) < rankAt(p.cur) ? 1 - p.cur : p.cur, old = p.guns[slot];
    if (p.bot && old && WEAPONS[old.id].rank >= def.rank) return;
    if (old) this.spawnLoot({ kind: 'weapon', weapon: old.id, att: { ...old.att }, x: p.x + Math.cos(p.yaw) * 0.8, z: p.z + Math.sin(p.yaw) * 0.8 });
    p.guns[slot] = { id, mag: magOf(id, att), reserve: def.mag * 2, att }; p.cur = slot; p.reload = 0; p.cd = 0.35; this.take(p, l);
  }

  private shoot(p: Player, gun: Gun, id: WeaponId): void {
    const def = WEAPONS[id]; gun.mag--; p.cd = def.cd; p.kick = Math.min(1, p.kick + def.recoil * 12); p.muzzle = 0.06;
    const h = partHandling(gun.att), quiet = gun.att.muzzle === 'suppressor';
    p.kick = Math.max(0, p.kick - def.recoil * 12 * (1 - h.kick));
    const moving = Math.min(1.6, p.speed / PLAYER.walk), spread = def.spread * h.spread * (p.ads ? adsSpread(gun.att) : 1) * (1 + moving * 0.5) * (1 + p.kick * 0.5) * (1 - 0.22 * p.crouch);
    const ox = p.x, oy = eyeOf(p), oz = p.z, ends: number[] = [];
    for (let i = 0; i < def.pellets; i++) {
      const a = this.rng() * Math.PI * 2, r = spread * Math.sqrt(this.rng()), yaw = p.yaw + Math.cos(a) * r, pitch = p.pitch + Math.sin(a) * r;
      this.bullet(p.id, id, ox, oy, oz, yaw, pitch, ends, false);
    }
    this.events.push({ t: 'shot', id: p.id, weapon: id, ox, oy, oz, ends, remote: false, sup: quiet });
    this.sounds.push({ x: p.x, z: p.z, t: this.t, by: p.id, quiet });
  }

  /** 총알 한 발을 날립니다. 맞은 대상에게 피해를 주고 끝점을 ends 에 넣습니다. localOnly: 원격 선수가 쏜 탄은 내 쪽 선수만 맞힙니다. */
  bullet(shooter: number, id: WeaponId, ox: number, oy: number, oz: number, yaw: number, pitch: number, ends: number[], fromRemote: boolean): void {
    const def = WEAPONS[id], cp = Math.cos(pitch), dx = Math.cos(yaw) * cp, dy = Math.sin(pitch), dz = Math.sin(yaw) * cp;
    const wallT = rayWorld(this.map, ox, oy, oz, dx, dy, dz, def.range);
    let hitT = Math.min(wallT, def.range), target: Player | null = null, head = false, vcand: Vehicle | null = null, vt = Infinity;
    // 차체: 서 있는 차는 지도 상자가 먼저 막고, 움직이는 차는 여기서 막습니다(상자와 거의 같은 거리면 차가 맞은 것).
    for (const v of this.vehicles) { if (v.wreck) continue; const t = rayVehicle(v, ox, oy, oz, dx, dy, dz, def.range); if (t < vt) { vt = t; vcand = v; } }
    if (vcand && vt <= hitT + 0.9) hitT = Math.min(hitT, vt); else vcand = null;
    for (const q of this.players) {
      if (!q.alive || q.id === shooter || q.air || q.veh >= 0) continue;
      const px = ox - q.x, pz = oz - q.z, a = dx * dx + dz * dz; if (a < 1e-9) continue;
      const R = fromRemote ? 0.62 : 0.5, b = 2 * (px * dx + pz * dz), c = px * px + pz * pz - R * R, disc = b * b - 4 * a * c; if (disc < 0) continue;
      let t = (-b - Math.sqrt(disc)) / (2 * a); if (t < 0) { if (c < 0) t = 0; else continue; }
      if (t >= hitT) continue; const y = oy + dy * t, cr = q.remote ? q.crouch : q.crouch; if (y < 0 || y > heightOf(cr) + 0.1) continue;
      hitT = t; target = q; head = y > headOf(cr);
    }
    const ex = ox + dx * hitT, ey = oy + dy * hitT, ez = oz + dz * hitT; ends.push(ex, ey, ez);
    if (target) {
      const fall = hitT <= def.falloff ? 1 : Math.max(0.4, 1 - 0.6 * (hitT - def.falloff) / Math.max(1, def.range - def.falloff));
      this.damage(target, def.dmg * fall * (head ? def.head : 1), shooter, id, head, ex, ey, ez, false);
    } else {
      if (hitT < def.range) this.events.push({ t: 'hit', victim: -1, attacker: shooter, dmg: 0, head: false, x: ex, y: ey, z: ez, wall: true });
      if (vcand) {
        const fall = hitT <= def.falloff ? 1 : Math.max(0.4, 1 - 0.6 * (hitT - def.falloff) / Math.max(1, def.range - def.falloff)), dmg = def.dmg * def.pellets * fall;
        const drv = vcand.driver >= 0 ? this.players[vcand.driver] : null; if (drv && drv.id !== shooter) this.damage(drv, dmg * DRIVE.driverCut, shooter, id, false, drv.x, 1.2, drv.z, false);
        this.hurtVehicle(vcand, dmg * DRIVE.shotCut, shooter);
      }
    }
  }

  /** 네트워크로 받은 상대의 사격: 내 쪽 선수에게만 피해를 줍니다. */
  remoteShot(shooter: number, id: WeaponId, ox: number, oy: number, oz: number, aims: Array<[number, number]>): void {
    const ends: number[] = []; for (const [yaw, pitch] of aims) this.bullet(shooter, id, ox, oy, oz, yaw, pitch, ends, true);
    this.events.push({ t: 'shot', id: shooter, weapon: id, ox, oy, oz, ends, remote: true });
  }

  damage(q: Player, dmg: number, by: number, weapon: Cause, head: boolean, x: number, y: number, z: number, silent: boolean): void {
    if (!q.alive) return;
    const real = !q.remote; if (real && head && q.helmet > 0) dmg *= 1 - HELMET_CUT[q.helmet]; let hp = dmg;
    if (real && weapon !== 'zone' && q.armor > 0) { const soak = Math.min(q.armor, dmg * ARMOR_ABS[q.armorLv || 2]); q.armor -= soak; hp = dmg - soak; if (q.armor <= 0) { q.armor = 0; q.armorLv = 0; } }
    if (weapon !== 'zone' && by >= 0 && by !== q.id) { const a = this.players[by]; if (a) { a.dmgDealt += Math.min(dmg, Math.max(0, q.hp + 40)); if (head) a.heads++; } }
    if (real && weapon !== 'zone' && q.healT > 0) { q.healT = 0; this.events.push({ t: 'heal', id: q.id, stage: 'cancel', kind: q.healKind }); }
    if (real) { q.hp -= hp; q.lastHitBy = by; if (!silent) { q.hurt = 0.5; const a = this.players[by]; if (a) q.hurtYaw = Math.atan2(a.z - q.z, a.x - q.x); } }
    if (!silent) this.events.push({ t: 'hit', victim: q.id, attacker: by, dmg: Math.round(dmg), head, x, y, z, wall: false });
    if (real && q.hp <= 0) this.kill(q, weapon === 'zone' ? -1 : by, weapon);
  }
  /** 선수를 쓰러뜨립니다(원격 선수는 네트워크 소식으로 호출). */
  kill(q: Player, by: number, weapon: Cause): void {
    if (!q.alive) return; if (q.veh >= 0) this.leaveVehicle(q, false); q.alive = false; q.hp = 0; q.diedAt = this.t; q.healT = 0; q.killedBy = by; q.killedWeapon = weapon; q.place = this.aliveCount() + 1;
    const killer = this.players[by]; if (killer && killer.id !== q.id) killer.kills++;
    // 쓰러진 선수의 총·헬멧은 그 선수를 계산하는 브라우저가 떨어뜨리고 알립니다(온라인에서 번호가 겹치지 않게).
    if (!q.remote) {
      for (const g of q.guns) if (g) this.spawnLoot({ kind: 'weapon', weapon: g.id, att: { ...g.att }, x: q.x + (this.rng() - 0.5) * 1.6, z: q.z + (this.rng() - 0.5) * 1.6 });
      if (q.helmet > 0) this.spawnLoot({ kind: 'helmet', weapon: null, part: null, level: q.helmet, x: q.x + (this.rng() - 0.5) * 1.6, z: q.z + (this.rng() - 0.5) * 1.6 });
    }
    this.events.push({ t: 'kill', victim: q.id, attacker: by, weapon });
  }
}

export { DIFFICULTIES };
export type { Difficulty };
