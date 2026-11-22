// ZERO ZONE 1대1 대전 — 네트워크 세션(인사·출발 신호·상태 송수신·끊김 감시)과 메시지 검증. 화면은 game.ts 가 맡습니다.
// 시뮬레이션은 각자의 브라우저에서 같은 시드로 돌고, 총알이 맞았는지는 맞는 사람의 쪽에서 판정합니다.
import type { PvpSession } from '../net/lobby';
import type { Channel, NetMsg } from '../net/types';
import { AIR, PLAYER, WEAPONS, type WeaponId } from './config';

const SILENT_MS = 8000, NEVER_MS = 25000;

export interface Pose {
  x: number; z: number; yaw: number; pitch: number; hp: number; armor: number; w: WeaponId; speed: number; ads: boolean; reloading: boolean; crouch?: boolean;
  /** 낙하 상태(0 땅 · 1 비행기 · 2 자유낙하 · 3 낙하산)와 고도 · 타고 있는 차(-1 없음) · 내가 모는 차의 [x, z, yaw, 속도] */ air?: number; alt?: number; veh?: number; vs?: [number, number, number, number];
}
export interface NetShot { w: WeaponId; ox: number; oy: number; oz: number; ends: number[] }
export interface NetHooks {
  onStart(): void; onPose(p: Pose): void; onShot(s: NetShot): void;
  /** 상대가 맞았다고 알림(내 탄이 명중) */ onHitAck(dmg: number, head: boolean): void;
  onPickup(id: number): void; /** 상대가 던진 수류탄 */ onNade?(n: NetNade): void;
  /** 상대가 쓰러졌다고 알림. mt 는 상대 경기 시계 */ onDead(mt: number): void;
  onGone(reason: 'bye' | 'silent' | 'never'): void;
}

const num = (v: unknown, lo = -1e6, hi = 1e6): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const weapon = (v: unknown): v is WeaponId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(WEAPONS, v);
export function parsePose(m: NetMsg): Pose | null {
  // The BR aircraft can start outside the playable square, but never 1000m
  // away. Do not accept absurd coordinates or health from peer messages.
  if (!(num(m.x, -1000, 1000) && num(m.z, -1000, 1000) && num(m.yaw, -50, 50) && num(m.pitch, -3, 3) && num(m.hp, 0, PLAYER.hp) && num(m.ar, 0, 500) && weapon(m.w) && num(m.sp, 0, 50))) return null;
  if (m.a !== undefined && (!num(m.a, 0, 3) || !Number.isInteger(m.a))) return null;
  if (num(m.a, 1, 3) && !num(m.al, 0, AIR.alt)) return null;
  if (m.v !== undefined && (!num(m.v, -1, 10000) || !Number.isInteger(m.v))) return null;
  if (m.vs !== undefined && (!Array.isArray(m.vs) || m.vs.length !== 4 || !m.vs.every(v => num(v)))) return null;
  const p: Pose = { x: m.x, z: m.z, yaw: m.yaw, pitch: m.pitch, hp: m.hp, armor: m.ar, w: m.w, speed: m.sp, ads: m.ad === 1, reloading: m.rl === 1, crouch: m.cr === 1 };
  if (m.a !== undefined) p.air = m.a as number;
  if (num(m.al, 0, AIR.alt)) p.alt = m.al;
  if (m.v !== undefined) p.veh = m.v as number;
  if (Array.isArray(m.vs)) p.vs = m.vs as [number, number, number, number];
  return p;
}
/** 위치 메시지(1대1과 방 공용). 소수 둘째 자리까지 줄여 보냅니다. */
export function poseMsg(p: Pose): NetMsg {
  const r = (v: number): number => Math.round(v * 100) / 100;
  const m: NetMsg = { t: 'p', x: r(p.x), z: r(p.z), yaw: r(p.yaw), pitch: r(p.pitch), hp: Math.round(p.hp), ar: Math.round(p.armor), w: p.w, sp: r(Math.min(50, p.speed)), ad: p.ads ? 1 : 0, rl: p.reloading ? 1 : 0, cr: p.crouch ? 1 : 0 };
  if (p.air) { m.a = p.air; m.al = Math.round(p.alt ?? 0); }
  if (p.veh !== undefined && p.veh >= 0) m.v = p.veh;
  if (p.vs) m.vs = p.vs.map(r);
  return m;
}
export interface NetNade { x: number; y: number; z: number; vx: number; vy: number; vz: number }
export function parseNade(m: NetMsg): NetNade | null {
  return num(m.x, -1000, 1000) && num(m.y, -5, 60) && num(m.z, -1000, 1000) && num(m.vx, -80, 80) && num(m.vy, -80, 80) && num(m.vz, -80, 80) ? { x: m.x, y: m.y, z: m.z, vx: m.vx, vy: m.vy, vz: m.vz } : null;
}
/** A remote grenade must originate near its sender, not from an arbitrary
 * point in the BR world. Allow positional latency but reject air/vehicle use,
 * absurd launch velocity and non-finite values.
 */
export function plausibleNadeThrow(n: NetNade, thrower: { x: number; z: number; air: number; veh: number; alive: boolean }): boolean {
  if (!thrower.alive || thrower.air !== 0 || thrower.veh >= 0 ||
    !num(thrower.x) || !num(thrower.z)) return false;
  return num(n.x, -1000, 1000) && num(n.z, -1000, 1000) && num(n.y, 0, 5) &&
    num(n.vx, -35, 35) && num(n.vy, -35, 35) && num(n.vz, -35, 35) &&
    Math.abs(n.x - thrower.x) <= 25 && Math.abs(n.z - thrower.z) <= 25;
}

/** Reject duplicate/rapidly spammed remote grenades in the same network match.
 * Simulation cooldown is 1.2s; permit 1s due to packet scheduling jitter.
 */
export class RemoteNadeLimiter {
  private readonly last = new Map<number, number>();
  allow(owner: number, now: number): boolean {
    if (!Number.isInteger(owner) || owner < 0 || !Number.isFinite(now)) return false;
    const previous = this.last.get(owner);
    if (previous !== undefined && (now < previous || now - previous < 1000)) return false;
    this.last.set(owner, now);
    return true;
  }
}

/** Smooth network delivery can bunch legitimate shots together. Keep a small
 * two-shot burst budget, refilled at the equipped weapon's actual fire rate,
 * instead of letting a peer relay unbounded damage events every frame.
 */
export class RemoteShotLimiter {
  private readonly buckets = new Map<number, { tokens: number; at: number }>();
  allow(owner: number, weaponId: WeaponId, now: number): boolean {
    const weapon = WEAPONS[weaponId];
    if (!Number.isInteger(owner) || owner < 0 || !weapon || !num(now, 0, Number.MAX_SAFE_INTEGER)) return false;
    const bucket = this.buckets.get(owner);
    if (!bucket) {
      this.buckets.set(owner, { tokens: 1, at: now });
      return true;
    }
    if (now < bucket.at) return false;
    const replenished = Math.min(2, bucket.tokens + (now - bucket.at) / (weapon.cd * 1000));
    bucket.at = now;
    if (replenished < 0.98) { bucket.tokens = replenished; return false; }
    bucket.tokens = replenished - 1;
    return true;
  }
}

export function nadeMsg(n: NetNade, owner: number): NetMsg { const r = (v: number): number => Math.round(v * 100) / 100; return { t: 'nd', o: owner, x: r(n.x), y: r(n.y), z: r(n.z), vx: r(n.vx), vy: r(n.vy), vz: r(n.vz) }; }
/** Cheap plausibility guard for a human player's relayed shot.
 * Last known poses may lag the shot, so allow up to 25m of movement instead
 * of insisting on exact eye coordinates. A client never needs an origin
 * hundreds of meters away from its player to fire legitimately.
 */
export function plausiblePlayerShot(shot: NetShot, pose: Pick<Pose, 'x' | 'z' | 'air'>): boolean {
  const weapon = WEAPONS[shot.w];
  if (!weapon || (pose.air !== undefined && pose.air !== 0) || !num(shot.ox) || !num(shot.oz) || !num(pose.x) || !num(pose.z) || Math.abs(shot.ox - pose.x) > 25 || Math.abs(shot.oz - pose.z) > 25) return false;
  if (!num(shot.oy, 0, 5) || shot.ends.length !== weapon.pellets * 3) return false;
  const maxRange2 = (weapon.range + 2) ** 2;
  for (let i = 0; i < shot.ends.length; i += 3) {
    const dx = shot.ends[i] - shot.ox, dy = shot.ends[i + 1] - shot.oy, dz = shot.ends[i + 2] - shot.oz;
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz) || dx * dx + dy * dy + dz * dz > maxRange2) return false;
  }
  return true;
}

export function parseShot(m: NetMsg): NetShot | null {
  if (!weapon(m.w) || !num(m.ox) || !num(m.oy, -50, 50) || !num(m.oz) || !Array.isArray(m.e) || m.e.length < 3 || m.e.length > 27 || m.e.length % 3 !== 0 || !m.e.every(v => num(v))) return null;
  return { w: m.w, ox: m.ox, oy: m.oy, oz: m.oz, ends: m.e as number[] };
}
/** 두 선수가 같은 시드를 쓰도록: 방을 만든 쪽이 정한 시드가 있으면 그것, 없으면 매치 id 에서 만듭니다. */
export function seedOf(config: Record<string, unknown>, matchId: string): number {
  if (typeof config.seed === 'number' && Number.isFinite(config.seed)) return Math.floor(config.seed) >>> 0;
  let h = 2166136261; for (let i = 0; i < matchId.length; i++) { h ^= matchId.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0;
}
/** 동시에 쓰러졌을 때의 승자: 먼저 쓰러진 쪽이 지고, 같으면 방장이 이깁니다. */
export function decideDeath(mine: number, theirs: number, iAmHost: boolean): 'me' | 'them' { if (mine < theirs - 0.05) return 'them'; if (theirs < mine - 0.05) return 'me'; return iAmHost ? 'me' : 'them'; }

export class ShooterNet {
  started = false;
  private ch: Channel; private timer: number; private born = performance.now(); private heard = performance.now(); private lastTick = performance.now(); private lastPose = 0; private lastAlive = 0; private dead = false;
  constructor(readonly session: PvpSession, private hooks: NetHooks) {
    this.ch = session.open(m => this.onMsg(m));
    void this.ch.ready.then(() => this.hello(), () => this.gone('never'));
    this.timer = window.setInterval(() => this.tick(), 500);
  }
  private hello(): void { if (!this.started) this.ch.send({ t: 'hello' }); }
  private gone(reason: 'bye' | 'silent' | 'never'): void { if (this.dead) return; this.dead = true; window.clearInterval(this.timer); this.hooks.onGone(reason); }
  private tick(): void {
    if (this.dead) return; const now = performance.now();
    if (now - this.lastTick > 2000) this.heard = now; // 내 탭이 멈췄던 시간은 상대의 침묵으로 세지 않습니다
    this.lastTick = now;
    if (!this.started) { this.hello(); if (now - this.born > NEVER_MS) this.gone('never'); return; }
    // 프레임이 멈추거나 느려도(백그라운드 탭, 장면 만드는 중) 2초마다 살아 있다고 알립니다.
    if (now - this.lastAlive > 2000) { this.lastAlive = now; this.ch.send({ t: 'ka' }); }
    if (now - this.heard > SILENT_MS) this.gone('silent');
  }
  private begin(): void { if (this.started) return; this.started = true; this.hooks.onStart(); }
  private onMsg(m: NetMsg): void {
    this.heard = performance.now();
    if (m.t === 'hello') { if (this.session.host && !this.started) { this.ch.send({ t: 'start' }); this.begin(); } }
    else if (m.t === 'start') { if (!this.session.host) this.begin(); }
    else if (!this.started) return;
    else if (m.t === 'p') { const p = parsePose(m); if (p) this.hooks.onPose(p); }
    else if (m.t === 'sh') { const s = parseShot(m); if (s) this.hooks.onShot(s); }
    else if (m.t === 'ack') { if (num(m.d, 0, 1000)) this.hooks.onHitAck(m.d, m.h === 1); }
    else if (m.t === 'pk') { if (num(m.i, 0, 1e8)) this.hooks.onPickup(m.i); }
    else if (m.t === 'nd') { const n = parseNade(m); if (n) this.hooks.onNade?.(n); }
    else if (m.t === 'dead') { if (num(m.mt, 0, 100000)) this.hooks.onDead(m.mt); }
    else if (m.t === 'bye') this.gone('bye');
  }
  /** 15Hz 로 내 위치·체력을 보냅니다. */
  sendPose(p: Pose, now: number): void {
    if (!this.started || now - this.lastPose < 66) return; this.lastPose = now;
    this.ch.send(poseMsg(p));
  }
  sendNade(n: NetNade): void { if (this.started) this.ch.send(nadeMsg(n, 0)); }
  sendShot(s: NetShot): void { if (this.started) this.ch.send({ t: 'sh', w: s.w, ox: Math.round(s.ox * 100) / 100, oy: Math.round(s.oy * 100) / 100, oz: Math.round(s.oz * 100) / 100, e: s.ends.map(v => Math.round(v * 10) / 10) }); }
  sendAck(dmg: number, head: boolean): void { this.ch.send({ t: 'ack', d: Math.round(dmg), h: head ? 1 : 0 }); }
  sendPickup(id: number): void { this.ch.send({ t: 'pk', i: id }); }
  sendDead(mt: number): void { this.ch.send({ t: 'dead', mt: Math.round(mt * 100) / 100 }); }
  bye(): void { this.ch.send({ t: 'bye' }); }
  dispose(): void { this.dead = true; window.clearInterval(this.timer); this.ch.close(); }
}
