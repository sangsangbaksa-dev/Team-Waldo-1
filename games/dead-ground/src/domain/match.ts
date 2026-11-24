import {
  advanceBullet, aimSway, eye, hitPlayer, MAX_PLAYERS, movePlayer, neutralInput, PLAYER_HEIGHT,
  PROTECTION_SECONDS, ranked, RESPAWN_SECONDS, RIFLE, ROUND_SECONDS, SCORE_LIMIT, TICK,
  type Bullet, type Input, type Player,
} from './combat.js';
import { clamp, direction, horizontalDistance, lerp, vec, type Vec3 } from './math.js';
import type { World } from './world.js';

export type Phase = 'lobby' | 'active' | 'finished';
type EventData =
  | { type: 'shot'; player: string; position: Vec3 }
  | { type: 'reload' | 'bolt' | 'spawn'; player: string }
  | { type: 'impact'; player: string; position: Vec3 }
  | { type: 'hit'; player: string; target: string; headshot: boolean; lethal: boolean; position: Vec3 }
  | { type: 'kill'; player: string; attacker: string; victim: string; headshot: boolean; distance?: number; bonus?: number };

export type MatchEvent = EventData & { serial: number; time: number };
export interface Snapshot {
  phase: Phase; time: number; remaining: number; round: number;
  players: Player[]; bullets: Bullet[]; events: MatchEvent[];
}
interface Commands { input: Input; fired: number; reloaded: number }

export class Match {
  readonly players = new Map<string, Player>();
  readonly bullets = new Map<number, Bullet>();
  private readonly commands = new Map<string, Commands>();
  private events: MatchEvent[] = [];
  private serial = 0;
  private projectileId = 0;
  private spawnCursor = 0;
  phase: Phase = 'lobby';
  time = 0;
  remaining = ROUND_SECONDS;
  round = 0;

  constructor(readonly world: World) {}

  addPlayer(id: string, name: string, bot = false): Player | undefined {
    if (this.players.size >= MAX_PLAYERS || this.players.has(id)) return;
    const player: Player = {
      id, name, bot, position: vec(), yaw: 0, pitch: 0, height: PLAYER_HEIGHT,
      crouched: false, aiming: false, sprinting: false, moving: false,
      health: 100, alive: false, protectedUntil: 0, respawnAt: 0,
      breath: 1, breathExhausted: false, steady: false,
      ammo: RIFLE.magazine, reserve: RIFLE.reserve, boltUntil: 0, reloadUntil: 0,
      kills: 0, deaths: 0, headshots: 0, generation: 0,
    };
    this.players.set(id, player);
    this.commands.set(id, { input: neutralInput(), fired: 0, reloaded: 0 });
    if (this.phase === 'active') this.spawn(player);
    return player;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    this.commands.delete(id);
    for (const [key, bullet] of this.bullets) {
      if (bullet.owner === id) this.bullets.delete(key);
    }
  }

  start(): boolean {
    if (this.phase === 'active' || this.players.size < 2) return false;
    this.phase = 'active';
    this.round++;
    this.remaining = ROUND_SECONDS;
    this.bullets.clear();
    this.events = [];
    this.spawnCursor = (this.round - 1) % this.world.spawns.length;
    for (const player of this.players.values()) {
      Object.assign(player, { kills: 0, deaths: 0, headshots: 0, alive: false });
    }
    for (const player of this.players.values()) this.spawn(player, true);
    return true;
  }

  resetLobby(): void {
    this.phase = 'lobby';
    this.remaining = ROUND_SECONDS;
    this.bullets.clear();
    this.events = [];
    for (const player of this.players.values()) player.alive = false;
  }

  setInput(id: string, input: Input): void {
    const command = this.commands.get(id);
    if (command) command.input = input;
  }

  stopInput(id: string): void {
    const command = this.commands.get(id);
    const player = this.players.get(id);
    if (!command || !player) return;
    command.input = { ...neutralInput(player.yaw, player.pitch), fire: command.fired, reload: command.reloaded };
  }

  step(dt = TICK): boolean {
    this.time += dt;
    if (this.phase !== 'active') return false;
    this.remaining = Math.max(0, this.remaining - dt);
    for (const player of this.players.values()) this.updatePlayer(player, dt);
    for (const bullet of this.bullets.values()) this.updateBullet(bullet, dt);
    if (this.remaining <= 1e-6 || [...this.players.values()].some(player => player.kills >= SCORE_LIMIT)) {
      this.phase = 'finished';
      this.bullets.clear();
      return true;
    }
    return false;
  }

  snapshot(): Snapshot {
    return {
      phase: this.phase, time: this.time, remaining: this.remaining, round: this.round,
      players: ranked([...this.players.values()]).map(player => ({ ...player, position: { ...player.position } })),
      bullets: [...this.bullets.values()].map(bullet => ({
        ...bullet, position: { ...bullet.position }, velocity: { ...bullet.velocity }, origin: bullet.origin && { ...bullet.origin },
      })),
      events: this.events.filter(event => this.time - event.time < 7),
    };
  }

  private emit(event: EventData): void {
    this.events = [...this.events.slice(-63), { ...event, serial: ++this.serial, time: this.time }];
  }

  private spawn(player: Player, initial = false): void {
    const spawns = this.world.spawns;
    const occupied = [...this.players.values()].filter(other => other.alive && other.id !== player.id);
    const first = this.spawnCursor++ % spawns.length;
    let spawn = spawns[first];
    if (!initial && occupied.length) {
      let best = -Infinity;
      for (let i = 0; i < spawns.length; i++) {
        const candidate = spawns[(first + i) % spawns.length];
        const nearest = occupied.reduce((a, b) =>
          horizontalDistance(candidate, a.position) < horizontalDistance(candidate, b.position) ? a : b);
        const distance = horizontalDistance(candidate, nearest.position);
        const from = vec(candidate.x, candidate.y + 1.65, candidate.z);
        const hidden = this.world.trace(from, eye(nearest)) < 1;
        const score = Math.min(distance, 165) - Math.max(0, distance - 225) * 0.35 + (hidden ? 30 : 0) - i * 0.3;
        if (score > best) {
          best = score;
          spawn = candidate;
        }
      }
    }
    const yaw = Math.atan2(spawn.x, spawn.z + 34);
    Object.assign(player, {
      position: { ...spawn }, yaw, pitch: 0, height: PLAYER_HEIGHT, crouched: false,
      moving: false, aiming: false, sprinting: false, health: 100, alive: true,
      protectedUntil: this.time + PROTECTION_SECONDS, respawnAt: 0,
      ammo: RIFLE.magazine, reserve: RIFLE.reserve, boltUntil: 0, reloadUntil: 0,
      breath: 1, steady: false, breathExhausted: false, generation: player.generation + 1,
    });
    const command = this.commands.get(player.id);
    if (command) {
      command.fired = command.input.fire;
      command.reloaded = command.input.reload;
      command.input = { ...neutralInput(yaw), fire: command.fired, reload: command.reloaded };
    }
    this.emit({ type: 'spawn', player: player.id });
  }

  private updatePlayer(player: Player, dt: number): void {
    if (!player.alive) {
      if (this.time >= player.respawnAt) this.spawn(player);
      return;
    }
    const command = this.commands.get(player.id);
    if (!command) return;
    const { input } = command;
    const firing = input.fire > command.fired;
    const reloading = input.reload > command.reloaded;
    command.fired = Math.max(command.fired, input.fire);
    command.reloaded = Math.max(command.reloaded, input.reload);
    const safeInput = { ...input, pitch: clamp(input.pitch, -1.48, 1.48) };
    Object.assign(player, movePlayer(this.world, player, safeInput, dt));
    player.yaw = safeInput.yaw;
    player.pitch = safeInput.pitch;
    player.aiming = input.aim;
    this.updateBreath(player, input, dt);

    if (player.reloadUntil && player.reloadUntil <= this.time) {
      const rounds = Math.min(RIFLE.magazine - player.ammo, player.reserve);
      player.ammo += rounds;
      player.reserve -= rounds;
      player.reloadUntil = 0;
    }
    if (player.boltUntil && player.boltUntil <= this.time) {
      player.boltUntil = 0;
      this.emit({ type: 'bolt', player: player.id });
    }

    if ((reloading || (firing && !player.ammo)) && player.ammo < RIFLE.magazine && player.reserve > 0
      && !player.reloadUntil && !player.boltUntil) {
      player.reloadUntil = this.time + RIFLE.reload;
      this.emit({ type: 'reload', player: player.id });
    }
    if (firing && player.ammo && !player.reloadUntil && !player.boltUntil && !player.sprinting) this.fire(player);
  }

  private updateBreath(player: Player, input: Input, dt: number): void {
    const holding = input.breath && player.aiming;
    if (!holding && player.breath >= 0.35) player.breathExhausted = false;
    player.steady = holding && !player.breathExhausted;
    player.breath = clamp(player.breath + dt * (player.steady ? -0.25 : 0.24), 0, 1);
    if (player.breath <= 0) {
      player.breathExhausted = true;
      player.steady = false;
    }
  }

  private fire(player: Player): void {
    player.ammo--;
    player.boltUntil = this.time + RIFLE.cycle;
    player.protectedUntil = Math.min(player.protectedUntil, this.time);
    const sway = aimSway(player, this.time);
    const aim = direction(player.yaw + sway.yaw, player.pitch + sway.pitch);
    const origin = eye(player);
    const id = ++this.projectileId;
    this.bullets.set(id, {
      id, owner: player.id, position: origin, origin: { ...origin }, generation: player.generation,
      velocity: vec(aim.x * RIFLE.velocity, aim.y * RIFLE.velocity, aim.z * RIFLE.velocity),
      expires: this.time + RIFLE.lifetime,
    });
    this.emit({ type: 'shot', player: player.id, position: origin });
  }

  private updateBullet(bullet: Bullet, dt: number): void {
    const { position: from } = bullet;
    const to = advanceBullet(bullet, dt);
    let stop = this.world.trace(from, to);
    let victim: Player | undefined;
    let headshot = false;
    for (const target of this.players.values()) {
      if (target.id === bullet.owner || !target.alive || target.protectedUntil > this.time) continue;
      const hit = hitPlayer(from, to, target);
      if (hit.fraction < stop) {
        stop = hit.fraction;
        victim = target;
        headshot = hit.headshot;
      }
    }
    if (stop <= 1) {
      const point = vec(lerp(from.x, to.x, stop), lerp(from.y, to.y, stop), lerp(from.z, to.z, stop));
      if (victim) this.damage(bullet, victim, headshot, point);
      else this.emit({ type: 'impact', player: bullet.owner, position: point });
      this.bullets.delete(bullet.id);
      return;
    }
    if (this.time >= bullet.expires || Math.abs(to.x) > 600 || Math.abs(to.z) > 600) {
      this.bullets.delete(bullet.id);
      return;
    }
    bullet.position = to;
    bullet.velocity.y -= RIFLE.gravity * dt;
  }

  private damage(bullet: Bullet, target: Player, headshot: boolean, position: Vec3): void {
    const owner = bullet.owner, attacker = this.players.get(owner);
    if (!attacker) return;
    target.health = Math.max(0, target.health - (headshot ? 100 : RIFLE.bodyDamage));
    this.emit({ type: 'hit', player: owner, target: target.id, headshot, lethal: target.health === 0, position });
    if (target.health > 0) return;
    target.alive = false;
    target.deaths++;
    target.respawnAt = this.time + RESPAWN_SECONDS;
    attacker.kills++;
    if (headshot) attacker.headshots++;
    const range = bullet.origin ? horizontalDistance(bullet.origin, position) : undefined;
    const distance = range === undefined ? undefined : Math.round(range);
    const eligible = attacker.alive && attacker.generation === bullet.generation && range !== undefined && range >= 100;
    const bonus = eligible ? Math.max(0, Math.min(RIFLE.reserve - attacker.reserve, 3)) : 0;
    attacker.reserve += bonus;
    this.emit({ type: 'kill', player: owner, attacker: attacker.name, victim: target.name, headshot, distance, bonus });
  }
}
