// ZERO ZONE — 경기 시뮬레이션: 이동·사격·피해·전리품·줄어드는 자기장·승패. 화면과 무관해서 테스트와 봇 대 봇 시뮬레이션에서 그대로 돌립니다.
import { AIR, BOOST, BOTS, BOT_NAMES, DIFFICULTIES, HELMET_CUT, MAP_HALF, PART_FITS, PARTS, partFit, PLAYER, SKIN_TONES, TEAM_COLORS, WEAPONS, ZONES, magOf, makeRng, partHandling, type Attachments, type Difficulty, type Mode, type PartId, type WeaponId } from './config';
import { blockedAt, generateMap, lineClear, pushOut, rayWorld, slideMove, type GameMap, type Loot } from './world';
import { WATER_SLOW, waterDepth } from './terrain';
import { thinkBot, thinkAir, newBrain, type BotBrain } from './bot';

export interface Input { mx: number; mz: number; yaw: number; pitch: number; fire: boolean; sprint: boolean; reload: boolean; interact: boolean; ads: boolean; slot: number; /** 수류탄 던지기(눌린 프레임) */ nade?: boolean; /** 웅크리기(누르고 있는 동안) */ crouch?: boolean; /** 점프(비행기에서 뛰어내리기) · 낙하산 펴기 */ jump?: boolean }
export const blankInput = (): Input => ({ mx: 0, mz: 0, yaw: 0, pitch: 0, fire: false, sprint: false, reload: false, interact: false, ads: false, slot: -1 });
/** 비행기 항로: 시작점에서 방향(dx,dz)으로 plane m/s 로 날아 len 미터 뒤에 지도를 벗어납니다. */
export interface Plane { x0: number; z0: number; dx: number; dz: number; speed: number; len: number; end: number }
/** 0 땅 · 1 비행기 안 · 2 자유낙하 · 3 낙하산 */
export type AirState = 0 | 1 | 2 | 3;
export interface Gun { id: WeaponId; mag: number; reserve: number; att: Attachments }
/** 보급 투하: call 시각에 비행기가 지나며 상자를 떨어뜨리고, at 시각에 착지해 전리품이 열립니다. */
/** 웅크림 정도(0~1)에 따른 눈높이·키·머리 높이 */
export const eyeOf = (p: { crouch: number }): number => PLAYER.eye - (PLAYER.eye - PLAYER.crouchEye) * p.crouch;
export const heightOf = (cr: number): number => PLAYER.height - (PLAYER.height - PLAYER.crouchHeight) * cr;
export const headOf = (cr: number): number => PLAYER.head - (PLAYER.head - PLAYER.crouchHead) * cr;
/** 던져진 수류탄 */
export interface Nade { id: number; owner: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; fuse: number }
export const NADE = { max: 5, pick: 2, fuse: 2.7, speed: 17, radius: 7, dmg: 150, cd: 1.2 };
export interface Drop { x: number; z: number; at: number; fall: number; called: boolean; landed: boolean }
export interface Player {
  id: number; name: string; bot: boolean; remote: boolean; color: number; skin: number;
  x: number; z: number; yaw: number; pitch: number; vx: number; vz: number; hp: number; armor: number; helmet: number; boost: number; alive: boolean;
  guns: (Gun | null)[]; cur: number; reload: number; cd: number; fireHeld: boolean; interactHeld: boolean;
  kills: number; place: number; diedAt: number; input: Input; brain: BotBrain | null;
  /** 낙하 상태와 지면으로부터의 높이(m) */ air: AirState; alt: number; jumpHeld: boolean; landedAt: number;
  /** 웅크린 정도 0(서 있음)~1(완전히 웅크림) */ crouch: number; walk: number; kick: number; muzzle: number; hurt: number; hurtYaw: number; ads: boolean; speed: number; lastHitBy: number; emptyT: number;
  /** 수류탄 개수·재사용 대기 */ nades: number; nadeCd: number; nadeHeld: boolean;
}
export type MatchEvent =
  | { t: 'shot'; id: number; weapon: WeaponId; ox: number; oy: number; oz: number; ends: number[]; remote: boolean; sup?: boolean }
  | { t: 'hit'; victim: number; attacker: number; dmg: number; head: boolean; x: number; y: number; z: number; wall: boolean }
  | { t: 'kill'; victim: number; attacker: number; weapon: WeaponId | 'zone' | 'grenade' }
  | { t: 'pickup'; id: number; loot: number; kind: Loot['kind']; weapon: WeaponId | null; part?: PartId | null; level?: number }
  | { t: 'drop'; stage: 'call' | 'land'; x: number; z: number }
  | { t: 'jump'; id: number } | { t: 'chute'; id: number } | { t: 'land'; id: number }
  | { t: 'nade'; stage: 'throw' | 'boom'; id: number; x: number; y: number; z: number }
  | { t: 'reload'; id: number } | { t: 'empty'; id: number } | { t: 'over'; winner: number };

export interface ZoneState { cx: number; cz: number; r: number; nextCx: number; nextCz: number; nextR: number; shrinking: boolean; phase: number; timeLeft: number; dps: number }

export interface MatchOptions { seed: number; mode: Mode; difficulty: Difficulty; /** 사람(또는 원격) 선수 이름들. 나머지는 봇이 채웁니다. */ humans: Array<{ name: string; remote?: boolean }>; fill?: number; /** 비행기에서 낙하산으로 시작(솔로 배틀로열). 꺼 두면 땅에서 시작합니다. */ air?: boolean }

export class Match {
  map: GameMap; mode: Mode; difficulty: Difficulty; seed: number;
  players: Player[] = []; loot: Loot[]; t = 0; over = false; winner = -1; events: MatchEvent[] = [];
  /** 최근 총소리(봇이 듣습니다) */ sounds: Array<{ x: number; z: number; t: number; by: number; quiet?: boolean }> = [];
  /** 보급 투하(솔로 배틀로열만) */ drops: Drop[] = [];
  /** 날아다니는 수류탄 */ nades: Nade[] = []; private nadeId = 1;
  /** 비행기 항로(낙하 시작일 때만) */ plane: Plane | null = null;
  /** 자기장 시간이 흐르기 시작하는 때(낙하하는 동안은 기다립니다) */ zoneDelay = 0;
  rng: () => number;
  private centers: Array<{ x: number; z: number; r: number }>; private starts: number[]; private nextLoot: number;

  constructor(o: MatchOptions) {
    this.seed = o.seed; this.mode = o.mode; this.difficulty = o.difficulty;
    this.map = generateMap(o.seed, o.mode); this.loot = this.map.loot.map(l => ({ ...l })); this.nextLoot = this.loot.length + 1000;
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
        if (!blockedAt(this.map, x, z, 3.2) || i === 29) { this.drops.push({ x, z, at, fall: 16, called: false, landed: false }); break; }
      }
    }
    const total = o.fill ?? (o.mode === 'br' ? 20 : o.humans.length), names = [...BOT_NAMES].sort(() => this.rng() - 0.5), air = !!this.plane;
    for (let i = 0; i < total; i++) {
      const h = o.humans[i], sp = air ? this.planeAt(0) : this.map.spawns[i % this.map.spawns.length], bi = i - o.humans.length, cyc = Math.floor(bi / names.length);
      const p: Player = {
        id: i, name: h?.name ?? names[bi % names.length] + (cyc > 0 ? String(cyc + 1) : ''), bot: !h, remote: !!h?.remote, color: TEAM_COLORS[i % TEAM_COLORS.length], skin: SKIN_TONES[i % SKIN_TONES.length],
        x: sp.x, z: sp.z, yaw: air ? Math.atan2(this.plane!.dz, this.plane!.dx) : Math.atan2(-sp.z, -sp.x), pitch: 0, vx: 0, vz: 0, hp: PLAYER.hp, armor: 0, helmet: 0, boost: 0, alive: true,
        guns: [{ id: 'pistol', mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.mag * 2, att: {} }, null], cur: 0, reload: 0, cd: 0.4, fireHeld: false, interactHeld: false,
        kills: 0, place: 0, diedAt: 0, input: blankInput(), brain: null, air: air ? 1 : 0, alt: air ? AIR.alt : 0, jumpHeld: false, landedAt: 0, crouch: 0, walk: 0, kick: 0, muzzle: 0, hurt: 0, hurtYaw: 0, ads: false, speed: 0, lastHitBy: -1, emptyT: 0, nades: 0, nadeCd: 0, nadeHeld: false,
      };
      if (p.bot) { p.brain = newBrain(this.rng, BOTS[o.difficulty]); if (air) this.planDrop(p); }
      p.input.yaw = p.yaw; this.players.push(p);
    }
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
    this.stepDrops(); this.stepNades(dt);
    // 멀리 있는 AI(사람 시야 밖)는 생각을 0.2초에 한 번만 해서 100명이 뛰어도 가볍게 돕니다.
    const humans: Player[] = []; for (const q of this.players) if (!q.bot && q.alive) humans.push(q);
    for (const p of this.players) {
      if (!p.alive) continue;
      if (p.air) { this.stepAir(p, dt); continue; }
      if (p.bot && p.brain) {
        const b = p.brain; b.acc += dt; let far = true; for (const h of humans) if (Math.abs(h.x - p.x) < 150 && Math.abs(h.z - p.z) < 150) { far = false; break; }
        if (!far || b.acc >= 0.2) { thinkBot(this, p, b.acc, zone); b.acc = 0; }
      }
      this.update(p, dt);
      if (!p.remote && Math.hypot(p.x - zone.cx, p.z - zone.cz) > zone.r) this.damage(p, zone.dps * dt, -1, 'zone', false, p.x, 1, p.z, true);
    }
    // 마지막 한 명이 남으면 끝납니다(동시에 모두 쓰러졌다면 마지막에 쓰러진 쪽이 승자).
    if (!this.over) {
      const alive = this.players.filter(p => p.alive);
      if (alive.length <= 1 && this.players.length > 1) this.finish(alive[0]?.id ?? this.lastDead());
    }
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
          { kind: 'weapon', weapon: this.rng() < 0.5 ? 'sniper' : 'rifle', part: null, level: 0, att: this.rng() < 0.5 ? { sight: 'scope4' } : { muzzle: 'comp' } },
          { kind: 'attach', weapon: null, part: 'scope4', level: 0 }, { kind: 'attach', weapon: null, part: 'extmag', level: 0 }, { kind: 'attach', weapon: null, part: 'suppressor', level: 0 },
          { kind: 'helmet', weapon: null, part: null, level: 3 }, { kind: 'armor', weapon: null, part: null, level: 0 }, { kind: 'medkit', weapon: null, part: null, level: 0 }, { kind: 'boost', weapon: null, part: null, level: 0 },
        ];
        goods.forEach((g, i) => { const a = (i / goods.length) * Math.PI * 2; this.loot.push({ ...g, id: this.nextLoot++, x: d.x + Math.cos(a) * 1.7, z: d.z + Math.sin(a) * 1.7, taken: false }); });
      }
    }
  }
  private lastDead(): number { let best = -1, at = -1; for (const p of this.players) if (p.diedAt > at) { at = p.diedAt; best = p.id; } return best; }
  finish(winner: number): void { if (this.over) return; this.over = true; this.winner = winner; const w = this.players[winner]; if (w && w.alive) w.place = 1; this.events.push({ t: 'over', winner }); }

  private update(p: Player, dt: number): void {
    const inp = p.input, def = p.guns[p.cur] ? WEAPONS[p.guns[p.cur]!.id] : null;
    if (p.boost > 0) { p.boost = Math.max(0, p.boost - dt); if (!p.remote && p.hp < BOOST.cap) p.hp = Math.min(BOOST.cap, p.hp + BOOST.heal * dt); }
    p.cd = Math.max(0, p.cd - dt); p.kick = Math.max(0, p.kick - dt * 7); p.muzzle = Math.max(0, p.muzzle - dt); p.hurt = Math.max(0, p.hurt - dt); p.emptyT = Math.max(0, p.emptyT - dt);
    if (!p.remote) {
      p.yaw = inp.yaw; p.pitch = Math.max(-1.45, Math.min(1.45, inp.pitch)); p.ads = inp.ads && p.reload <= 0;
      const fx = Math.cos(p.yaw), fz = Math.sin(p.yaw), rx = -fz, rz = fx;
      let wx = fx * inp.mz + rx * inp.mx, wz = fz * inp.mz + rz * inp.mx; const wl = Math.hypot(wx, wz); if (wl > 1) { wx /= wl; wz /= wl; }
      p.crouch += ((inp.crouch && p.air === 0 ? 1 : 0) - p.crouch) * Math.min(1, dt * 12);
      const wet = waterDepth(this.map.terrain, p.x, p.z), run = inp.sprint && inp.mz > 0.2 && !p.ads && wet < 2 && p.crouch < 0.3, top = (run ? PLAYER.sprint : PLAYER.walk) * WATER_SLOW[wet] * (1 - (1 - PLAYER.crouchSpeed) * p.crouch) * (p.ads ? 0.6 : 1) * (p.bot ? BOTS[this.difficulty].speed : 1) * (p.boost > 0 ? BOOST.speed : 1);
      const k = Math.min(1, dt * (wl > 0.05 ? 15 : 22)); p.vx += (wx * top - p.vx) * k; p.vz += (wz * top - p.vz) * k;
      if (slideMove(this.map, p, p.vx * dt, p.vz * dt, PLAYER.radius)) { /* 벽에 닿은 쪽 속도는 죽입니다 */ if (blockedAt(this.map, p.x + Math.sign(p.vx) * 0.05, p.z, PLAYER.radius)) p.vx = 0; if (blockedAt(this.map, p.x, p.z + Math.sign(p.vz) * 0.05, PLAYER.radius)) p.vz = 0; }
      const lim = this.map.half - 1; p.x = Math.max(-lim, Math.min(lim, p.x)); p.z = Math.max(-lim, Math.min(lim, p.z));
      p.speed = Math.hypot(p.vx, p.vz); p.walk += p.speed * dt;
    }
    // 수류탄
    p.nadeCd -= dt; if (inp.nade && !p.nadeHeld && p.nades > 0 && p.nadeCd <= 0 && p.air === 0 && !p.remote) this.throwNade(p); p.nadeHeld = !!inp.nade;
    // 무기 교체
    if (inp.slot >= 0 && inp.slot < 2 && inp.slot !== p.cur && p.guns[inp.slot]) { p.cur = inp.slot; p.reload = 0; p.cd = Math.max(p.cd, 0.35); inp.slot = -1; }
    const gun = p.guns[p.cur]; if (gun && !gun.att) gun.att = {};
    if (gun && def) {
      if (p.reload > 0) { p.reload -= dt; if (p.reload <= 0) { p.reload = 0; const n = Math.min(magOf(def.id, gun.att) - gun.mag, gun.reserve); gun.mag += n; gun.reserve -= n; } }
      else if ((inp.reload && gun.mag < magOf(def.id, gun.att) && gun.reserve > 0) || (gun.mag === 0 && gun.reserve > 0 && inp.fire)) { p.reload = def.reload; this.events.push({ t: 'reload', id: p.id }); }
      if (inp.fire && p.cd <= 0 && p.reload <= 0 && (def.auto || !p.fireHeld)) {
        if (gun.mag > 0) this.shoot(p, gun, def.id); else if (p.emptyT <= 0) { p.emptyT = 0.5; this.events.push({ t: 'empty', id: p.id }); }
      }
    }
    p.fireHeld = inp.fire;
    // 줍기
    const wantE = inp.interact && !p.interactHeld; p.interactHeld = inp.interact;
    if (!p.remote) for (const l of this.loot) {
      if (l.taken) continue; const dx = l.x - p.x, dz = l.z - p.z; if (dx * dx + dz * dz > PLAYER.pickup * PLAYER.pickup) continue;
      if (l.kind === 'weapon') { if (wantE) { this.takeWeapon(p, l); break; } continue; }
      if (l.kind === 'attach') { if (this.takePart(p, l, wantE)) break; continue; }
      this.takeAuto(p, l);
    }
  }

  private throwNade(p: Player): void {
    p.nades--; p.nadeCd = NADE.cd; const cp = Math.cos(p.pitch), eye = eyeOf(p), fx = Math.cos(p.yaw) * cp, fz = Math.sin(p.yaw) * cp;
    const n: Nade = { id: this.nadeId++, owner: p.id, x: p.x + fx * 0.6, y: eye - 0.1, z: p.z + fz * 0.6, vx: fx * NADE.speed + p.vx * 0.5, vy: Math.sin(p.pitch) * NADE.speed + 4.5, vz: fz * NADE.speed + p.vz * 0.5, fuse: NADE.fuse };
    this.nades.push(n); this.sounds.push({ x: p.x, z: p.z, t: this.t, by: p.id, quiet: true }); this.events.push({ t: 'nade', stage: 'throw', id: p.id, x: n.x, y: n.y, z: n.z });
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
      for (const q of this.players) {
        if (!q.alive || q.air) continue; const d = Math.hypot(q.x - n.x, q.z - n.z, (1 - n.y) * 0.5); if (d > NADE.radius) continue;
        let dmg = NADE.dmg * (1 - d / NADE.radius) ** 1.2; if (!lineClear(this.map, n.x, Math.max(0.3, n.y), n.z, q.x, 1.0, q.z)) dmg *= 0.3; if (dmg < 3) continue;
        this.damage(q, dmg, n.owner, 'grenade', false, q.x, 1.2, q.z, false);
      }
    }
  }
  private take(p: Player, l: Loot): void { l.taken = true; this.events.push({ t: 'pickup', id: p.id, loot: l.id, kind: l.kind, weapon: l.weapon, part: l.part ?? null, level: l.level ?? 0 }); }
  /** 다른 쪽(원격)이 먼저 주운 전리품을 치웁니다. */
  removeLoot(id: number): void { const l = this.loot.find(x => x.id === id); if (l) l.taken = true; }
  private takeAuto(p: Player, l: Loot): void {
    if (l.kind === 'grenade') { if (p.nades >= NADE.max) return; p.nades = Math.min(NADE.max, p.nades + NADE.pick); this.take(p, l); }
    else if (l.kind === 'medkit') { if (p.hp >= PLAYER.hp) return; p.hp = Math.min(PLAYER.hp, p.hp + PLAYER.medkit); this.take(p, l); }
    else if (l.kind === 'armor') { if (p.armor >= 100) return; p.armor = Math.min(100, p.armor + PLAYER.armor); this.take(p, l); }
    else if (l.kind === 'helmet') { if (p.helmet >= (l.level ?? 1)) return; p.helmet = l.level ?? 1; this.take(p, l); }
    else if (l.kind === 'boost') { if (p.boost > BOOST.time * 0.6) return; p.boost = BOOST.time; this.take(p, l); }
    else if (l.kind === 'ammo') {
      let any = false; for (const g of p.guns) if (g && g.reserve < WEAPONS[g.id].mag * 6) { g.reserve = Math.min(WEAPONS[g.id].mag * 6, g.reserve + Math.ceil(WEAPONS[g.id].mag * 1.5)); any = true; }
      if (any) this.take(p, l);
    }
  }
  /** 파츠를 달 총: 들고 있는 총이 맞으면 그 총, 아니면 다른 칸의 총. 이미 같은 파츠면 null. */
  partTarget(p: Player, part: PartId): { gun: Gun; fit: 'new' | 'upgrade' | 'swap' } | null {
    const slot = PARTS[part].slot;
    for (const g of [p.guns[p.cur], p.guns[1 - p.cur]]) {
      if (!g || !PART_FITS[g.id].includes(slot)) continue;
      const fit = partFit(g.att, part); if (fit === 'same') continue; return { gun: g, fit };
    }
    return null;
  }
  private takePart(p: Player, l: Loot, wantE: boolean): boolean {
    const part = l.part!, t = this.partTarget(p, part); if (!t || (t.fit === 'swap' && !wantE)) return false;
    const slot = PARTS[part].slot, old = t.gun.att[slot];
    if (old) this.loot.push({ id: this.nextLoot++, kind: 'attach', weapon: null, part: old, level: 0, x: p.x + Math.cos(p.yaw) * 1.1, z: p.z + Math.sin(p.yaw) * 1.1, taken: false });
    t.gun.att[slot] = part; this.take(p, l); return true;
  }
  private takeWeapon(p: Player, l: Loot): void {
    const id = l.weapon!, def = WEAPONS[id], same = p.guns.find(g => g?.id === id);
    if (same) { same.reserve = Math.min(def.mag * 6, same.reserve + def.mag * 2); this.take(p, l); return; }
    const att: Attachments = { ...(l.att ?? {}) };
    const free = p.guns.indexOf(null), slot = free >= 0 ? free : p.cur, old = p.guns[slot];
    if (old) this.loot.push({ id: this.nextLoot++, kind: 'weapon', weapon: old.id, att: { ...old.att }, x: p.x + Math.cos(p.yaw) * 0.8, z: p.z + Math.sin(p.yaw) * 0.8, taken: false });
    p.guns[slot] = { id, mag: magOf(id, att), reserve: def.mag * 2, att }; p.cur = slot; p.reload = 0; p.cd = 0.35; this.take(p, l);
  }

  private shoot(p: Player, gun: Gun, id: WeaponId): void {
    const def = WEAPONS[id]; gun.mag--; p.cd = def.cd; p.kick = Math.min(1, p.kick + def.recoil * 12); p.muzzle = 0.06;
    const h = partHandling(gun.att), sight = gun.att.sight, quiet = gun.att.muzzle === 'suppressor';
    p.kick = Math.max(0, p.kick - def.recoil * 12 * (1 - h.kick));
    const moving = Math.min(1.6, p.speed / PLAYER.walk), spread = def.spread * h.spread * (p.ads ? (sight ? 0.34 : 0.4) : 1) * (1 + moving * 0.5) * (1 + p.kick * 0.5) * (1 - 0.22 * p.crouch);
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
    let hitT = Math.min(wallT, def.range), target: Player | null = null, head = false;
    for (const q of this.players) {
      if (!q.alive || q.id === shooter || q.air) continue;
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
    } else if (hitT < def.range) this.events.push({ t: 'hit', victim: -1, attacker: shooter, dmg: 0, head: false, x: ex, y: ey, z: ez, wall: true });
  }

  /** 네트워크로 받은 상대의 사격: 내 쪽 선수에게만 피해를 줍니다. */
  remoteShot(shooter: number, id: WeaponId, ox: number, oy: number, oz: number, aims: Array<[number, number]>): void {
    const ends: number[] = []; for (const [yaw, pitch] of aims) this.bullet(shooter, id, ox, oy, oz, yaw, pitch, ends, true);
    this.events.push({ t: 'shot', id: shooter, weapon: id, ox, oy, oz, ends, remote: true });
  }

  damage(q: Player, dmg: number, by: number, weapon: WeaponId | 'zone' | 'grenade', head: boolean, x: number, y: number, z: number, silent: boolean): void {
    if (!q.alive) return;
    const real = !q.remote; if (real && head && q.helmet > 0) dmg *= 1 - HELMET_CUT[q.helmet]; let hp = dmg;
    if (real && weapon !== 'zone' && q.armor > 0) { const soak = Math.min(q.armor, dmg * 0.5); q.armor -= soak; hp = dmg - soak; }
    if (real) { q.hp -= hp; q.lastHitBy = by; if (!silent) { q.hurt = 0.5; const a = this.players[by]; if (a) q.hurtYaw = Math.atan2(a.z - q.z, a.x - q.x); } }
    if (!silent) this.events.push({ t: 'hit', victim: q.id, attacker: by, dmg: Math.round(dmg), head, x, y, z, wall: false });
    if (real && q.hp <= 0) this.kill(q, weapon === 'zone' ? -1 : by, weapon);
  }
  /** 선수를 쓰러뜨립니다(원격 선수는 네트워크 소식으로 호출). */
  kill(q: Player, by: number, weapon: WeaponId | 'zone' | 'grenade'): void {
    if (!q.alive) return; q.alive = false; q.hp = 0; q.diedAt = this.t; q.place = this.aliveCount() + 1;
    const killer = this.players[by]; if (killer && killer.id !== q.id) killer.kills++;
    for (const g of q.guns) if (g) this.loot.push({ id: this.nextLoot++, kind: 'weapon', weapon: g.id, att: { ...g.att }, x: q.x + (this.rng() - 0.5) * 1.6, z: q.z + (this.rng() - 0.5) * 1.6, taken: false });
    if (q.helmet > 0) this.loot.push({ id: this.nextLoot++, kind: 'helmet', weapon: null, part: null, level: q.helmet, x: q.x + (this.rng() - 0.5) * 1.6, z: q.z + (this.rng() - 0.5) * 1.6, taken: false });
    this.events.push({ t: 'kill', victim: q.id, attacker: by, weapon });
  }
}

export { DIFFICULTIES };
export type { Difficulty };
