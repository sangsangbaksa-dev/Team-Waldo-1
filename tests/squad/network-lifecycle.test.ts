// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { SquadPvp } from '../../src/squad/net';
import type { PvpSession } from '../../src/net/lobby';
import type { NetMsg } from '../../src/net/types';

afterEach(() => { vi.useRealTimers(); });

it('closes an abandoned PVP channel once and ignores late messages', async () => {
  vi.useFakeTimers();
  let receive: (msg: NetMsg) => void = () => undefined;
  const channel = { ready: Promise.resolve(), send: vi.fn(), close: vi.fn() };
  const session = {
    open(handler: (msg: NetMsg) => void) { receive = handler; return channel; },
  } as unknown as PvpSession;
  const onArmy = vi.fn(), onGone = vi.fn();
  const net = new SquadPvp(session, { onArmy, onGone });
  await Promise.resolve();
  receive(null as unknown as NetMsg);
  receive('garbage' as unknown as NetMsg);
  receive({ t: 'unknown' });
  receive({ t: 'army', r: 1, a: [{ type: 'invalid', x: 0, y: 1 }] });
  receive({ t: 'army', r: 9999, a: [{ type: 'guard', x: 0, y: 1 }] });
  expect(net.heard).toBe(false);
  receive({ t: 'bye', fin: false });
  expect(onGone).toHaveBeenCalledExactlyOnceWith('bye');
  expect(channel.close).toHaveBeenCalledTimes(1);
  receive({ t: 'army', r: 1, a: [{ type: 'guard', x: 4, y: 4 }] });
  expect(onArmy).not.toHaveBeenCalled();
  net.dispose();
  vi.advanceTimersByTime(10_000);
  expect(channel.close).toHaveBeenCalledTimes(1);
  expect(channel.send).toHaveBeenCalledTimes(1);
});

it('closes the channel when its connection setup fails', async () => {
  vi.useFakeTimers();
  const channel = { ready: Promise.reject(new Error('offline')), send: vi.fn(), close: vi.fn() };
  const session = { open: () => channel } as unknown as PvpSession;
  const onGone = vi.fn();
  const net = new SquadPvp(session, { onArmy: vi.fn(), onGone });
  await Promise.resolve();
  expect(onGone).toHaveBeenCalledExactlyOnceWith('never');
  expect(channel.close).toHaveBeenCalledTimes(1);
  net.dispose();
  expect(channel.close).toHaveBeenCalledTimes(1);
});

it('does not leave a live interval or throw if the transport rejects sends', async () => {
  vi.useFakeTimers();
  const channel = {
    ready: Promise.resolve(),
    send: vi.fn(() => { throw new Error('channel closed'); }),
    close: vi.fn(() => { throw new Error('already closed'); }),
  };
  const session = { open: () => channel } as unknown as PvpSession;
  const onGone = vi.fn();
  const net = new SquadPvp(session, { onArmy: vi.fn(), onGone });
  await Promise.resolve();
  expect(onGone).toHaveBeenCalledExactlyOnceWith('never');
  expect(channel.close).toHaveBeenCalledTimes(1);
  expect(() => net.dispose()).not.toThrow();
  vi.advanceTimersByTime(10_000);
  expect(channel.send).toHaveBeenCalledTimes(1);
});

it('always closes the Squad transport when sending final bye fails', () => {
  vi.useFakeTimers();
  const channel = {
    ready: new Promise<void>(() => undefined),
    send: vi.fn(() => { throw new Error('send failed'); }),
    close: vi.fn(),
  };
  const session = { open: () => channel } as unknown as PvpSession;
  const net = new SquadPvp(session, { onArmy: vi.fn(), onGone: vi.fn() });
  expect(() => net.dispose(true)).not.toThrow();
  expect(channel.close).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
