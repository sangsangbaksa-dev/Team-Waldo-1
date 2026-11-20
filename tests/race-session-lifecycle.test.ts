import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RacePvp } from '../src/race/pvp';
import { RaceMulti } from '../src/race/multi';
import { CARS } from '../src/race/config';
import type { PvpSession, RoomSession } from '../src/net/lobby';
import type { Channel, NetMsg } from '../src/net/types';

const car = CARS[0].id;
function channelFixture() {
  let handler: (m: NetMsg) => void = () => {};
  let connect!: () => void;
  const send = vi.fn<(m: NetMsg) => void>(), close = vi.fn<() => void>();
  const ready = new Promise<void>(resolve => { connect = resolve; });
  const open = (h: (m: NetMsg) => void): Channel => { handler = h; return { send, close, ready }; };
  return { open, send, close, connect, emit: (m: NetMsg) => handler(m) };
}

describe('SPEED RUSH online session lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval });
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('retries the host start message without restarting the host race', () => {
    const f = channelFixture(), hooks = { onStart: vi.fn(), onSnap: vi.fn(), onFinish: vi.fn(), onGone: vi.fn() };
    const session = { host: true, open: f.open } as unknown as PvpSession;
    const pvp = new RacePvp(session, car, hooks);
    f.emit({ t: 'fin', time: 5 }); expect(hooks.onFinish).not.toHaveBeenCalled();
    f.emit({ t: 'hello', car }); f.emit({ t: 'hello', car });
    expect(f.send.mock.calls.filter(([m]) => m.t === 'start')).toHaveLength(2);
    expect(hooks.onStart).toHaveBeenCalledTimes(1);
    pvp.dispose();
  });

  it('does not send or invoke hooks after disposal even if channel readiness arrives late', async () => {
    const f = channelFixture(), hooks = { onStart: vi.fn(), onSnap: vi.fn(), onFinish: vi.fn(), onGone: vi.fn() };
    const pvp = new RacePvp({ host: false, open: f.open } as unknown as PvpSession, car, hooks);
    pvp.dispose(); pvp.dispose();
    f.connect(); await Promise.resolve();
    f.emit({ t: 'start', car }); f.emit({ t: 'fin', time: 5 });
    pvp.sendFinish(6); pvp.bye();
    expect(f.send).not.toHaveBeenCalled();
    expect(f.close).toHaveBeenCalledTimes(1);
    expect(hooks.onStart).not.toHaveBeenCalled(); expect(hooks.onFinish).not.toHaveBeenCalled();
  });

  it('rejects premature finish messages and duplicate or unknown starting participants', () => {
    const f = channelFixture(), hooks = { onStart: vi.fn(), onSnap: vi.fn(), onFinish: vi.fn(), onGone: vi.fn(), onAbort: vi.fn() };
    const session = { host: false, me: { id: 'me' }, room: { host_id: 'host' }, players: [{ id: 'host' }, { id: 'me' }, { id: 'other' }], open: f.open } as unknown as RoomSession;
    const multi = new RaceMulti(session, car, hooks);
    f.emit({ t: 'fin', f: 'host', time: 5 }); expect(hooks.onFinish).not.toHaveBeenCalled();
    f.emit({ t: 'start', f: 'host', list: [{ id: 'me', car }, { id: 'me', car }] }); expect(hooks.onStart).not.toHaveBeenCalled();
    f.emit({ t: 'start', f: 'host', list: [{ id: 'host', car }, { id: 'host', car }, null, { id: 'stranger', car }, { id: 'me', car }] });
    expect(hooks.onStart).toHaveBeenCalledWith([{ id: 'host', car }, { id: 'me', car }]);
    f.emit({ t: 'fin', f: 'other', time: 5 }); expect(hooks.onFinish).not.toHaveBeenCalled();
    f.emit({ t: 'fin', f: 'host', time: 6 }); expect(hooks.onFinish).toHaveBeenCalledWith('host', 6);
    multi.dispose(); multi.dispose();
    f.emit({ t: 'fin', f: 'host', time: 7 }); expect(hooks.onFinish).toHaveBeenCalledTimes(1);
    expect(f.close).toHaveBeenCalledTimes(1);
  });
});
