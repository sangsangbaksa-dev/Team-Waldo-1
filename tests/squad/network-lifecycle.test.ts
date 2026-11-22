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
