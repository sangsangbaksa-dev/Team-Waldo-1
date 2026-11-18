// LAST CITY 멀티플레이 방(3~6인) — 영웅 난투전 세션: 참가자 모집·출발 신호·위치/사격/사망 송수신·끊김 감시. 화면은 game.ts 가 맡습니다.
// 1대1(CityDuel)과 같은 방식이지만 메시지마다 보낸 사람(f)을 붙여 여러 명을 구분합니다. 병력은 없고 영웅끼리 싸웁니다.
import type { RoomSession } from '../net/lobby';
import type { Channel, NetMsg } from '../net/types';
import { parsePose, parseShot, type DuelPose, type DuelShot } from './duel';

export const ROOM_LIVES = 5, ROOM_TIME = 480;
const SILENT_MS = 8000, GATHER_MS = 12000, NEVER_MS = 25000;

export interface RoomHooks {
  /** 모두 모여 시작합니다. players 는 실제로 접속한 참가자(입장 순서, 나 포함)입니다. */
  onStart(players: Array<{ id: string; klass: string }>): void;
  onPose(id: string, p: DuelPose): void;
  onShot(id: string, s: DuelShot): void;
  /** 그 참가자의 누적 사망 횟수 */
  onDeaths(id: string, n: number): void;
  /** 그 참가자의 본부가 무너졌습니다(탈락) */
  onHqDown(id: string): void;
  onGone(id: string): void;
  onAbort(): void;
}

/** 순위: 탈락하지 않은 쪽이 앞, 그다음 사망 횟수가 적은 쪽, 같으면 입장 순서. 모든 클라이언트가 같은 값을 얻습니다. */
export function roomRanking(ids: string[], deaths: Map<string, number>, out: Set<string>): string[] {
  const lost = (id: string): boolean => out.has(id) || (deaths.get(id) ?? 0) >= ROOM_LIVES;
  return [...ids].sort((a, b) => Number(lost(a)) - Number(lost(b)) || (deaths.get(a) ?? 0) - (deaths.get(b) ?? 0) || ids.indexOf(a) - ids.indexOf(b));
}
/** 끝났으면 우승자 id. 한 명만 남았거나 시간이 다 됐을 때 정해집니다. */
export function roomWinner(ids: string[], deaths: Map<string, number>, out: Set<string>, time: number): string | null {
  const rank = roomRanking(ids, deaths, out), alive = ids.filter(id => !out.has(id) && (deaths.get(id) ?? 0) < ROOM_LIVES);
  if (alive.length <= 1) return rank[0] ?? null;
  return time >= ROOM_TIME ? rank[0] : null;
}

export class CityRoom {
  started = false;
  private ch: Channel; private timer: number; private born = performance.now(); private lastTick = performance.now(); private lastPose = 0; private dead = false;
  private klasses = new Map<string, string>(); private heard = new Map<string, number>(); private gone = new Set<string>(); private ids: string[]; private startList: Array<{ id: string; klass: string }> = [];
  constructor(readonly session: RoomSession, private klass: string, private hooks: RoomHooks) {
    this.ids = session.players.map(p => p.id); this.klasses.set(session.me.id, klass);
    this.ch = session.open(m => this.onMsg(m));
    void this.ch.ready.then(() => this.hello(), () => this.abort());
    this.timer = window.setInterval(() => this.tick(), 500);
  }
  private me(): string { return this.session.me.id; }
  private abort(): void { if (this.dead) return; this.dead = true; window.clearInterval(this.timer); this.hooks.onAbort(); }
  private hello(): void { if (!this.started) this.ch.send({ t: 'hello', f: this.me(), klass: this.klass }); }
  private tick(): void {
    if (this.dead) return; const now = performance.now();
    if (now - this.lastTick > 2000) for (const id of this.heard.keys()) this.heard.set(id, now); // 내 탭이 멈춘 시간은 상대의 침묵으로 세지 않습니다
    this.lastTick = now;
    if (!this.started) {
      this.hello();
      const everyone = this.ids.every(id => this.klasses.has(id));
      if (this.session.host && (everyone || (now - this.born > GATHER_MS && this.klasses.size >= 2))) this.launch();
      else if (now - this.born > NEVER_MS) this.abort();
      return;
    }
    for (const [id, at] of this.heard) if (!this.gone.has(id) && now - at > SILENT_MS) this.leave(id);
  }
  private launch(): void {
    const list = this.ids.filter(id => this.klasses.has(id)).map(id => ({ id, klass: this.klasses.get(id) as string }));
    this.ch.send({ t: 'start', f: this.me(), list }); this.begin(list);
  }
  private begin(list: Array<{ id: string; klass: string }>): void {
    if (this.started) return; this.started = true; this.startList = list; const now = performance.now();
    for (const p of list) if (p.id !== this.me()) this.heard.set(p.id, now);
    this.hooks.onStart(list);
  }
  private leave(id: string): void { if (this.gone.has(id)) return; this.gone.add(id); this.heard.delete(id); this.hooks.onGone(id); }
  private onMsg(m: NetMsg): void {
    const f = typeof m.f === 'string' ? m.f : ''; if (!f || f === this.me() || !this.ids.includes(f)) return;
    if (this.started && this.heard.has(f)) this.heard.set(f, performance.now());
    if (m.t === 'hello') { if (this.started && this.session.host) this.ch.send({ t: 'start', f: this.me(), list: this.startList }); else if (!this.started) this.klasses.set(f, typeof m.klass === 'string' ? m.klass : 'warlord'); }
    else if (m.t === 'start') {
      if (f !== this.session.room.host_id || this.session.host || !Array.isArray(m.list)) return;
      const list = (m.list as unknown[]).flatMap(x => { const o = x as { id?: unknown; klass?: unknown }; return typeof o?.id === 'string' && this.ids.includes(o.id) ? [{ id: o.id, klass: typeof o.klass === 'string' ? o.klass : 'warlord' }] : []; });
      if (list.some(p => p.id === this.me()) && list.length >= 2) this.begin(list);
    }
    else if (!this.started || this.gone.has(f)) return;
    else if (m.t === 'p') { const p = parsePose(m); if (p) this.hooks.onPose(f, p); }
    else if (m.t === 'sh') { const s = parseShot(m); if (s) this.hooks.onShot(f, s); }
    else if (m.t === 'dead') { if (typeof m.n === 'number' && Number.isFinite(m.n) && m.n >= 0 && m.n <= 1000) this.hooks.onDeaths(f, m.n); }
    else if (m.t === 'hq') this.hooks.onHqDown(f);
    else if (m.t === 'bye') this.leave(f);
  }
  sendPose(p: DuelPose, now: number): void {
    if (!this.started || now - this.lastPose < 66) return; this.lastPose = now;
    const r = (v: number): number => Math.round(v * 10) / 10;
    this.ch.send({ t: 'p', f: this.me(), x: r(p.x), y: r(p.y), a: Math.round(p.a * 100) / 100, hp: Math.round(p.hp), mh: Math.round(p.mh), w: p.w });
  }
  sendShot(s: DuelShot): void { if (this.started) this.ch.send({ t: 'sh', f: this.me(), x: Math.round(s.x), y: Math.round(s.y), a: Math.round(s.a * 1000) / 1000, w: s.w, m: Math.round(s.m * 100) / 100 }); }
  sendHqDown(): void { this.ch.send({ t: 'hq', f: this.me() }); }
  sendDeaths(n: number): void { this.ch.send({ t: 'dead', f: this.me(), n }); }
  bye(): void { this.ch.send({ t: 'bye', f: this.me() }); }
  dispose(): void { this.dead = true; window.clearInterval(this.timer); this.ch.close(); }
}
