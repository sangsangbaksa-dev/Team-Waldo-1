// OUTLAW CITY — 같은 도시를 공유하는 결투와 룸 데스매치.
import type { Channel, NetMsg } from '../net/types';
import { WEAPON_ORDER, PLAYER_ID, clamp, type Ped, type SimEvent } from './types';
import { groundHeight } from './world';
import type { Sim } from './sim';

export interface VsSession {
  meId: string;
  players: Array<{ id: string; nickname: string }>;
  duel: boolean;
  open(onMessage: (m: NetMsg) => void): Channel;
  report?(winnerId: string): void;
}
export interface VsHooks { onEnd(r: VsResult): void; onFeed(text: string): void; onGone(name: string): void }
export interface VsResult {
  board: Array<{ id: string; name: string; kills: number; deaths: number }>;
  winner: string;
  reason: 'score' | 'time' | 'left' | 'connection';
}

const SEND_MS = 66, SILENT_MS = 20000;
const KILL_LIMIT = { duel: 5, room: 10 };
const TIME_LIMIT = { duel: 360, room: 300 };
const num = (value: unknown, fallback = 0): number => typeof value === 'number' && Number.isFinite(value) ? value : fallback;

interface Peer {
  ped: Ped;
  x: number;
  y: number;
  z: number;
  yaw: number;
  life: number;
  heard: number;
}

export class Versus {
  readonly killLimit: number;
  left: number;
  ended = false;
  private readonly channel: Channel;
  private readonly peerIds = new Map<number, string>();
  private readonly peers = new Map<string, Peer>();
  private readonly scores: VsResult['board'];
  private readonly duration: number;
  private readonly timer: number;
  private deadline = 0;
  private ready = false;
  private lastSend = -Infinity;
  private lastWatch = performance.now();
  private fired = false;

  constructor(private sim: Sim, private session: VsSession, private hooks: VsHooks) {
    const mode = session.duel ? 'duel' : 'room';
    this.killLimit = KILL_LIMIT[mode];
    this.left = this.duration = TIME_LIMIT[mode];
    this.scores = session.players.map(p => ({ id: p.id, name: p.nickname, kills: 0, deaths: 0 }));
    const spawns = sim.map.pois.filter(p => p.kind === 'safehouse' || p.kind === 'hospital' || p.kind === 'park' || p.kind === 'start');
    session.players.forEach((participant, index) => {
      const spawn = spawns[Math.floor(index * spawns.length / session.players.length)];
      const x = (spawn?.x ?? index * 8) + 4, z = (spawn?.z ?? 0) + 4;
      const y = groundHeight(sim.map, x, z);
      const ped = participant.id === session.meId ? sim.player
        : sim.spawnPed('gang', x, z, { keep: true, mode: 'scripted', name: participant.nickname, loot: 0, hp: 100, maxHp: 100, armor: 0 });
      Object.assign(ped, { x, y, z, vx: 0, vy: 0, vz: 0, hp: ped.maxHp });
      if (participant.id === session.meId) return;
      ped.cur = WEAPON_ORDER.indexOf('pistol');
      ped.guns[ped.cur] = { id: 'pistol', mag: 99, reserve: 999 };
      const peer: Peer = { ped, x, y, z, yaw: ped.yaw, life: 0, heard: performance.now() };
      this.peers.set(participant.id, peer);
      this.peerIds.set(ped.id, participant.id);
      sim.remoteDamage.set(ped, (damage, attacker) => {
        if (attacker === PLAYER_ID) {
          this.send({ t: 'h', to: participant.id, dmg: damage, life: peer.life });
          ped.hurt = 0.45;
        }
      });
    });

    this.channel = session.open(message => this.onMessage(message));
    this.timer = window.setInterval(() => this.watch(), 1000);
    void this.channel.ready.then(() => {
      if (this.ended) return;
      const now = performance.now();
      this.ready = true;
      this.deadline = now + this.duration * 1000;
      this.lastWatch = now;
      for (const peer of this.peers.values()) peer.heard = now;
      this.send({ t: 'hi' });
    }, () => this.finish('connection'));
  }

  private send(message: NetMsg): void {
    if (this.ready && !this.ended) this.channel.send({ ...message, f: this.session.meId });
  }

  private watch(): void {
    if (this.ended || !this.ready) return;
    const now = performance.now();
    this.left = Math.max(0, (this.deadline - now) / 1000);
    if (this.left === 0) { this.finish('time'); return; }
    // A locally suspended tab cannot observe the other clients during that interval.
    if (now - this.lastWatch > 2500) for (const peer of this.peers.values()) peer.heard = now;
    this.lastWatch = now;
    for (const [id, peer] of this.peers) if (now - peer.heard > SILENT_MS) this.drop(id);
  }

  private drop(id: string): void {
    const peer = this.peers.get(id);
    if (!peer || this.ended) return;
    this.sim.removePed(peer.ped);
    this.peers.delete(id);
    const participant = this.scores.find(p => p.id === id);
    if (participant) this.hooks.onGone(participant.name);
    if (!this.peers.size) this.finish('left', this.session.meId);
  }

  private onMessage(message: NetMsg): void {
    const from = typeof message.f === 'string' ? message.f : '';
    const peer = this.peers.get(from);
    if (!peer || this.ended) return;
    peer.heard = performance.now();
    const ped = peer.ped;

    if (message.t === 'p') {
      const life = num(message.life);
      if (!Number.isSafeInteger(life) || life < peer.life) return;
      const edge = this.sim.map.half;
      peer.x = clamp(num(message.x, peer.x), -edge, edge);
      peer.y = clamp(num(message.y, peer.y), -edge, edge);
      peer.z = clamp(num(message.z, peer.z), -edge, edge);
      peer.yaw = num(message.yaw, peer.yaw) % (2 * Math.PI);
      const wasAlive = ped.alive;
      ped.alive = message.d !== 1;
      if (wasAlive && !ped.alive) ped.diedAt = this.sim.t;
      if (ped.alive && (life > peer.life || !wasAlive)) {
        Object.assign(ped, { x: peer.x, y: peer.y, z: peer.z, yaw: peer.yaw });
      }
      peer.life = life;
      ped.hp = ped.alive ? ped.maxHp : 0;
      ped.cur = clamp(Math.floor(num(message.w, 1)), 0, WEAPON_ORDER.length - 1);
      ped.guns[ped.cur] ??= { id: WEAPON_ORDER[ped.cur], mag: 99, reserve: 999 };
      ped.pitch = clamp(num(message.pt), -1.2, 1.2);
      ped.crouch = message.c === 1;
      ped.aiming = message.a === 1;
      ped.speed = clamp(num(message.sp), 0, 120);
      if (message.fi === 1) ped.muzzle = 0.07;
    } else if (message.t === 'h') {
      const player = this.sim.player;
      if (message.to !== this.session.meId || !player.alive || this.sim.downKind || message.life !== this.ownDeaths()) return;
      const damage = clamp(num(message.dmg), 0, 500);
      this.sim.damagePed(player, damage, ped.id, 'pistol');
    } else if (message.t === 'k') {
      const victim = this.scores.find(p => p.id === from);
      const count = num(message.life);
      if (!victim || !Number.isSafeInteger(count) || count <= victim.deaths) return;
      victim.deaths = count - 1;
      this.score(typeof message.k === 'string' ? message.k : '', from);
    } else if (message.t === 'bye') {
      this.drop(from);
    }
  }

  private ownDeaths(): number {
    return this.scores.find(p => p.id === this.session.meId)?.deaths ?? 0;
  }

  private score(killer: string, victim: string): void {
    const down = this.scores.find(p => p.id === victim);
    if (!down) return;
    down.deaths++;
    const winner = killer === victim ? undefined : this.scores.find(p => p.id === killer);
    if (winner) winner.kills++;
    this.hooks.onFeed(winner ? `${winner.name} → ${down.name}` : `${down.name} 쓰러짐`);
    if (winner && winner.kills >= this.killLimit) this.finish('score', winner.id);
  }

  /** The simulation records the actual source of every shot and death. */
  update(dt: number, events: readonly SimEvent[]): void {
    if (this.ended || !this.ready) return;
    for (const event of events) {
      if (event.t === 'shot' && event.id === PLAYER_ID) this.fired = true;
      if (event.t === 'death' && event.id === PLAYER_ID) {
        const killer = this.peerIds.get(event.by) ?? '';
        this.send({ t: 'k', k: killer, life: this.ownDeaths() + 1 });
        this.score(killer, this.session.meId);
        if (this.ended) return;
      }
    }

    const now = performance.now();
    this.left = Math.max(0, (this.deadline - now) / 1000);
    if (this.left === 0) { this.finish('time'); return; }
    const fraction = Math.min(1, dt * 14);
    for (const { ped, x, y, z, yaw } of this.peers.values()) {
      ped.x += (x - ped.x) * fraction;
      ped.y += (y - ped.y) * fraction;
      ped.z += (z - ped.z) * fraction;
      const turn = yaw - ped.yaw;
      ped.yaw += Math.atan2(Math.sin(turn), Math.cos(turn)) * fraction;
      if (ped.alive) ped.walk += ped.speed * dt;
      ped.muzzle = Math.max(0, ped.muzzle - dt);
      ped.hurt = Math.max(0, ped.hurt - dt);
    }

    if (now - this.lastSend >= SEND_MS) {
      const me = this.sim.player;
      this.lastSend = now;
      this.send({ t: 'p', x: me.x, y: me.y, z: me.z, yaw: me.yaw, pt: me.pitch, w: me.cur,
        c: me.crouch ? 1 : 0, a: me.aiming ? 1 : 0, sp: me.speed, fi: this.fired ? 1 : 0, d: me.alive ? 0 : 1, life: this.ownDeaths() });
      this.fired = false;
    }
  }

  board(): VsResult['board'] {
    return [...this.scores].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  }

  private finish(reason: VsResult['reason'], winner = ''): void {
    if (this.ended) return;
    this.ended = true;
    window.clearInterval(this.timer);
    const board = this.board();
    if (reason === 'time') {
      const [first, second] = board.filter(p => p.id === this.session.meId || this.peers.has(p.id));
      if (first && (!second || first.kills !== second.kills || first.deaths !== second.deaths)) winner = first.id;
    }
    if (this.session.duel && winner) this.session.report?.(winner);
    this.hooks.onEnd({ board, winner, reason });
  }

  dispose(): void {
    if (!this.ended) {
      this.send({ t: 'bye' });
      if (this.ready && this.session.duel) {
        const opponent = this.peers.keys().next().value;
        if (opponent) this.session.report?.(opponent);
      }
      this.ended = true;
    }
    window.clearInterval(this.timer);
    this.channel.close();
    for (const { ped } of this.peers.values()) this.sim.removePed(ped);
    this.peers.clear();
  }
}
