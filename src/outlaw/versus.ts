// OUTLAW CITY — 온라인 대전(1대1 결투 · 3인 이상 룸 데스매치). 같은 시드의 도시에 서로를 인형(puppet) 보행자로 세우고,
// 내가 맞힌 피해는 상대에게 알려 상대가 자기 몸에 반영합니다(피해자 권위). 처치 수는 쓰러진 쪽이 알립니다.
import type { Channel, NetMsg } from '../net/types';
import { WEAPON_ORDER, PLAYER_ID, type Ped } from './types';
import type { Sim } from './sim';

/** 1대1 매치(PvpSession)와 3인 이상 룸(RoomSession)을 같은 모양으로 다루기 위한 얇은 세션 */
export interface VsSession {
  meId: string; players: Array<{ id: string; nickname: string }>; duel: boolean; open(onMessage: (m: NetMsg) => void): Channel;
  /** 1대1: 결과를 서버에 보고(레이팅 반영) */ report?(winnerId: string): void;
}
export interface VsHooks { onEnd(r: VsResult): void; onFeed(text: string): void; onGone(name: string): void }
export interface VsResult { board: Array<{ id: string; name: string; kills: number; deaths: number }>; winner: string; reason: 'score' | 'time' | 'left' }

const SEND_MS = 66, SILENT_MS = 9000;
export const KILL_LIMIT = { duel: 5, room: 10 };
export const TIME_LIMIT = { duel: 360, room: 300 };
const num = (v: unknown, d = 0): number => typeof v === 'number' && Number.isFinite(v) ? v : d;

export class Versus {
  readonly kills = new Map<string, number>(); readonly deaths = new Map<string, number>();
  left = 0; ended = false; private ch: Channel; private puppets = new Map<string, Ped>(); private target = new Map<string, { x: number; y: number; z: number; yaw: number }>();
  private heard = new Map<string, number>(); private names = new Map<string, string>(); private gone = new Set<string>(); private lastSend = 0; private wasAlive = true; private lastTick = performance.now();
  private fired = 0; private timer: number;
  constructor(private sim: Sim, private s: VsSession, private hooks: VsHooks) {
    this.left = this.s.duel ? TIME_LIMIT.duel : TIME_LIMIT.room;
    const me = sim.player, spawns = sim.map.pois.filter(p => p.kind === 'safehouse' || p.kind === 'hospital' || p.kind === 'park' || p.kind === 'start');
    const order = s.players.map(p => p.id), idx = Math.max(0, order.indexOf(s.meId));
    const at = (i: number): { x: number; z: number } => { const p = spawns[(i * 3) % Math.max(1, spawns.length)]; return p ? { x: p.x + 4, z: p.z + 4 } : { x: i * 8, z: 0 }; };
    const a = at(idx); me.x = a.x; me.z = a.z; me.vx = me.vz = 0; me.hp = me.maxHp;
    for (const pl of s.players) {
      this.kills.set(pl.id, 0); this.deaths.set(pl.id, 0); this.names.set(pl.id, pl.nickname);
      if (pl.id === s.meId) continue;
      const pos = at(order.indexOf(pl.id)), p = sim.spawnPed('gang', pos.x, pos.z, { keep: true, mode: 'scripted', name: pl.nickname, loot: 0, hp: 100, maxHp: 100, armor: 0 });
      p.cur = WEAPON_ORDER.indexOf('pistol'); p.guns[p.cur] = { id: 'pistol', mag: 99, reserve: 999 };
      this.puppets.set(pl.id, p); this.target.set(pl.id, { x: pos.x, y: p.y, z: pos.z, yaw: p.yaw }); this.heard.set(pl.id, performance.now());
    }
    this.ch = s.open(m => this.onMsg(m));
    void this.ch.ready.then(() => this.send({ t: 'hi' }), () => this.finish('left'));
    this.timer = window.setInterval(() => this.watch(), 1000);
  }
  name(id: string): string { return this.names.get(id) ?? '상대'; }
  private send(m: NetMsg): void { if (!this.ended) this.ch.send({ ...m, f: this.s.meId }); }
  private watch(): void {
    if (this.ended) return; const now = performance.now();
    if (now - this.lastTick > 2500) for (const id of this.heard.keys()) this.heard.set(id, now); // 내 탭이 멈춘 시간은 상대의 침묵이 아님
    this.lastTick = now;
    for (const [id, at] of this.heard) if (!this.gone.has(id) && now - at > SILENT_MS) this.drop(id);
  }
  private drop(id: string): void {
    if (this.gone.has(id)) return; this.gone.add(id); const p = this.puppets.get(id); if (p) { this.sim.removePed(p); this.puppets.delete(id); }
    this.hooks.onGone(this.name(id));
    if (this.s.duel || this.s.players.length - this.gone.size <= 1) this.finish('left');
  }
  private onMsg(m: NetMsg): void {
    const f = typeof m.f === 'string' ? m.f : ''; if (!f || f === this.s.meId || !this.names.has(f) || this.ended) return;
    this.heard.set(f, performance.now());
    if (m.t === 'p') {
      const p = this.puppets.get(f); if (!p) return;
      this.target.set(f, { x: num(m.x), y: num(m.y), z: num(m.z), yaw: num(m.yaw) });
      p.cur = Math.max(0, Math.min(WEAPON_ORDER.length - 1, Math.floor(num(m.w, 1)))); if (!p.guns[p.cur]) p.guns[p.cur] = { id: WEAPON_ORDER[p.cur], mag: 99, reserve: 999 };
      p.pitch = num(m.pt); p.crouch = m.c === 1; p.speed = num(m.sp); if (m.fi === 1) p.muzzle = 0.07; p.alive = m.d !== 1; if (!p.alive) p.hp = 0;
    } else if (m.t === 'h') {
      if (m.to !== this.s.meId) return; const me = this.sim.player; if (!me.alive || this.sim.downKind) return;
      const dmg = Math.min(120, Math.max(0, num(m.dmg))); if (dmg <= 0) return;
      this.sim.damagePed(me, dmg, 0, 'pistol'); me.lastHitBy = 0; const a = this.puppets.get(f); if (a) me.hurtYaw = Math.atan2(a.z - me.z, a.x - me.x);
      this.killer = f;
    } else if (m.t === 'bye') { this.drop(f);
    } else if (m.t === 'k') {
      const v = typeof m.v === 'string' ? m.v : f, k = typeof m.k === 'string' ? m.k : ''; if (!this.names.has(v)) return;
      this.score(k, v);
    }
  }
  private killer = '';
  private score(killer: string, victim: string): void {
    this.deaths.set(victim, (this.deaths.get(victim) ?? 0) + 1);
    if (this.names.has(killer) && killer !== victim) this.kills.set(killer, (this.kills.get(killer) ?? 0) + 1);
    this.hooks.onFeed(this.names.has(killer) && killer !== victim ? `${this.name(killer)} → ${this.name(victim)}` : `${this.name(victim)} 쓰러짐`);
    const lim = this.s.duel ? KILL_LIMIT.duel : KILL_LIMIT.room;
    if ([...this.kills.values()].some(k => k >= lim)) this.finish('score');
  }
  /** 매 프레임: 내 상태 송신, 내가 입힌 피해 전달, 인형 위치 보간, 내 사망 알림, 제한 시간 */
  update(dt: number, firing: boolean): void {
    if (this.ended) return; const sim = this.sim, me = sim.player, now = performance.now();
    this.left = Math.max(0, this.left - dt); if (this.left <= 0) this.finish('time');
    // 인형: 위치 보간·체력 복원(내 총알이 입힌 피해만 계산해서 보냄)
    for (const [id, p] of this.puppets) {
      const t = this.target.get(id)!, k = Math.min(1, dt * 14); p.x += (t.x - p.x) * k; p.z += (t.z - p.z) * k; p.y += (t.y - p.y) * k;
      let dy = t.yaw - p.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; p.yaw += dy * k;
      p.vx = p.vz = p.vy = 0; p.grounded = true; p.input.mx = p.input.mz = 0; p.mode = 'scripted'; p.fireHeld = false;
      if (p.alive) { const lost = p.maxHp + p.armor * 0 - p.hp; if (lost > 0.01) { this.send({ t: 'h', to: id, dmg: Math.round(lost * 10) / 10 }); } p.hp = p.maxHp; p.armor = 0; }
    }
    if (firing) this.fired = 1;
    if (now - this.lastSend >= SEND_MS) {
      this.lastSend = now;
      this.send({ t: 'p', x: +me.x.toFixed(2), y: +me.y.toFixed(2), z: +me.z.toFixed(2), yaw: +me.yaw.toFixed(2), pt: +me.pitch.toFixed(2), w: me.cur, c: me.crouch ? 1 : 0, sp: +me.speed.toFixed(1), fi: this.fired, d: me.alive ? 0 : 1 });
      this.fired = 0;
    }
    if (this.wasAlive && !me.alive) { this.send({ t: 'k', v: this.s.meId, k: this.killer }); this.score(this.killer, this.s.meId); this.killer = ''; }
    this.wasAlive = me.alive;
  }
  board(): VsResult['board'] { return this.s.players.map(p => ({ id: p.id, name: p.nickname, kills: this.kills.get(p.id) ?? 0, deaths: this.deaths.get(p.id) ?? 0 })).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths); }
  finish(reason: VsResult['reason']): void {
    if (this.ended) return; const b = this.board();
    let winner = b[0]?.id ?? '';
    if (reason === 'left') { const alive = this.s.players.filter(p => !this.gone.has(p.id)); if (alive.length === 1) winner = alive[0].id; else if (!alive.length) winner = ''; }
    this.send({ t: 'bye' }); this.ended = true; window.clearInterval(this.timer);
    if (this.s.duel && winner === this.s.meId) this.s.report?.(winner);
    this.hooks.onEnd({ board: b, winner, reason });
  }
  dispose(): void {
    if (!this.ended) { this.send({ t: 'bye' }); this.ended = true; }
    window.clearInterval(this.timer); this.ch.close();
    for (const p of this.puppets.values()) this.sim.removePed(p); this.puppets.clear(); void PLAYER_ID;
  }
}
