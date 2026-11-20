// FRONTLINE 1대1 — 락스텝 동기화. 두 브라우저가 같은 시뮬레이션을 돌리고, 주고받는 것은 명령뿐입니다.
// 명령은 2턴(0.3초) 뒤 실행으로 예약해 보내고, 상대의 그 턴 명령이 도착해야 시뮬레이션이 진행됩니다.
// 메시지는 아직 확인받지 못한 턴을 함께 실어 보내므로 한두 개가 유실되어도 자연히 복구됩니다.
import type { Channel, NetMsg } from '../net/types';
import { TICK } from './config';
import type { Cmd, RtsSim } from './sim';

export const TURN_TICKS = 3, DELAY = 2, HASH_EVERY = 20;
const SILENT_MS = 9000, NEVER_MS = 25000, BEAT_MS = 250;
const CMDS_PER_TURN = 12;

export interface NetHooks {
  onGone(reason: 'bye' | 'silent' | 'never'): void;
  onDesync(): void;
  onStart?(): void;
}
export interface NetSession { host: boolean; open(onMessage: (m: NetMsg) => void): Channel }

/** 모양이 맞는 명령만 통과시킵니다(상대가 보낸 값이므로 믿지 않습니다). 세부 검증은 시뮬레이션이 합니다. */
function cleanCmds(v: unknown): Cmd[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, CMDS_PER_TURN).filter((c): c is Cmd => typeof c === 'object' && c !== null && typeof (c as { k?: unknown }).k === 'string');
}

export class RtsNet {
  readonly me: number; started = false; stalled = false;
  private ch: Channel; private pending: Cmd[] = []; private turn = 0; private acc = 0;
  private mine = new Map<number, Cmd[]>(); private theirs = new Map<number, Cmd[]>();
  private ack = -1; private have = DELAY - 1; private hashes = new Map<number, number>(); private theirHash = new Map<number, number>();
  private born = performance.now(); private heard = performance.now(); private lastSend = 0; private lastTick = performance.now(); private dead = false; private timer: number;

  constructor(session: NetSession, private hooks: NetHooks) {
    this.me = session.host ? 0 : 1;
    for (let t = 0; t < DELAY; t++) { this.mine.set(t, []); this.theirs.set(t, []); }
    this.ch = session.open(m => this.onMsg(m));
    void this.ch.ready.then(() => this.beat(true), () => this.gone('never'));
    this.timer = window.setInterval(() => this.watch(), 200);
  }

  /** 내가 내린 명령. 다음 턴 경계에서 묶어 보냅니다. */
  send(c: Cmd): void { if (!this.dead) this.pending.push(c); }
  get currentTurn(): number { return this.turn; }

  private gone(reason: 'bye' | 'silent' | 'never'): void { if (this.dead) return; this.dead = true; window.clearInterval(this.timer); this.hooks.onGone(reason); }
  private watch(): void {
    if (this.dead) return; const now = performance.now();
    if (now - this.lastTick > 2500) this.heard = now; // 내 탭이 멈춰 있던 시간은 상대의 침묵으로 세지 않습니다.
    this.lastTick = now;
    if (!this.started) { if (now - this.born > NEVER_MS) this.gone('never'); else this.beat(false); return; }
    if (now - this.heard > SILENT_MS) { this.gone('silent'); return; }
    this.beat(false);
  }
  private beat(force: boolean): void {
    const now = performance.now(); if (!force && now - this.lastSend < BEAT_MS) return; this.lastSend = now;
    if (!this.started) { this.ch.send({ t: 'hello' }); return; }
    this.transmit();
  }
  private transmit(): void {
    const turns: Array<[number, Cmd[]]> = [];
    for (let n = this.ack + 1; n <= this.turn + DELAY && turns.length < 24; n++) { const c = this.mine.get(n); if (c) turns.push([n, c]); }
    const m: NetMsg = { t: 'T', p: turns, a: this.have };
    const h = [...this.hashes.entries()].slice(-3); if (h.length) m.h = h;
    this.ch.send(m);
  }
  private begin(): void { if (this.started) return; this.started = true; this.heard = performance.now(); this.ch.send({ t: 'hello' }); this.hooks.onStart?.(); }
  private onMsg(m: NetMsg): void {
    if (this.dead || !m || (m.t !== 'hello' && m.t !== 'bye' && m.t !== 'T')) return; this.heard = performance.now();
    if (m.t === 'hello') { this.begin(); if (this.started) this.transmit(); return; }
    if (m.t === 'bye') { this.gone('bye'); return; }
    if (m.t !== 'T') return;
    this.begin();
    if (Array.isArray(m.p)) for (const e of m.p.slice(0, 40)) {
      if (!Array.isArray(e) || typeof e[0] !== 'number' || !Number.isInteger(e[0]) || e[0] < this.turn || e[0] > this.turn + 60) continue;
      if (!this.theirs.has(e[0])) this.theirs.set(e[0], cleanCmds(e[1]));
    }
    while (this.theirs.has(this.have + 1)) this.have++;
    if (typeof m.a === 'number' && Number.isSafeInteger(m.a) && m.a > this.ack) this.ack = Math.min(m.a, this.turn + DELAY);
    if (Array.isArray(m.h)) for (const e of m.h.slice(0, 6)) if (Array.isArray(e) && Number.isSafeInteger(e[0]) && e[0] >= Math.max(0, this.turn - HASH_EVERY * 4) && e[0] <= this.turn + 60 && e[0] % HASH_EVERY === 0 && Number.isSafeInteger(e[1])) this.theirHash.set(e[0], e[1]);
    this.check();
  }
  private check(): void {
    for (const [turn, h] of this.theirHash) {
      const mine = this.hashes.get(turn); if (mine === undefined) continue;
      this.theirHash.delete(turn); if (mine !== h) { this.hooks.onDesync(); this.dead = true; window.clearInterval(this.timer); return; }
    }
  }

  /** 프레임마다 부릅니다. 두 쪽의 명령이 모두 모인 만큼 시뮬레이션을 진행하고, 실행한 틱 수를 돌려줍니다. */
  pump(sim: RtsSim, dt: number, onTick: () => void, cap = 0.6): number {
    if (this.dead || !this.started || !Number.isFinite(dt) || dt < 0) return 0;
    this.acc = Math.min(this.acc + dt, cap); let ran = 0; this.stalled = false;
    while (this.acc >= 1 / TICK && sim.winner === -1) {
      if (sim.tick % TURN_TICKS === 0) {
        const t = sim.tick / TURN_TICKS;
        if (t % HASH_EVERY === 0 && !this.hashes.has(t)) { this.hashes.set(t, sim.hash()); this.check(); if (this.dead) break; }
        if (!this.mine.has(t + DELAY)) { this.mine.set(t + DELAY, this.pending.splice(0, CMDS_PER_TURN)); this.turn = t; this.transmit(); this.lastSend = performance.now(); }
        this.turn = t;
        const theirs = this.theirs.get(t), mine = this.mine.get(t);
        if (!theirs || !mine) { this.stalled = true; break; }
        const a = this.me === 0 ? mine : theirs, b = this.me === 0 ? theirs : mine;
        for (const c of a) sim.apply(0, c);
        for (const c of b) sim.apply(1, c);
        this.theirs.delete(t - 4); this.mine.delete(t - 4);
        for (const k of this.hashes.keys()) if (k < t - HASH_EVERY * 4) this.hashes.delete(k);
        for (const k of this.theirHash.keys()) if (k < t - HASH_EVERY * 4) this.theirHash.delete(k);
      }
      sim.step(); onTick(); ran++; this.acc -= 1 / TICK;
    }
    return ran;
  }
  bye(): void { if (!this.dead) this.ch.send({ t: 'bye' }); }
  dispose(): void { this.dead = true; window.clearInterval(this.timer); this.ch.close(); }
}
