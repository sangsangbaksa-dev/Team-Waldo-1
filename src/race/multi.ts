// SPEED RUSH 멀티플레이 방(3~6인) — 세션: 차량 교환·출발 신호·스냅샷 송수신·끊김 감시. 화면은 game.ts 가 맡습니다.
// 1대1(RacePvp)과 같은 방식이지만 메시지마다 보낸 사람(f)을 붙여 여러 명을 구분합니다.
import type { RoomSession } from '../net/lobby';
import type { Channel, NetMsg } from '../net/types';
import { CARS } from './config';
import { encodeSnap, parseSnap, validFinishTime, type Snap } from './netcar';
import type { CarState } from './physics';

export interface MultiHooks {
  /** 모두 모여 카운트다운을 시작합니다. players 는 실제로 접속한 참가자(입장 순서, 나 포함)와 그들의 차량입니다. */
  onStart(players: Array<{ id: string; car: string }>): void;
  onSnap(id: string, s: Snap): void;
  onFinish(id: string, time: number): void;
  /** 참가자가 나갔거나 일정 시간 소식이 없습니다. */
  onGone(id: string): void;
  /** 방장이 시작을 못 하고 끊겼거나 아무도 모이지 않았습니다. */
  onAbort(): void;
}
const SILENT_MS = 6000, GATHER_MS = 12000, NEVER_MS = 25000;

export class RaceMulti {
  started = false;
  private ch: Channel; private timer: number; private born = performance.now(); private lastSnap = 0; private lastTick = performance.now(); private dead = false; private disposed = false;
  private startList: Array<{ id: string; car: string }> = []; private cars = new Map<string, string>(); private heard = new Map<string, number>(); private gone = new Set<string>(); private ids: string[];
  constructor(readonly session: RoomSession, private car: string, private hooks: MultiHooks) {
    this.ids = session.players.map(p => p.id); this.cars.set(session.me.id, car);
    this.ch = session.open(m => this.onMsg(m));
    void this.ch.ready.then(() => this.hello(), () => this.abort());
    this.timer = window.setInterval(() => this.tick(), 500);
  }
  private abort(): void { if (this.dead) return; this.dead = true; window.clearInterval(this.timer); this.hooks.onAbort(); }
  private hello(): void { if (!this.dead && !this.started) this.ch.send({ t: 'hello', f: this.session.me.id, car: this.car }); }
  private tick(): void {
    if (this.dead) return; const now = performance.now();
    if (now - this.lastTick > 2000) {
      // Inactive tabs throttle timers. Sleeping time cannot expire either the
      // launch/gather deadline or another driver's silence timeout.
      this.born += now - this.lastTick;
      for (const id of this.heard.keys()) this.heard.set(id, now);
    }
    this.lastTick = now;
    if (!this.started) {
      this.hello();
      const everyone = this.ids.every(id => this.cars.has(id));
      if (this.session.host && (everyone || (now - this.born > GATHER_MS && this.cars.size >= 2))) this.launch();
      else if (now - this.born > NEVER_MS) this.abort();
      return;
    }
    for (const [id, at] of this.heard) if (!this.gone.has(id) && now - at > SILENT_MS) this.leave(id);
  }
  /** 방장: 모인 사람만으로 출발 신호를 보냅니다. */
  private launch(): void {
    const order = this.ids.filter(id => this.cars.has(id)), list = order.map(id => ({ id, car: this.cars.get(id) as string }));
    this.ch.send({ t: 'start', f: this.session.me.id, list }); this.begin(list);
  }
  private begin(list: Array<{ id: string; car: string }>): void {
    if (this.dead || this.started) return; this.started = true; this.startList = list; const now = performance.now();
    for (const p of list) if (p.id !== this.session.me.id) this.heard.set(p.id, now);
    this.hooks.onStart(list);
  }
  private leave(id: string): void { if (this.gone.has(id)) return; this.gone.add(id); this.heard.delete(id); this.hooks.onGone(id); }
  private onMsg(m: NetMsg): void {
    if (this.dead) return;
    const f = typeof m.f === 'string' ? m.f : ''; if (!f || f === this.session.me.id || !this.ids.includes(f)) return;
    if (this.started) { if (this.heard.has(f)) this.heard.set(f, performance.now()); }
    if (m.t === 'hello') { if (this.started && this.session.host) this.ch.send({ t: 'start', f: this.session.me.id, list: this.startList }); else if (!this.started) this.cars.set(f, typeof m.car === 'string' && CARS.some(c => c.id === m.car) ? m.car : CARS[0].id); }
    else if (m.t === 'start') {
      if (f !== this.session.room.host_id || this.session.host || !Array.isArray(m.list)) return;
      const list: Array<{ id: string; car: string }> = [], seen = new Set<string>();
      for (const x of m.list) {
        if (typeof x !== 'object' || x === null) continue;
        const o = x as { id?: unknown; car?: unknown };
        if (typeof o.id !== 'string' || !this.ids.includes(o.id) || seen.has(o.id)) continue;
        seen.add(o.id); list.push({ id: o.id, car: typeof o.car === 'string' && CARS.some(c => c.id === o.car) ? o.car : CARS[0].id });
      }
      if (seen.has(this.session.me.id) && seen.has(this.session.room.host_id) && list.length >= 2) this.begin(list);
    }
    else if (m.t === 's') { const s = parseSnap(m.c); if (s && this.started && !this.gone.has(f)) this.hooks.onSnap(f, s); }
    else if (m.t === 'fin') { if (this.started && this.heard.has(f) && validFinishTime(m.time)) this.hooks.onFinish(f, m.time); }
    else if (m.t === 'bye') this.leave(f);
  }
  sendSnap(car: CarState, now: number): void { if (this.dead || !this.started || now - this.lastSnap < 66) return; this.lastSnap = now; this.ch.send({ t: 's', f: this.session.me.id, c: encodeSnap(car) }); }
  sendFinish(time: number): void { if (!this.dead && this.started) this.ch.send({ t: 'fin', f: this.session.me.id, time }); }
  bye(): void { if (!this.dead) this.ch.send({ t: 'bye', f: this.session.me.id }); }
  dispose(): void { if (this.disposed) return; this.disposed = this.dead = true; window.clearInterval(this.timer); this.ch.close(); }
}
