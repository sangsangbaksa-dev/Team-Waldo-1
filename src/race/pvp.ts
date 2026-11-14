// SPEED RUSH 1대1 — 대전 세션: 인사(차량 교환)·출발 신호·스냅샷 송수신·끊김 감시. 화면은 game.ts 가 맡습니다.
import type { PvpSession } from '../net/lobby';
import type { Channel, NetMsg } from '../net/types';
import { CARS } from './config';
import { encodeSnap, parseSnap, type Snap } from './netcar';
import type { CarState } from './physics';

export interface PvpHooks {
  /** 양쪽이 준비되어 카운트다운을 시작합니다. */
  onStart(opponentCar: string): void;
  onSnap(s: Snap): void;
  onFinish(time: number): void;
  /** 상대가 나갔거나 일정 시간 소식이 없습니다. */
  onGone(reason: 'bye' | 'silent' | 'never'): void;
}
const SILENT_MS = 6000, NEVER_MS = 25000;

export class RacePvp {
  started = false;
  private ch: Channel; private timer: number; private born = performance.now(); private heard = performance.now(); private lastSnap = 0; private lastTick = performance.now(); private dead = false;
  constructor(readonly session: PvpSession, private car: string, private hooks: PvpHooks) {
    this.ch = session.open(m => this.onMsg(m));
    void this.ch.ready.then(() => this.hello(), () => this.gone('never'));
    this.timer = window.setInterval(() => this.tick(), 500);
  }
  private hello(): void { if (!this.started) this.ch.send({ t: 'hello', car: this.car }); }
  private gone(reason: 'bye' | 'silent' | 'never'): void { if (this.dead) return; this.dead = true; window.clearInterval(this.timer); this.hooks.onGone(reason); }
  private tick(): void {
    if (this.dead) return; const now = performance.now();
    if (now - this.lastTick > 2000) this.heard = now; // 내 탭이 멈췄던 시간은 상대의 침묵으로 세지 않습니다
    this.lastTick = now;
    if (!this.started) { this.hello(); if (now - this.born > NEVER_MS) this.gone('never'); } else if (now - this.heard > SILENT_MS) this.gone('silent');
  }
  private begin(car: unknown): void {
    if (this.started) return; this.started = true;
    this.hooks.onStart(typeof car === 'string' && CARS.some(c => c.id === car) ? car : CARS[0].id);
  }
  private onMsg(m: NetMsg): void {
    this.heard = performance.now();
    if (m.t === 'hello') { if (this.session.host && !this.started) { this.ch.send({ t: 'start', car: this.car }); this.begin(m.car); } }
    else if (m.t === 'start') { if (!this.session.host) this.begin(m.car); }
    else if (m.t === 's') { const s = parseSnap(m.c); if (s && this.started) this.hooks.onSnap(s); }
    else if (m.t === 'fin') { if (typeof m.time === 'number' && Number.isFinite(m.time) && m.time > 0) this.hooks.onFinish(m.time); }
    else if (m.t === 'bye') this.gone('bye');
  }
  /** 15Hz 로 내 차량 상태를 보냅니다. */
  sendSnap(car: CarState, now: number): void { if (!this.started || now - this.lastSnap < 66) return; this.lastSnap = now; this.ch.send({ t: 's', c: encodeSnap(car) }); }
  sendFinish(time: number): void { this.ch.send({ t: 'fin', time }); }
  bye(): void { this.ch.send({ t: 'bye' }); }
  dispose(): void { this.dead = true; window.clearInterval(this.timer); this.ch.close(); }
}
