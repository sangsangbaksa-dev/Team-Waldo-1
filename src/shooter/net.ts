// ZERO ZONE 1대1 대전 — 네트워크 세션(인사·출발 신호·상태 송수신·끊김 감시)과 메시지 검증. 화면은 game.ts 가 맡습니다.
// 시뮬레이션은 각자의 브라우저에서 같은 시드로 돌고, 총알이 맞았는지는 맞는 사람의 쪽에서 판정합니다.
import type { PvpSession } from '../net/lobby';
import type { Channel, NetMsg } from '../net/types';
import { WEAPONS, type WeaponId } from './config';
import { cleanLoadout, type Loadout } from './attachments';

const SILENT_MS = 8000, NEVER_MS = 25000;

export interface Pose { x: number; z: number; y: number; crouch: boolean; yaw: number; pitch: number; hp: number; armor: number; w: WeaponId; speed: number; ads: boolean; reloading: boolean; parts?: Loadout }
export interface NetShot { w: WeaponId; ox: number; oy: number; oz: number; ends: number[] }
export interface NetHooks {
  onStart(): void; onPose(p: Pose): void; onShot(s: NetShot): void;
  /** 상대가 맞았다고 알림(내 탄이 명중) */ onHitAck(dmg: number, head: boolean): void;
  onPickup(id: number): void;
  /** 상대가 쓰러졌다고 알림. mt 는 상대 경기 시계 */ onDead(mt: number): void;
  onGone(reason: 'bye' | 'silent' | 'never'): void;
}

const num = (v: unknown, lo = -1e6, hi = 1e6): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const weapon = (v: unknown): v is WeaponId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(WEAPONS, v);
export function parsePose(m: NetMsg): Pose | null {
  return num(m.x) && num(m.z) && num(m.y, -100, 2000) && num(m.yaw, -50, 50) && num(m.pitch, -3, 3) && num(m.hp, 0, 1000) && num(m.ar, 0, 1000) && weapon(m.w) && num(m.sp, 0, 50)
    ? { x: m.x, z: m.z, y: m.y, crouch: m.cr === 1, yaw: m.yaw, pitch: m.pitch, hp: m.hp, armor: m.ar, w: m.w, speed: m.sp, ads: m.ad === 1, reloading: m.rl === 1, parts: cleanLoadout(m.w, m.parts) } : null;
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
  private ch: Channel; private timer: number; private born = performance.now(); private heard = performance.now(); private lastTick = performance.now(); private lastPose = 0; private dead = false;
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
    if (!this.started) { this.hello(); if (now - this.born > NEVER_MS) this.gone('never'); } else if (now - this.heard > SILENT_MS) this.gone('silent');
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
    else if (m.t === 'pk') { if (num(m.i, 0, 100000)) this.hooks.onPickup(m.i); }
    else if (m.t === 'dead') { if (num(m.mt, 0, 100000)) this.hooks.onDead(m.mt); }
    else if (m.t === 'bye') this.gone('bye');
  }
  /** 15Hz 로 내 위치·체력을 보냅니다. */
  sendPose(p: Pose, now: number): void {
    if (!this.started || now - this.lastPose < 66) return; this.lastPose = now;
    const r = (v: number): number => Math.round(v * 100) / 100;
    this.ch.send({ t: 'p', x: r(p.x), z: r(p.z), y: r(p.y), cr: p.crouch ? 1 : 0, yaw: r(p.yaw), pitch: r(p.pitch), hp: Math.round(p.hp), ar: Math.round(p.armor), w: p.w, sp: r(p.speed), ad: p.ads ? 1 : 0, rl: p.reloading ? 1 : 0, parts: cleanLoadout(p.w, p.parts) });
  }
  sendShot(s: NetShot): void { if (this.started) this.ch.send({ t: 'sh', w: s.w, ox: Math.round(s.ox * 100) / 100, oy: Math.round(s.oy * 100) / 100, oz: Math.round(s.oz * 100) / 100, e: s.ends.map(v => Math.round(v * 10) / 10) }); }
  sendAck(dmg: number, head: boolean): void { this.ch.send({ t: 'ack', d: Math.round(dmg), h: head ? 1 : 0 }); }
  sendPickup(id: number): void { this.ch.send({ t: 'pk', i: id }); }
  sendDead(mt: number): void { this.ch.send({ t: 'dead', mt: Math.round(mt * 100) / 100 }); }
  bye(): void { this.ch.send({ t: 'bye' }); }
  dispose(): void { this.dead = true; window.clearInterval(this.timer); this.ch.close(); }
}
