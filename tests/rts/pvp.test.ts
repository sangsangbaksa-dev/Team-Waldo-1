// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RtsNet, type NetSession } from '../../src/rts/pvp';
import { RtsSim } from '../../src/rts/sim';
import type { Channel, NetMsg } from '../../src/net/types';

/** 메모리 안의 두 채널. loss 확률로 메시지를 떨어뜨립니다. */
function link(loss = 0): [NetSession, NetSession] {
  const handlers: Array<(m: NetMsg) => void> = []; let seed = 12345; const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const make = (me: number, host: boolean): NetSession => ({ host, open(h): Channel { handlers[me] = h; return { ready: Promise.resolve(), send: m => { if (rnd() < loss) return; const copy = JSON.parse(JSON.stringify(m)) as NetMsg; queueMicrotask(() => handlers[1 - me]?.(copy)); }, close: () => undefined }; } });
  return [make(0, true), make(1, false)];
}
async function drive(a: RtsNet, sa: RtsSim, b: RtsNet, sb: RtsSim, frames: number, each?: (f: number) => void): Promise<void> {
  for (let f = 0; f < frames; f++) { each?.(f); a.pump(sa, 0.05, () => undefined); b.pump(sb, 0.05, () => undefined); vi.advanceTimersByTime(50); await Promise.resolve(); await Promise.resolve(); }
}
const hq = (s: RtsSim, p: number) => s.buildings.find(b => b.owner === p && b.kind === 'hq')!;
const hooks = () => ({ onGone: vi.fn(), onDesync: vi.fn() });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('FRONTLINE 락스텝', () => {
  it('두 쪽이 같은 명령을 같은 틱에 실행해 같은 상태가 된다', async () => {
    const [sa, sb] = link(), ha = hooks(), hb = hooks(), A = new RtsSim(), B = new RtsSim(); A.record = B.record = false;
    const a = new RtsNet(sa, ha), b = new RtsNet(sb, hb); await Promise.resolve();
    await drive(a, A, b, B, 400, f => {
      if (f === 5) { a.send({ k: 'train', b: hq(A, 0).id, u: 'worker' }); a.send({ k: 'build', id: A.units.find(u => u.owner === 0)!.id, b: 'depot', x: hq(A, 0).x + 6, y: hq(A, 0).y - 5 }); }
      if (f === 9) b.send({ k: 'move', ids: B.units.filter(u => u.owner === 1).map(u => u.id), x: 60, y: 30 });
    });
    expect(A.tick).toBeGreaterThan(300); expect(Math.abs(A.tick - B.tick)).toBeLessThanOrEqual(6);
    while (A.tick < B.tick) A.step(); while (B.tick < A.tick) B.step();
    expect(A.hash()).toBe(B.hash());
    expect(A.buildings.some(x => x.kind === 'depot')).toBe(true); expect(ha.onDesync).not.toHaveBeenCalled(); expect(hb.onDesync).not.toHaveBeenCalled();
    a.dispose(); b.dispose();
  });
  it('메시지가 3분의 1쯤 사라져도 복구되어 계속 진행한다', async () => {
    const [sa, sb] = link(0.33), A = new RtsSim(), B = new RtsSim(); A.record = B.record = false;
    const a = new RtsNet(sa, hooks()), b = new RtsNet(sb, hooks()); await Promise.resolve();
    await drive(a, A, b, B, 900, f => { if (f % 40 === 5) a.send({ k: 'train', b: hq(A, 0).id, u: 'worker' }); });
    expect(A.tick).toBeGreaterThan(250);
    while (A.tick < B.tick) A.step(); while (B.tick < A.tick) B.step();
    expect(A.hash()).toBe(B.hash()); a.dispose(); b.dispose();
  });
  it('상대가 없으면 시작하지 않고, 상대가 나가면 알린다', async () => {
    const [sa, sb] = link(), ha = hooks(), A = new RtsSim(); const a = new RtsNet(sa, ha), b = new RtsNet(sb, hooks()); for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(a.started).toBe(true); b.bye(); await Promise.resolve(); await Promise.resolve();
    expect(ha.onGone).toHaveBeenCalledWith('bye'); expect(a.pump(A, 1, () => undefined)).toBe(0); a.dispose(); b.dispose();
  });
  it('두 쪽의 상태가 어긋나면 동기화 오류를 알린다', async () => {
    const [sa, sb] = link(), ha = hooks(), hb = hooks(), A = new RtsSim(), B = new RtsSim(); A.record = B.record = false;
    const a = new RtsNet(sa, ha), b = new RtsNet(sb, hb); await Promise.resolve();
    await drive(a, A, b, B, 60);
    B.players[1].minerals += 7; // 한 쪽이 몰래 달라짐
    await drive(a, A, b, B, 400);
    expect(ha.onDesync.mock.calls.length + hb.onDesync.mock.calls.length).toBeGreaterThan(0);
    a.dispose(); b.dispose();
  });
  it('연결이 끊겨 조용해지면 알린다', async () => {
    const [sa, sb] = link(), ha = hooks(), A = new RtsSim(), B = new RtsSim(); const a = new RtsNet(sa, ha), b = new RtsNet(sb, hooks()); await Promise.resolve();
    await drive(a, A, b, B, 40); b.dispose(); vi.advanceTimersByTime(12000);
    expect(ha.onGone).toHaveBeenCalledWith('silent'); a.dispose();
  });
});
