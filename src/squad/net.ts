// SQUAD CLASH 온라인 대전 — 배치 교환·접속 감시. 전투는 두 쪽이 같은 시드로 같은 시뮬레이션을 돌리므로 배치만 주고받습니다.
import type { PvpSession } from '../net/lobby';
import type { Channel, NetMsg } from '../net/types';
import type { Placement } from './sim';
import { UNITS } from './units';
export interface SquadHooks {
  /** 상대가 라운드 r 의 배치를 보냈습니다(첫 번째 값만 받아들입니다). */
  onArmy(round: number, army: Placement[]): void;
  /** 상대가 나갔거나 일정 시간 소식이 없습니다. */
  onGone(reason: 'bye' | 'silent' | 'never'): void;
}
const TICK_MS = 2000, SILENT_MS = 20000, NEVER_MS = 30000, MAX_UNITS = 40, MAX_ROUNDS = 64;
/** Drawn rounds can extend a best-of-three match; keep messages bounded. */
export const validRound = (value: unknown): value is number => Number.isSafeInteger(value) && typeof value === 'number' && value >= 1 && value <= MAX_ROUNDS;
export function parseArmy(raw: unknown): Placement[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_UNITS) return null;
  const out: Placement[] = [];
  for (const p of raw as Array<Record<string, unknown>>) {
    if (!p || typeof p.type !== 'string' || !Object.prototype.hasOwnProperty.call(UNITS, p.type) || !Number.isInteger(p.x) || !Number.isInteger(p.y)) return null;
    out.push({ type: p.type as Placement['type'], x: p.x as number, y: p.y as number });
  }
  return out;
}
export class SquadPvp {
  /** 상대의 메시지를 한 번이라도 받았는지 */
  heard = false;
  /** 상대가 승부를 마치고 나갔습니다. 이후의 침묵은 끊김이 아닙니다. */
  private finished = false;
  private ch: Channel; private timer: number; private born = performance.now(); private last = performance.now(); private lastTick = performance.now(); private dead = false; private connected = false;
  private round = 0; private army: Placement[] = [];
  constructor(readonly session: PvpSession, private hooks: SquadHooks) {
    this.ch = session.open(m => this.onMsg(m));
    void this.ch.ready.then(() => { if (this.dead) return; this.connected = true; this.tick(); }, () => this.gone('never'));
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }
  /** 내 배치를 제출합니다. 상대가 늦게 접속해도 받도록 2초마다 다시 보냅니다. */
  setArmy(round: number, army: Placement[]): void { this.round = round; this.army = army.map(p => ({ type: p.type, x: p.x, y: p.y })); this.send(); }
  clearArmy(): void { this.round = 0; this.army = []; }
  bye(): void { this.ch.send({ t: 'bye' }); }
  /** finished=true: 승부가 난 뒤에 나가는 것이므로 상대가 기권승으로 처리하지 않습니다. */
  dispose(finished = false): void {
    if (this.dead) return;
    this.dead = true; window.clearInterval(this.timer);
    try { this.ch.send({ t: 'bye', fin: finished }); } catch { /* an already-closed transport is fine */ }
    try { this.ch.close(); } catch { /* cleanup must never block leaving the game */ }
  }
  private send(): void {
    if (this.dead || !this.connected) return;
    try { this.ch.send(this.round ? { t: 'army', r: this.round, a: this.army } : { t: 'hb' }); }
    catch { this.gone('never'); }
  }
  private gone(reason: 'bye' | 'silent' | 'never'): void {
    if (this.dead) return;
    this.dead = true; window.clearInterval(this.timer);
    try { this.ch.close(); } catch { /* connection may already be closed */ }
    this.hooks.onGone(reason);
  }
  private tick(): void {
    if (this.dead) return; const now = performance.now();
    if (!this.connected) { if (now - this.born > NEVER_MS) this.gone('never'); return; }
    if (now - this.lastTick > 2 * TICK_MS * 2) this.last = now; // 내 탭이 멈춰 있던 시간은 상대의 침묵으로 세지 않습니다
    this.lastTick = now; this.send();
    if (this.dead) return;
    if (!this.heard) { if (now - this.born > NEVER_MS) this.gone('never'); } else if (!this.finished && now - this.last > SILENT_MS) this.gone('silent');
  }
  private onMsg(m: NetMsg): void {
    if (this.dead || !m || typeof m !== 'object') return;
    // Unknown and malformed packets must not reset the connection watchdog.
    if (m.t === 'army') {
      const round = m.r, army = parseArmy(m.a);
      if (!validRound(round) || !army) return;
      this.last = performance.now(); this.heard = true;
      this.hooks.onArmy(round, army);
    } else if (m.t === 'hb') {
      this.last = performance.now(); this.heard = true;
    } else if (m.t === 'bye') {
      this.last = performance.now(); this.heard = true;
      if (m.fin === true) this.finished = true; else this.gone('bye');
    }
  }
}
