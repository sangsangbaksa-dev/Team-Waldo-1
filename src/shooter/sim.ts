// ZERO ZONE — 경기 시뮬레이션: 수송기 낙하·이동(언덕·계단·점프·앉기·물)·사격·피해·전리품·줄어드는 자기장·승패.
// 화면과 무관해서 테스트와 봇 대 봇 시뮬레이션에서 그대로 돌립니다.
import { BOTS, BOT_NAMES, BR_FILL, DIFFICULTIES, FLIGHT, MAP_HALF, PLAYER, SKIN_TONES, TEAM_COLORS, WEAPONS, ZONES, ZONE_DELAY, makeRng, type Difficulty, type Mode, type WeaponId } from './config';
import { STEP_UP, ceilingAt, generateMap, groundAt, pushOut, rayWorld, supportAt, type GameMap, type Loot } from './world';
import { thinkBot, newBrain, type BotBrain } from './bot';

export interface Input { mx: number; mz: number; yaw: number; pitch: number; fire: boolean; sprint: boolean; reload: boolean; interact: boolean; ads: boolean; slot: number; jump: boolean; crouch: boolean }
export const blankInput = (): Input => ({ mx: 0, mz: 0, yaw: 0, pitch: 0, fire: false, sprint: false, reload: false, interact: false, ads: false, slot: -1, jump: false, crouch: false });
export interface Gun { id: WeaponId; mag: number; reserve: number }
/** 0 땅 위 · 1 수송기 안 · 2 자유 낙하 · 3 낙하산 */
export type Air = 0 | 1 | 2 | 3;
export interface Player {
  id: number; name: string; bot: boolean; remote: boolean; color: number; skin: number;
  x: number; z: number; y: number; vy: number; grounded: boolean; crouch: boolean; air: Air;
  yaw: number; pitch: number; vx: number; vz: number; hp: number; armor: number; helmet: boolean; alive: boolean;
  guns: (Gun | null)[]; cur: number; reload: number; cd: number; fireHeld: boolean; interactHeld: boolean; jumpHeld: boolean;
  kills: number; place: number; diedAt: number; input: Input; brain: BotBrain | null;
  walk: number; kick: number; muzzle: number; hurt: number; hurtYaw: number; ads: boolean; speed: number; lastHitBy: number; emptyT: number; wet: number;
}
export type MatchEvent =
  | { t: 'shot'; id: number; weapon: WeaponId; ox: number; oy: number; oz: number; ends: number[]; remote: boolean }
  | { t: 'hit'; victim: number; attacker: number; dmg: number; head: boolean; x: number; y: number; z: number; wall: boolean }
  | { t: 'kill'; victim: number; attacker: number; weapon: WeaponId | 'zone' }
  | { t: 'pickup'; id: number; loot: number; kind: Loot['kind']; weapon: WeaponId | null }
  | { t: 'reload'; id: number } | { t: 'empty'; id: number } | { t: 'over'; winner: number }
  | { t: 'jump'; id: number } | { t: 'chute'; id: number } | { t: 'land'; id: number };

export interface ZoneState { cx: number; cz: number; r: number; nextCx: number; nextCz: number; nextR: number; shrinking: boolean; phase: number; timeLeft: number; dps: number }
/** 수송기 항로: (ax,az) 에서 (bx,bz) 까지 곧게 날아갑니다. */
export interface Flight { ax: number; az: number; bx: number; bz: number; dx: number; dz: number; len: number }

export interface MatchOptions {
  seed: number; mode: Mode; difficulty: Difficulty; /** 사람(또는 원격) 선수 이름들. 나머지는 봇이 채웁니다. */ humans: Array<{ name: string; remote?: boolean }>; fill?: number;
  /** 배틀로열을 수송기에서 시작할지(기본: 배틀로열이면 예). 끄면 지상 출발 자리에서 시작합니다. */ drop?: boolean;
}

const height = (p: Player): number => (p.crouch ? PLAYER.crouchHeight : PLAYER.height);
export const eyeOf = (p: Player): number => p.y + (p.crouch ? PLAYER.crouchEye : PLAYER.eye);

export class Match {
  map: GameMap; mode: Mode; difficulty: Difficulty; seed: number;
  players: Player[] = []; loot: Loot[]; t = 0; over = false; winner = -1; events: MatchEvent[] = [];
  /** 최근 총소리(봇이 듣습니다) */ sounds: Array<{ x: number; z: number; t: number; by: number }> = [];
  rng: () => number; flight: Flight | null = null; readonly zoneStart: number;
  private centers: Array<{ x: number; z: number; r: number }>; private starts: number[]; private nextLoot: number; private frame = 0; private lootById = new Map<number, Loot>();

  constructor(o: MatchOptions) {
    this.seed = o.seed; this.mode = o.mode; this.difficulty = o.difficulty;
    this.map = generateMap(o.seed, o.mode); this.loot = this.map.loot.map(l => ({ ...l })); this.nextLoot = this.loot.length + 1000;
    for (const l of this.loot) this.lootById.set(l.id, l);
    this.rng = makeRng(o.seed ^ 0x9e3779b9);
    const drop = o.drop ?? o.mode === 'br', half = MAP_HALF[o.mode];
    this.zoneStart = drop ? ZONE_DELAY : 0;
    // 자기장 중심은 시드로 정해 두 브라우저가 같은 원을 봅니다.
    const zr = makeRng(o.seed ^ 0x2545f491), phases = ZONES[o.mode];
    this.centers = []; this.starts = []; let prev = { x: 0, z: 0, r: half * 1.35 }, at = this.zoneStart;
    for (const ph of phases) {
      let c = { x: prev.x, z: prev.z, r: ph.radius };
      for (let i = 0; i < 16; i++) {
        const a = zr() * Math.PI * 2, d = Math.sqrt(zr()) * Math.max(0, prev.r - ph.radius) * 0.85;
        c = { x: prev.x + Math.cos(a) * d, z: prev.z + Math.sin(a) * d, r: ph.radius };
        // 마지막 원들은 가급적 물이 아닌 땅 위에 잡습니다.
        if (Math.hypot(c.x, c.z) + ph.radius * 0.5 <= half && (ph.radius > 60 || groundAt(this.map.terrain, c.x, c.z) > this.map.terrain.water + 0.5 || i > 12)) break;
      }
      this.starts.push(at); at += ph.wait + ph.shrink; this.centers.push(c); prev = c;
    }
    if (drop) {
      // 항로: 지도 가운데 근처를 지나는 무작위 직선. 지도 바깥에서 들어와 반대편 바깥으로 나갑니다.
      const fr = makeRng(o.seed ^ 0x6c8e9cf5), a = fr() * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a), off = (fr() - 0.5) * half * 0.7, L = half * 1.22;
      const cx = -dz * off, cz = dx * off; this.flight = { ax: cx - dx * L, az: cz - dz * L, bx: cx + dx * L, bz: cz + dz * L, dx, dz, len: L * 2 };
    }
    const total = o.fill ?? (o.mode === 'br' ? BR_FILL : o.humans.length), names = [...BOT_NAMES].sort(() => this.rng() - 0.5);
    for (let i = 0; i < total; i++) {
      const h = o.humans[i], sp = this.map.spawns[i % this.map.spawns.length], f = this.flight;
      const x = f ? f.ax : sp.x, z = f ? f.az : sp.z, y = f ? FLIGHT.alt : supportAt(this.map, sp.x, sp.z, groundAt(this.map.terrain, sp.x, sp.z) + STEP_UP);
      const p: Player = {
        id: i, name: h?.name ?? names[(i - o.humans.length) % names.length], bot: !h, remote: !!h?.remote, color: TEAM_COLORS[i % TEAM_COLORS.length], skin: SKIN_TONES[i % SKIN_TONES.length],
        x, z, y, vy: 0, grounded: !f, crouch: false, air: f ? 1 : 0,
        yaw: f ? Math.atan2(f.dz, f.dx) : Math.atan2(-sp.z, -sp.x), pitch: 0, vx: 0, vz: 0, hp: PLAYER.hp, armor: 0, helmet: false, alive: true,
        guns: [{ id: 'pistol', mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.mag * 2 }, null], cur: 0, reload: 0, cd: 0.4, fireHeld: false, interactHeld: false, jumpHeld: false,
        kills: 0, place: 0, diedAt: 0, input: blankInput(), brain: null, walk: 0, kick: 0, muzzle: 0, hurt: 0, hurtYaw: 0, ads: false, speed: 0, lastHitBy: -1, emptyT: 0, wet: 0,
      };
      if (p.bot) p.brain = newBrain(this.rng, BOTS[o.difficulty]);
      p.input.yaw = p.yaw; this.players.push(p);
    }
  }

  /** 시각 t 의 수송기 위치(항로를 벗어났으면 null). */
  planeAt(t: number): { x: number; z: number; k: number } | null {
    const f = this.flight; if (!f) return null; const s = t * FLIGHT.speed; if (s > f.len) return null;
    return { x: f.ax + f.dx * s, z: f.az + f.dz * s, k: s / f.len };
  }
  /** 아직 수송기에 탄 선수가 있는지 */
  get boarding(): boolean { return this.players.some(p => p.alive && p.air === 1); }

  /** 시각 t 의 자기장. */
  zoneAt(t: number): ZoneState {
    const half = this.map.half, phases = ZONES[this.mode];
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
  lootOf(id: number): Loot | undefined { return this.lootById.get(id); }

  step(dt: number): void {
    if (this.over) return;
    this.t += dt; this.frame++;
    const zone = this.zone;
    if (this.frame % 30 === 0) this.sounds = this.sounds.filter(s => this.t - s.t < 2.5);
    for (const p of this.players) {
      if (!p.alive) continue;
      if (p.bot && p.brain) thinkBot(this, p, dt, zone);
      this.update(p, dt);
      if (!p.remote && p.air === 0 && Math.hypot(p.x - zone.cx, p.z - zone.cz) > zone.r) this.damage(p, zone.dps * dt, -1, 'zone', false, p.x, p.y + 1, p.z, true);
    }
    // 마지막 한 명이 남으면 끝납니다(동시에 모두 쓰러졌다면 마지막에 쓰러진 쪽이 승자).
    if (!this.over) {
      let alive = 0, last: Player | null = null; for (const p of this.players) if (p.alive) { alive++; last = p; }
      if (alive <= 1 && this.players.length > 1) this.finish(last?.id ?? this.lastDead());
    }
  }
  private lastDead(): number { let best = -1, at = -1; for (const p of this.players) if (p.diedAt > at) { at = p.diedAt; best = p.id; } return best; }
  finish(winner: number): void { if (this.over) return; this.over = true; this.winner = winner; const w = this.players[winner]; if (w && w.alive) w.place = 1; this.events.push({ t: 'over', winner }); }

  // ---------- 하늘 ----------
  private updateAir(p: Player, dt: number): void {
    const inp = p.input; p.yaw = inp.yaw; p.pitch = Math.max(-1.45, Math.min(1.45, inp.pitch));
    const jump = inp.jump && !p.jumpHeld; p.jumpHeld = inp.jump;
    if (p.air === 1) {
      const pl = this.planeAt(this.t);
      if (pl) { p.x = pl.x; p.z = pl.z; p.y = FLIGHT.alt; }
      // 항로 끝에 닿았거나, 뛰어내리기를 눌렀고 지도 안이면 뛰어내립니다.
      const inside = Math.abs(p.x) < this.map.half - 4 && Math.abs(p.z) < this.map.half - 4;
      if (!pl || (jump && inside)) {
        const f = this.flight!; p.air = 2; p.y = FLIGHT.alt - 3; p.vy = -10; p.vx = f.dx * FLIGHT.speed * 0.35; p.vz = f.dz * FLIGHT.speed * 0.35;
        if (!pl) { p.x = Math.max(-this.map.half + 20, Math.min(this.map.half - 20, p.x)); p.z = Math.max(-this.map.half + 20, Math.min(this.map.half - 20, p.z)); }
        this.events.push({ t: 'jump', id: p.id });
      }
      p.speed = 0; return;
    }
    const fx = Math.cos(p.yaw), fz = Math.sin(p.yaw), rx = -fz, rz = fx, chute = p.air === 3;
    const glide = chute ? FLIGHT.chuteGlide : FLIGHT.glide, fwd = Math.max(-0.4, inp.mz);
    const wx = (fx * fwd + rx * inp.mx * 0.6) * glide, wz = (fz * fwd + rz * inp.mx * 0.6) * glide, k = Math.min(1, dt * (chute ? 1.6 : 1.1));
    p.vx += (wx - p.vx) * k; p.vz += (wz - p.vz) * k;
    const want = chute ? -FLIGHT.chuteFall * (inp.mz < -0.2 ? 0.8 : 1) : -(inp.mz > 0.5 && p.pitch < -0.6 ? FLIGHT.dive : FLIGHT.fall);
    p.vy += (want - p.vy) * Math.min(1, dt * (chute ? 2.4 : 1.4));
    p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt;
    const lim = this.map.half - 1; p.x = Math.max(-lim, Math.min(lim, p.x)); p.z = Math.max(-lim, Math.min(lim, p.z));
    const ground = supportAt(this.map, p.x, p.z, p.y + 0.01, 0.15);
    if (!chute && p.y - ground < FLIGHT.chuteAt) { p.air = 3; p.vy = Math.max(p.vy, -18); this.events.push({ t: 'chute', id: p.id }); }
    if (p.y <= ground + 0.01) { p.y = ground; p.vy = 0; p.air = 0; p.grounded = true; p.vx *= 0.3; p.vz *= 0.3; pushOut(this.map, p, PLAYER.radius, p.y, height(p)); this.events.push({ t: 'land', id: p.id }); }
    p.speed = Math.hypot(p.vx, p.vz);
  }

  // ---------- 땅 ----------
  private update(p: Player, dt: number): void {
    const inp = p.input, def = p.guns[p.cur] ? WEAPONS[p.guns[p.cur]!.id] : null;
    p.cd = Math.max(0, p.cd - dt); p.kick = Math.max(0, p.kick - dt * 7); p.muzzle = Math.max(0, p.muzzle - dt); p.hurt = Math.max(0, p.hurt - dt); p.emptyT = Math.max(0, p.emptyT - dt);
    if (p.air !== 0) { if (!p.remote) this.updateAir(p, dt); p.fireHeld = inp.fire; return; }
    if (!p.remote) {
      p.yaw = inp.yaw; p.pitch = Math.max(-1.45, Math.min(1.45, inp.pitch)); p.ads = inp.ads && p.reload <= 0;
      // 앉기: 일어설 자리가 막혀 있으면 앉은 채로 둡니다.
      if (inp.crouch !== p.crouch) { if (inp.crouch) p.crouch = true; else if (ceilingAt(this.map, p.x, p.z, p.y + 0.3) >= p.y + PLAYER.height) p.crouch = false; }
      const fx = Math.cos(p.yaw), fz = Math.sin(p.yaw), rx = -fz, rz = fx;
      let wx = fx * inp.mz + rx * inp.mx, wz = fz * inp.mz + rz * inp.mx; const wl = Math.hypot(wx, wz); if (wl > 1) { wx /= wl; wz /= wl; }
      p.wet = p.grounded ? Math.max(0, this.map.terrain.water - p.y) : 0;
      const wade = p.wet > 0.5, run = inp.sprint && inp.mz > 0.2 && !p.ads && !p.crouch && !wade;
      const top = (run ? PLAYER.sprint : PLAYER.walk) * (p.ads ? 0.6 : 1) * (p.crouch ? PLAYER.crouchSpeed : 1) * (wade ? PLAYER.wade : 1) * (p.bot ? BOTS[this.difficulty].speed : 1);
      const k = Math.min(1, dt * (p.grounded ? 11 : 2.5)); p.vx += (wx * top - p.vx) * k; p.vz += (wz * top - p.vz) * k;
      p.x += p.vx * dt; p.z += p.vz * dt; pushOut(this.map, p, PLAYER.radius, p.y, height(p));
      const lim = this.map.half - 1; p.x = Math.max(-lim, Math.min(lim, p.x)); p.z = Math.max(-lim, Math.min(lim, p.z));
      // 높이: 턱·계단은 올라서고, 조금 낮아지면 따라 내려가고, 크게 낮아지면 떨어집니다.
      const sup = supportAt(this.map, p.x, p.z, p.y + STEP_UP);
      const jump = inp.jump && !p.jumpHeld; p.jumpHeld = inp.jump;
      if (p.grounded) {
        if (sup >= p.y - 0.65) { p.y = sup; p.vy = 0; } else p.grounded = false;
        if (jump && p.grounded && !p.crouch && !wade) { p.vy = PLAYER.jump; p.grounded = false; }
      }
      if (!p.grounded) {
        p.vy -= PLAYER.gravity * dt; const ny = p.y + p.vy * dt;
        if (p.vy > 0) { const ceil = ceilingAt(this.map, p.x, p.z, p.y + height(p) - 0.05); if (ny + height(p) > ceil) { p.vy = 0; } else p.y = ny; } else p.y = ny;
        const land = supportAt(this.map, p.x, p.z, Math.max(p.y, sup) + 0.05);
        if (p.y <= land) { p.y = land; p.vy = 0; p.grounded = true; }
      }
      p.speed = Math.hypot(p.vx, p.vz); p.walk += p.speed * dt;
    }
    // 무기 교체
    if (inp.slot >= 0 && inp.slot < 2 && inp.slot !== p.cur && p.guns[inp.slot]) { p.cur = inp.slot; p.reload = 0; p.cd = Math.max(p.cd, 0.35); inp.slot = -1; }
    const gun = p.guns[p.cur];
    if (gun && def) {
      if (p.reload > 0) { p.reload -= dt; if (p.reload <= 0) { p.reload = 0; const n = Math.min(def.mag - gun.mag, gun.reserve); gun.mag += n; gun.reserve -= n; } }
      else if ((inp.reload && gun.mag < def.mag && gun.reserve > 0) || (gun.mag === 0 && gun.reserve > 0 && inp.fire)) { p.reload = def.reload; this.events.push({ t: 'reload', id: p.id }); }
      if (inp.fire && p.cd <= 0 && p.reload <= 0 && (def.auto || !p.fireHeld)) {
        if (gun.mag > 0) this.shoot(p, gun, def.id); else if (p.emptyT <= 0) { p.emptyT = 0.5; this.events.push({ t: 'empty', id: p.id }); }
      }
    }
    p.fireHeld = inp.fire;
    // 줍기: 무기는 줍기 키로, 나머지는 닿으면 자동으로(자동 줍기 검사는 세 걸음마다 한 번).
    const wantE = inp.interact && !p.interactHeld; p.interactHeld = inp.interact;
    if (!p.remote && (wantE || (this.frame + p.id) % 3 === 0)) for (const l of this.loot) {
      if (l.taken) continue; const dx = l.x - p.x, dz = l.z - p.z; if (dx * dx + dz * dz > PLAYER.pickup * PLAYER.pickup || Math.abs(l.y - p.y) > 1.3) continue;
      if (l.kind === 'weapon') { if (wantE) { this.takeWeapon(p, l); break; } continue; }
      this.takeAuto(p, l);
    }
  }

  private take(p: Player, l: Loot): void { l.taken = true; this.events.push({ t: 'pickup', id: p.id, loot: l.id, kind: l.kind, weapon: l.weapon }); }
  private drop(l: Omit<Loot, 'id'>): void { const it = { ...l, id: this.nextLoot++ }; this.loot.push(it); this.lootById.set(it.id, it); }
  /** 다른 쪽(원격)이 먼저 주운 전리품을 치웁니다. */
  removeLoot(id: number): void { const l = this.lootById.get(id); if (l) l.taken = true; }
  private takeAuto(p: Player, l: Loot): void {
    if (l.kind === 'medkit') { if (p.hp >= PLAYER.hp) return; p.hp = Math.min(PLAYER.hp, p.hp + PLAYER.medkit); this.take(p, l); }
    else if (l.kind === 'armor') { if (p.armor >= 100) return; p.armor = Math.min(100, p.armor + PLAYER.armor); this.take(p, l); }
    else if (l.kind === 'helmet') { if (p.helmet) return; p.helmet = true; this.take(p, l); }
    else if (l.kind === 'ammo') {
      let any = false; for (const g of p.guns) if (g && g.reserve < WEAPONS[g.id].mag * 6) { g.reserve = Math.min(WEAPONS[g.id].mag * 6, g.reserve + Math.ceil(WEAPONS[g.id].mag * 1.5)); any = true; }
      if (any) this.take(p, l);
    }
  }
  private takeWeapon(p: Player, l: Loot): void {
    const id = l.weapon!, def = WEAPONS[id], same = p.guns.find(g => g?.id === id);
    if (same) { same.reserve = Math.min(def.mag * 6, same.reserve + def.mag * 2); this.take(p, l); return; }
    const free = p.guns.indexOf(null), slot = free >= 0 ? free : p.cur, old = p.guns[slot];
    if (old) this.drop({ kind: 'weapon', weapon: old.id, x: p.x + Math.cos(p.yaw) * 0.8, z: p.z + Math.sin(p.yaw) * 0.8, y: p.y, taken: false, b: l.b });
    p.guns[slot] = { id, mag: def.mag, reserve: def.mag * 2 }; p.cur = slot; p.reload = 0; p.cd = 0.35; this.take(p, l);
  }

  private shoot(p: Player, gun: Gun, id: WeaponId): void {
    const def = WEAPONS[id]; gun.mag--; p.cd = def.cd; p.kick = Math.min(1, p.kick + def.recoil * 12 * (p.crouch ? 0.7 : 1)); p.muzzle = 0.06;
    const moving = Math.min(1.6, p.speed / PLAYER.walk), spread = def.spread * (p.ads ? 0.4 : 1) * (1 + moving * 0.5) * (1 + p.kick * 0.5) * (p.crouch ? 0.75 : 1) * (p.grounded ? 1 : 2.2);
    const ox = p.x, oy = eyeOf(p), oz = p.z, ends: number[] = [];
    for (let i = 0; i < def.pellets; i++) {
      const a = this.rng() * Math.PI * 2, r = spread * Math.sqrt(this.rng()), yaw = p.yaw + Math.cos(a) * r, pitch = p.pitch + Math.sin(a) * r;
      this.bullet(p.id, id, ox, oy, oz, yaw, pitch, ends, false);
    }
    this.events.push({ t: 'shot', id: p.id, weapon: id, ox, oy, oz, ends, remote: false });
    this.sounds.push({ x: p.x, z: p.z, t: this.t, by: p.id });
  }

  /** 총알 한 발을 날립니다. 맞은 대상에게 피해를 주고 끝점을 ends 에 넣습니다. fromRemote: 원격 선수가 쏜 탄(판정 반경을 조금 넓힙니다). */
  bullet(shooter: number, id: WeaponId, ox: number, oy: number, oz: number, yaw: number, pitch: number, ends: number[], fromRemote: boolean): void {
    const def = WEAPONS[id], cp = Math.cos(pitch), dx = Math.cos(yaw) * cp, dy = Math.sin(pitch), dz = Math.sin(yaw) * cp;
    const wallT = rayWorld(this.map, ox, oy, oz, dx, dy, dz, def.range);
    let hitT = Math.min(wallT, def.range), target: Player | null = null, head = false;
    const a = dx * dx + dz * dz;
    for (const q of this.players) {
      if (!q.alive || q.id === shooter || q.air === 1) continue;
      const px = ox - q.x, pz = oz - q.z; if (a < 1e-9) continue;
      const R = fromRemote ? 0.62 : 0.5, b = 2 * (px * dx + pz * dz), c = px * px + pz * pz - R * R, disc = b * b - 4 * a * c; if (disc < 0) continue;
      let t = (-b - Math.sqrt(disc)) / (2 * a); if (t < 0) { if (c < 0) t = 0; else continue; }
      if (t >= hitT) continue; const y = oy + dy * t - q.y, hq = height(q); if (y < 0 || y > hq + 0.1) continue;
      hitT = t; target = q; head = y > (q.crouch ? PLAYER.crouchHead : PLAYER.head);
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

  damage(q: Player, dmg: number, by: number, weapon: WeaponId | 'zone', head: boolean, x: number, y: number, z: number, silent: boolean): void {
    if (!q.alive) return;
    const real = !q.remote; let hp = dmg;
    if (real && head && q.helmet && weapon !== 'zone') hp *= 1 - PLAYER.helmet;
    if (real && weapon !== 'zone' && q.armor > 0 && !head) { const soak = Math.min(q.armor, hp * 0.5); q.armor -= soak; hp -= soak; }
    if (real) { q.hp -= hp; q.lastHitBy = by; if (!silent) { q.hurt = 0.5; const a = this.players[by]; if (a) q.hurtYaw = Math.atan2(a.z - q.z, a.x - q.x); } }
    if (!silent) this.events.push({ t: 'hit', victim: q.id, attacker: by, dmg: Math.round(dmg), head, x, y, z, wall: false });
    if (real && q.hp <= 0) this.kill(q, weapon === 'zone' ? -1 : by, weapon);
  }
  /** 선수를 쓰러뜨립니다(원격 선수는 네트워크 소식으로 호출). */
  kill(q: Player, by: number, weapon: WeaponId | 'zone'): void {
    if (!q.alive) return; q.alive = false; q.hp = 0; q.diedAt = this.t; q.place = this.aliveCount() + 1;
    const killer = this.players[by]; if (killer && killer.id !== q.id) killer.kills++;
    if (q.air === 0) for (const g of q.guns) if (g) this.drop({ kind: 'weapon', weapon: g.id, x: q.x + (this.rng() - 0.5) * 1.6, z: q.z + (this.rng() - 0.5) * 1.6, y: q.y, taken: false, b: -1 });
    this.events.push({ t: 'kill', victim: q.id, attacker: by, weapon });
  }
}

export { DIFFICULTIES };
export type { Difficulty };
