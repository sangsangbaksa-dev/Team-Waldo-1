import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RaceMulti } from '../../src/race/multi';
import { RacePvp } from '../../src/race/pvp';

type Message = Record<string, unknown>;

function mockChannel() {
  let receive: (message: Message) => void = () => undefined;
  const send = vi.fn();
  const open = (handler: (message: Message) => void) => {
    receive = handler;
    return { ready: Promise.resolve(), send, close: vi.fn() };
  };
  return { open, send, deliver: (message: Message) => receive(message) };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('SPEED RUSH online race sessions', () => {
  function hostRoom() {
    const channel = mockChannel();
    const session = {
      host: true,
      me: { id: 'host' },
      room: { host_id: 'host' },
      players: [{ id: 'host' }, { id: 'a' }, { id: 'b' }],
      open: channel.open,
    } as unknown as ConstructorParameters<typeof RaceMulti>[0];
    return { channel, session };
  }

  it('does not start a room with a player who left before the grid was formed', () => {
    const { channel, session } = hostRoom();
    const onStart = vi.fn();
    const net = new RaceMulti(session, 'arc', {
      onStart, onSnap: vi.fn(), onFinish: vi.fn(), onGone: vi.fn(), onAbort: vi.fn(),
    });
    channel.deliver({ t: 'hello', f: 'a', car: 'bolt' });
    channel.deliver({ t: 'hello', f: 'b', car: 'rally' });
    channel.deliver({ t: 'bye', f: 'b' });
    channel.deliver({ t: 'hello', f: 'b', car: 'rally' }); // 늦게 도착한 이전 인사도 무시
    vi.advanceTimersByTime(500);
    expect(onStart).not.toHaveBeenCalled();
    vi.advanceTimersByTime(12_000);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith([{ id: 'host', car: 'arc' }, { id: 'a', car: 'bolt' }]);
    net.dispose();
  });

  it('uses the first valid finish time from a room opponent', () => {
    const { channel, session } = hostRoom();
    const onFinish = vi.fn();
    const net = new RaceMulti(session, 'arc', {
      onStart: vi.fn(), onSnap: vi.fn(), onFinish, onGone: vi.fn(), onAbort: vi.fn(),
    });
    channel.deliver({ t: 'hello', f: 'a', car: 'bolt' });
    channel.deliver({ t: 'hello', f: 'b', car: 'rally' });
    vi.advanceTimersByTime(500);
    expect(net.started).toBe(true);
    channel.deliver({ t: 'fin', f: 'a', time: -1 });
    channel.deliver({ t: 'fin', f: 'a', time: 42 });
    channel.deliver({ t: 'fin', f: 'a', time: 21 });
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith('a', 42);
    net.dispose();
  });

  it('uses the first valid finish time from a duel opponent', () => {
    const channel = mockChannel();
    const session = { host: false, open: channel.open } as unknown as ConstructorParameters<typeof RacePvp>[0];
    const onFinish = vi.fn();
    const net = new RacePvp(session, 'arc', {
      onStart: vi.fn(), onSnap: vi.fn(), onFinish, onGone: vi.fn(),
    });
    channel.deliver({ t: 'start', car: 'bolt' });
    expect(net.started).toBe(true);
    channel.deliver({ t: 'fin', time: NaN });
    channel.deliver({ t: 'fin', time: 52 });
    channel.deliver({ t: 'fin', time: 24 });
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(52);
    net.dispose();
  });
});
