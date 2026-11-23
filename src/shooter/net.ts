// ZERO ZONE 1대1 대전 — 네트워크 세션(인사·출발 신호·상태 송수신·끊김 감시)과 메시지 검증. 화면은 game.ts 가 맡습니다.
// 시뮬레이션은 각자의 브라우저에서 같은 시드로 돌고, 총알이 맞았는지는 맞는 사람의 쪽에서 판정합니다.
import type { PvpSession } from '../net/lobby';
import type { Channel, NetMsg } from '../net/types';
import { WEAPONS, type WeaponId } from './config';

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
  if (!(num(m.x) && num(m.z) && num(m.yaw, -50, 50) && num(m.pitch, -3, 3) && num(m.hp, 0, 1000) && num(m.ar, 0, 1000) && weapon(m.w) && num(m.sp, 0, 50))) return null;
  const p: Pose = { x: m.x, z: m.z, yaw: m.yaw, pitch: m.pitch, hp: m.hp, armor: m.ar, w: m.w, speed: m.sp, ads: m.ad === 1, reloading: m.rl === 1, crouch: m.cr === 1 };
  if (num(m.a, 0, 3) && Number.isInteger(m.a)) p.air = m.a; if (num(m.al, 0, 1000)) p.alt = m.al; if (num(m.v, -1, 10000) && Number.isInteger(m.v)) p.veh = m.v;
  if (Array.isArray(m.vs) && m.vs.length === 4 && m.vs.every(v => num(v))) p.vs = m.vs as [number, number, number, number];
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
/** 방 안에서 수류탄 소유자 위조 및 원격 폭발 위치 조작을 막습니다.
 * 방장의 봇 수류탄은 봇 본인이 보낸 메시지가 아니라 방장이 대신 송신합니다. */
export interface RoomNadeActor {
  id: number; bot: boolean; remote: boolean; alive: boolean; air: number; veh: number;
  x: number; z: number; crouch: number;
}
export function canAcceptRoomNade(
  n: NetNade,
  owner: RoomNadeActor | null | undefined,
  sender: Pick<RoomNadeActor, 'id'> | null | undefined,
  senderIsAuthority: boolean,
  groundY: number,
): boolean {
  if (!owner?.remote || !owner.alive || owner.air !== 0 || owner.veh >= 0 || !sender) return false;
  const fromOwner = owner.id === sender.id;
  const botFromHost = senderIsAuthority && owner.bot;
  if (!fromOwner && !botFromHost) return false;
  if (![n.x, n.y, n.z, n.vx, n.vy, n.vz, groundY].every(Number.isFinite)) return false;
  const maxPositionError = botFromHost ? 15 : 7;
  if (Math.hypot(n.x - owner.x, n.z - owner.z) > maxPositionError) return false;
  const eye = 1.65 - (1.65 - 1.05) * Math.max(0, Math.min(1, owner.crouch));
  if (Math.abs(n.y - groundY - eye) > 4) return false;
  // 정상 수류탄의 초기 속도는 약 18~24m/s입니다. 과속 패킷은 무시합니다.
  return Math.hypot(n.vx, n.vy, n.vz) <= 40;
}
/** 투척 속도와 별개로 같은 참가자의 위조된 연속 수류탄 메시지를 제한합니다. */
export function roomNadeCooldownReady(lastAt: number | undefined, now: number, minimumMs: number): boolean {
  return Number.isFinite(now) && Number.isFinite(minimumMs) && minimumMs > 0 &&
    (lastAt === undefined || (Number.isFinite(lastAt) && now - lastAt >= minimumMs));
}

export function nadeMsg(n: NetNade, owner: number): NetMsg { const r = (v: number): number => Math.round(v * 100) / 100; return { t: 'nd', o: owner, x: r(n.x), y: r(n.y), z: r(n.z), vx: r(n.vx), vy: r(n.vy), vz: r(n.vz) }; }
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
