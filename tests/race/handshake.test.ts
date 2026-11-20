// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import type { PvpSession } from '../../src/net/lobby';
import type { NetMsg } from '../../src/net/types';
import { RacePvp } from '../../src/race/pvp';

describe('SPEED RUSH 연결 복구', () => {
  it('첫 출발 패킷이 유실되어도 게스트 hello 로 복구한다', async () => {
    vi.useFakeTimers();
    const handlers: Array<(m: NetMsg) => void> = [];
    let dropped = false;
    const session = (i: number) => ({
      host: i === 0,
      open: (handler: (m: NetMsg) => void) => {
        handlers[i] = handler;
        return { ready: Promise.resolve(), close: () => undefined, send: (m: NetMsg) => {
          if (m.t === 'start' && !dropped) { dropped = true; return; }
          queueMicrotask(() => handlers[1 - i]?.(m));
        } };
      },
    }) as unknown as PvpSession;
    const hooks = () => ({ onStart: vi.fn(), onSnap: vi.fn(), onFinish: vi.fn(), onGone: vi.fn() });
    const ha = hooks(), hb = hooks();
    const a = new RacePvp(session(0), 'arc', ha), b = new RacePvp(session(1), 'bolt', hb);
    try {
      for (let i = 0; i < 8; i++) await Promise.resolve();
      expect(dropped).toBe(true);
      expect(a.started).toBe(true);
      expect(b.started).toBe(false);
      vi.advanceTimersByTime(500);
      for (let i = 0; i < 8; i++) await Promise.resolve();
      expect(b.started).toBe(true);
      expect(ha.onStart).toHaveBeenCalledExactlyOnceWith('bolt');
      expect(hb.onStart).toHaveBeenCalledExactlyOnceWith('arc');
    } finally { a.dispose(); b.dispose(); vi.useRealTimers(); }
  });
});
