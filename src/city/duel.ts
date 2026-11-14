// LAST CITY 1대1 결투 — 네트워크 세션(인사·출발 신호·상태 송수신·끊김 감시)과 승패 규칙. 화면은 game.ts 가 맡습니다.
import type { PvpSession } from '../net/lobby';
import type { Channel, NetMsg } from '../net/types';
import { WEAPONS, type WeaponId } from './defs';

export const TARGET_KILLS = 5, TIME_LIMIT = 300;
const SILENT_MS = 8000, NEVER_MS = 25000;

export interface DuelPose { x: number; y: number; a: number; hp: number; mh: number; w: WeaponId }
export interface DuelShot { x: number; y: number; a: number; w: WeaponId; m: number }
export interface DuelHooks {
  onStart(opponentKlass: string): void;
  onPose(p: DuelPose): void;
  onShot(s: DuelShot): void;
  /** 상대의 누적 사망 횟수 */
  onDeaths(n: number): void;
  onGone(reason: 'bye' | 'silent' | 'never'): void;
}

const num = (v: unknown, lo = -1e6, hi = 1e6): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const weapon = (v: unknown): v is WeaponId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(WEAPONS, v);
export function parsePose(m: NetMsg): DuelPose | null { return num(m.x) && num(m.y) && num(m.a, -20, 20) && num(m.hp, 0, 1e5) && num(m.mh, 1, 1e5) && weapon(m.w) ? { x: m.x, y: m.y, a: m.a, hp: m.hp, mh: m.mh, w: m.w } : null; }
export function parseShot(m: NetMsg): DuelShot | null { return num(m.x) && num(m.y) && num(m.a, -20, 20) && num(m.m, 0, 10) && weapon(m.w) ? { x: m.x, y: m.y, a: m.a, w: m.w, m: m.m } : null; }

/**
 * 결투 승패: 먼저 TARGET_KILLS 번 쓰러뜨리면 승리. 제한 시간이 지나면 킬이 더 많은 쪽이 이기고, 같으면 다음 킬이 승부를 가릅니다.
 * (킬 = 상대의 사망 횟수)
 */
export function duelOutcome(myDeaths: number, oppDeaths: number, time: number): 'win' | 'lose' | null {
  if (myDeaths >= TARGET_KILLS || oppDeaths >= TARGET_KILLS || time >= TIME_LIMIT) { if (oppDeaths > myDeaths) return 'win'; if (myDeaths > oppDeaths) return 'lose'; }
  return null;
}

export class CityDuel {
  started = false;
  private ch: Channel; private timer: number; private born = performance.now(); private heard = performance.now(); private lastTick = performance.now(); private lastPose = 0; private dead = false;
  constructor(readonly session: PvpSession, private klass: string, private hooks: DuelHooks) {
    this.ch = session.open(m => this.onMsg(m));
    void this.ch.ready.then(() => this.hello(), () => this.gone('never'));
    this.timer = window.setInterval(() => this.tick(), 500);
  }
  private hello(): void { if (!this.started) this.ch.send({ t: 'hello', klass: this.klass }); }
  private gone(reason: 'bye' | 'silent' | 'never'): void { if (this.dead) return; this.dead = true; window.clearInterval(this.timer); this.hooks.onGone(reason); }
  private tick(): void {
    if (this.dead) return; const now = performance.now();
    if (now - this.lastTick > 2000) this.heard = now; // 내 탭이 멈췄던 시간은 상대의 침묵으로 세지 않습니다
    this.lastTick = now;
    if (!this.started) { this.hello(); if (now - this.born > NEVER_MS) this.gone('never'); } else if (now - this.heard > SILENT_MS) this.gone('silent');
  }
  private begin(klass: unknown): void { if (this.started) return; this.started = true; this.hooks.onStart(typeof klass === 'string' ? klass : 'warlord'); }
  private onMsg(m: NetMsg): void {
    this.heard = performance.now();
    if (m.t === 'hello') { if (this.session.host && !this.started) { this.ch.send({ t: 'start', klass: this.klass }); this.begin(m.klass); } }
    else if (m.t === 'start') { if (!this.session.host) this.begin(m.klass); }
    else if (!this.started) return;
    else if (m.t === 'p') { const p = parsePose(m); if (p) this.hooks.onPose(p); }
    else if (m.t === 'sh') { const s = parseShot(m); if (s) this.hooks.onShot(s); }
    else if (m.t === 'dead') { if (num(m.n, 0, 1000)) this.hooks.onDeaths(m.n); }
    else if (m.t === 'bye') this.gone('bye');
  }
  /** 15Hz 로 내 위치·체력을 보냅니다. */
  sendPose(p: DuelPose, now: number): void {
    if (!this.started || now - this.lastPose < 66) return; this.lastPose = now;
    const r = (v: number): number => Math.round(v * 10) / 10;
    this.ch.send({ t: 'p', x: r(p.x), y: r(p.y), a: Math.round(p.a * 100) / 100, hp: Math.round(p.hp), mh: Math.round(p.mh), w: p.w });
  }
  sendShot(s: DuelShot): void { if (this.started) this.ch.send({ t: 'sh', x: Math.round(s.x), y: Math.round(s.y), a: Math.round(s.a * 1000) / 1000, w: s.w, m: Math.round(s.m * 100) / 100 }); }
  sendDeaths(n: number): void { this.ch.send({ t: 'dead', n }); }
  bye(): void { this.ch.send({ t: 'bye' }); }
  dispose(): void { this.dead = true; window.clearInterval(this.timer); this.ch.close(); }
}
