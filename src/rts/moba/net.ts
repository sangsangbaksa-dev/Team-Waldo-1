// FRONTLINE 라인전 멀티플레이 방(2~4인 협동 vs AI) — N인 락스텝. 모두가 같은 시뮬레이션을 돌리고 명령만 주고받습니다.
// 3틱(0.15초)을 한 턴으로 묶고, 명령은 2턴 뒤 실행으로 예약해 보냅니다. 모든 참가자의 그 턴 명령이 모여야 진행합니다.
import type { Channel, NetMsg } from '../../net/types';
import { TICK } from '../config';
import type { Cmd } from './sim';

export const TURN_TICKS = 3, DELAY = 2;
const SILENT_MS = 9000, GATHER_MS = 15000, NEVER_MS = 30000, BEAT_MS = 250;

export interface RoomLink { players: Array<{ id: string; nickname: string }>; meId: string; host: boolean; open(onMessage: (m: NetMsg) => void): Channel }
export interface Pick { champ: string; spells: [string, string]; rune: string }
export interface StartEntry extends Pick { id: string }
export interface RoomHooks {
  /** 방장이 정한 참가자 목록(입장 순서)과 난이도로 시작합니다. */
  onStart(list: StartEntry[], level: string): void;
  onGone(id: string): void;
  onAbort(): void;
}

function cleanCmds(v: unknown): Cmd[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 12).filter((c): c is Cmd => {
    if (typeof c !== 'object' || c === null) return false; const o = c as Record<string, unknown>;
    if (typeof o.k !== 'string' || o.k === 'surrender') return false;
    for (const f of ['x', 'y', 'i', 'target', 'id']) if (f in o && (typeof o[f] !== 'number' || !Number.isFinite(o[f] as number))) return false;
    return true;
  });
}
const str = (v: unknown, n = 24): string => (typeof v === 'string' ? v.slice(0, n) : '');

export class MobaRoomNet {
  started = false; stalled = false; ids: string[] = [];
  private ch: Channel; private timer: number; private dead = false; private born = performance.now(); private lastTick = performance.now(); private lastSend = 0;
  private picks = new Map<string, Pick>(); private level = 'normal'; private myPick: Pick; private startMsg: NetMsg | null = null;
  private pending: Cmd[] = []; private turn = 0; private acc = 0; private mine = new Map<number, Cmd[]>(); private theirs = new Map<string, Map<number, Cmd[]>>();
  private have = new Map<string, number>(); private peerAck = new Map<string, number>(); private heard = new Map<string, number>(); private gone = new Set<string>();

  constructor(readonly link: RoomLink, pick: Pick, level: string, private hooks: RoomHooks) {
    this.myPick = pick; this.level = level; this.picks.set(link.meId, pick);
    this.ch = link.open(m => this.onMsg(m));
    void this.ch.ready.then(() => this.hello(), () => this.abort());
    this.timer = window.setInterval(() => this.watch(), 250);
  }
  private abort(): void { if (this.dead) return; this.dead = true; window.clearInterval(this.timer); this.hooks.onAbort(); }
  private hello(): void { if (!this.started) this.ch.send({ t: 'hello', f: this.link.meId, pick: this.myPick }); }
  private watch(): void {
    if (this.dead) return; const now = performance.now();
    if (now - this.lastTick > 2500) for (const id of this.heard.keys()) this.heard.set(id, now); // 내 탭이 멈춘 시간은 상대의 침묵으로 세지 않습니다
    this.lastTick = now;
    if (!this.started) {
      this.hello(); const all = this.link.players.every(p => this.picks.has(p.id));
      if (this.link.host && (all || (now - this.born > GATHER_MS && this.picks.size >= 2))) this.launch(); else if (now - this.born > NEVER_MS) this.abort();
      return;
    }
    for (const id of this.ids) if (id !== this.link.meId && !this.gone.has(id) && now - (this.heard.get(id) ?? now) > SILENT_MS) { this.gone.add(id); this.hooks.onGone(id); }
    this.beat();
  }
  private launch(): void {
    const list = this.link.players.filter(p => this.picks.has(p.id)).slice(0, 4).map(p => ({ id: p.id, ...(this.picks.get(p.id) as Pick) }));
    this.startMsg = { t: 'start', f: this.link.meId, list, level: this.level }; this.ch.send(this.startMsg); this.begin(list, this.level);
  }
  private begin(list: StartEntry[], level: string): void {
    if (this.started) return; this.started = true; this.ids = list.map(e => e.id); const now = performance.now();
    for (let t = 0; t < DELAY; t++) { this.mine.set(t, []); }
    for (const id of this.ids) if (id !== this.link.meId) { this.theirs.set(id, new Map(Array.from({ length: DELAY }, (_, t) => [t, [] as Cmd[]]))); this.have.set(id, DELAY - 1); this.peerAck.set(id, -1); this.heard.set(id, now); }
    this.hooks.onStart(list, level);
  }
  /** 내가 내린 명령. 다음 턴 경계에서 묶어 보냅니다. */
  send(c: Cmd): void { if (!this.dead && this.started) this.pending.push(c); }
  private beat(): void { const now = performance.now(); if (now - this.lastSend < BEAT_MS) return; this.transmit(); }
  private transmit(): void {
    this.lastSend = performance.now(); let lo = Infinity; for (const id of this.ids) if (id !== this.link.meId) lo = Math.min(lo, this.peerAck.get(id) ?? -1); if (!Number.isFinite(lo)) lo = this.turn;
    const turns: Array<[number, Cmd[]]> = []; for (let n = lo + 1; n <= this.turn + DELAY && turns.length < 24; n++) { const c = this.mine.get(n); if (c) turns.push([n, c]); }
    this.ch.send({ t: 'T', f: this.link.meId, p: turns, a: Object.fromEntries(this.have) });
  }
  private onMsg(m: NetMsg): void {
    if (this.dead) return; const f = str(m.f, 64); if (!f || f === this.link.meId || !this.link.players.some(p => p.id === f)) return;
    if (this.started) { if (!this.heard.has(f) && !this.ids.includes(f)) return; this.heard.set(f, performance.now()); }
    if (m.t === 'hello') {
      const p = m.pick as Record<string, unknown> | undefined; if (!this.started && p && typeof p === 'object') this.picks.set(f, { champ: str(p.champ), spells: [str((p.spells as unknown[])?.[0]), str((p.spells as unknown[])?.[1])], rune: str(p.rune) });
      else if (this.started && this.startMsg) this.ch.send(this.startMsg);
      return;
    }
    if (m.t === 'start') {
      if (this.started || f !== this.link.players[0]?.id || !Array.isArray(m.list)) return;
      const list: StartEntry[] = []; for (const e of m.list.slice(0, 4) as Array<Record<string, unknown>>) { const id = str(e.id, 64); if (this.link.players.some(p => p.id === id)) list.push({ id, champ: str(e.champ), spells: [str((e.spells as unknown[])?.[0]), str((e.spells as unknown[])?.[1])], rune: str(e.rune) }); }
      if (list.some(e => e.id === this.link.meId)) { this.startMsg = null; this.begin(list, str(m.level, 12)); }
      return;
    }
    if (m.t === 'bye') { if (this.started && !this.gone.has(f)) { this.gone.add(f); this.hooks.onGone(f); } return; }
    if (m.t !== 'T' || !this.started) return;
    const tm = this.theirs.get(f); if (!tm) return;
    if (Array.isArray(m.p)) for (const e of m.p.slice(0, 40)) {
      if (!Array.isArray(e) || typeof e[0] !== 'number' || !Number.isInteger(e[0]) || e[0] < this.turn || e[0] > this.turn + 60) continue;
      if (!tm.has(e[0])) tm.set(e[0], cleanCmds(e[1]));
    }
    let h = this.have.get(f) ?? -1; while (tm.has(h + 1)) h++; this.have.set(f, h);
    const a = (m.a as Record<string, unknown> | undefined)?.[this.link.meId]; if (typeof a === 'number' && a > (this.peerAck.get(f) ?? -1)) this.peerAck.set(f, Math.min(a, this.turn + DELAY));
  }
  /** 프레임마다 부릅니다. 모두의 명령이 모인 만큼 진행하고, `apply(index, cmd)` 로 참가자 번호(입장 순서)에 명령을 건넵니다. */
  pump(dt: number, tick: () => number, step: () => void, apply: (idx: number, c: Cmd) => void, done: () => boolean, cap = 0.6): void {
    if (this.dead || !this.started) return; this.acc = Math.min(this.acc + dt, cap); this.stalled = false;
    while (this.acc >= 1 / TICK && !done()) {
      const k = tick();
      if (k % TURN_TICKS === 0) {
        const t = k / TURN_TICKS;
        if (!this.mine.has(t + DELAY)) { this.mine.set(t + DELAY, this.pending); this.pending = []; this.turn = t; this.transmit(); }
        this.turn = t; const mine = this.mine.get(t); let ready = !!mine;
        for (const id of this.ids) if (id !== this.link.meId && !this.gone.has(id) && !this.theirs.get(id)?.has(t)) ready = false;
        if (!ready) { this.stalled = true; break; }
        this.ids.forEach((id, i) => { const cs = id === this.link.meId ? mine : this.theirs.get(id)?.get(t); if (cs) for (const c of cs) apply(i, c); });
        this.mine.delete(t - 4); for (const m of this.theirs.values()) m.delete(t - 4);
      }
      step(); this.acc -= 1 / TICK;
    }
  }
  bye(): void { if (!this.dead) this.ch.send({ t: 'bye', f: this.link.meId }); }
  dispose(): void { this.dead = true; window.clearInterval(this.timer); this.ch.close(); }
}
