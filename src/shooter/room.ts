// ZERO ZONE 멀티플레이 방(3인 이상) — 사람끼리 겨루는 서바이벌. 모두 같은 시드로 각자 시뮬레이션을 돌리고,
// 탄이 맞았는지는 맞는 사람의 쪽에서 판정합니다(1대1과 같은 방식). 모든 메시지에 보낸 사람 id(f)를 붙입니다.
import type { RoomSession } from '../net/lobby';
import type { Channel, NetMsg } from '../net/types';
import { parsePose, parseShot, type NetShot, type Pose } from './net';

const SILENT_MS = 8000, NEVER_MS = 25000, GATHER_MS = 12000;
export const ROOM_MAX = 6;

export interface RoomHooks {
  /** 방장이 정한 참가자 순서(id). 이 순서가 Match.players 순서입니다. */
  onStart(ids: string[]): void; onPose(id: string, p: Pose): void; onShot(id: string, s: NetShot): void; onPickup(id: number): void;
  /** 누군가 쓰러짐. killer 는 시작 명단 안의 순번(없으면 -1), mt 는 그 사람의 경기 시계 */ onDead(id: string, mt: number, killer: number): void;
  onGone(id: string): void; onAbort(): void;
}
const num = (v: unknown, lo = -1e6, hi = 1e6): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

export class ShooterRoomNet {
  started = false; list: string[] = [];
  private ch: Channel; private timer: number; private born = performance.now(); private lastTick = performance.now(); private lastPose = 0; private dead = false;
  private hellos = new Set<string>(); private heard = new Map<string, number>(); private gone = new Set<string>(); private ids: string[];
  constructor(readonly session: RoomSession, private hooks: RoomHooks) {
    this.ids = session.players.map(p => p.id); this.hellos.add(session.me.id);
    this.ch = session.open(m => this.onMsg(m));
    void this.ch.ready.then(() => this.hello(), () => this.abort());
    this.timer = window.setInterval(() => this.tick(), 500);
  }
  private abort(): void { if (this.dead) return; this.dead = true; window.clearInterval(this.timer); this.hooks.onAbort(); }
  private hello(): void { if (!this.started) this.ch.send({ t: 'hello', f: this.session.me.id }); }
  private tick(): void {
    if (this.dead) return; const now = performance.now();
    if (now - this.lastTick > 2000) for (const id of this.heard.keys()) this.heard.set(id, now); // 내 탭이 멈춘 시간은 상대의 침묵으로 세지 않습니다
    this.lastTick = now;
    if (!this.started) {
      this.hello();
      if (this.session.host && (this.ids.every(id => this.hellos.has(id)) || (now - this.born > GATHER_MS && this.hellos.size >= 2))) this.launch();
      else if (now - this.born > NEVER_MS) this.abort();
      return;
    }
    for (const [id, at] of this.heard) if (!this.gone.has(id) && now - at > SILENT_MS) this.leave(id);
  }
  private launch(): void { const list = this.ids.filter(id => this.hellos.has(id)); this.ch.send({ t: 'start', f: this.session.me.id, list }); this.begin(list); }
  private begin(list: string[]): void {
    if (this.started) return; this.started = true; this.list = list; const now = performance.now();
    for (const id of list) if (id !== this.session.me.id) this.heard.set(id, now);
    this.hooks.onStart(list);
  }
  private leave(id: string): void { if (this.gone.has(id)) return; this.gone.add(id); this.heard.delete(id); this.hooks.onGone(id); }
  private onMsg(m: NetMsg): void {
    const f = typeof m.f === 'string' ? m.f : ''; if (!f || f === this.session.me.id || !this.ids.includes(f)) return;
    if (this.started && this.heard.has(f)) this.heard.set(f, performance.now());
    if (m.t === 'hello') { if (this.started && this.session.host) this.ch.send({ t: 'start', f: this.session.me.id, list: this.list }); else if (!this.started) this.hellos.add(f); }
    else if (m.t === 'start') {
      if (f !== this.session.room.host_id || this.session.host || !Array.isArray(m.list)) return;
      const list = (m.list as unknown[]).filter((x): x is string => typeof x === 'string' && this.ids.includes(x));
      if (list.includes(this.session.me.id) && list.length >= 2) this.begin(list);
    }
    else if (!this.started || this.gone.has(f)) return;
    else if (m.t === 'p') { const p = parsePose(m); if (p) this.hooks.onPose(f, p); }
    else if (m.t === 'sh') { const s = parseShot(m); if (s) this.hooks.onShot(f, s); }
    else if (m.t === 'pk') { if (num(m.i, 0, 100000)) this.hooks.onPickup(m.i); }
    else if (m.t === 'dead') { if (num(m.mt, 0, 100000)) this.hooks.onDead(f, m.mt, num(m.k, -1, ROOM_MAX) ? Math.floor(m.k) : -1); }
    else if (m.t === 'bye') this.leave(f);
  }
  private get f(): string { return this.session.me.id; }
  sendPose(p: Pose, now: number): void {
    if (!this.started || now - this.lastPose < 66) return; this.lastPose = now;
    const r = (v: number): number => Math.round(v * 100) / 100;
    this.ch.send({ t: 'p', f: this.f, x: r(p.x), z: r(p.z), yaw: r(p.yaw), pitch: r(p.pitch), hp: Math.round(p.hp), ar: Math.round(p.armor), w: p.w, sp: r(p.speed), ad: p.ads ? 1 : 0, rl: p.reloading ? 1 : 0, cr: p.crouch ? 1 : 0 });
  }
  sendShot(s: NetShot): void { if (this.started) this.ch.send({ t: 'sh', f: this.f, w: s.w, ox: Math.round(s.ox * 100) / 100, oy: Math.round(s.oy * 100) / 100, oz: Math.round(s.oz * 100) / 100, e: s.ends.map(v => Math.round(v * 10) / 10) }); }
  sendPickup(id: number): void { this.ch.send({ t: 'pk', f: this.f, i: id }); }
  sendDead(mt: number, killer: number): void { this.ch.send({ t: 'dead', f: this.f, mt: Math.round(mt * 100) / 100, k: killer }); }
  bye(): void { this.ch.send({ t: 'bye', f: this.f }); }
  dispose(): void { this.dead = true; window.clearInterval(this.timer); this.ch.close(); }
}
