// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PvpSession, RoomSession } from '../../src/net/lobby';
import type { Channel, NetMsg } from '../../src/net/types';
import { RacePvp, type PvpHooks } from '../../src/race/pvp';
import { RaceMulti, type MultiHooks } from '../../src/race/multi';
import { encodeSnap, type Snap } from '../../src/race/netcar';
import { newCar } from '../../src/race/physics';
import { buildTrack } from '../../src/race/track';

interface FakeLink {
  messages: NetMsg[];
  channel: Channel;
  open(receive: (msg: NetMsg) => void): Channel;
  deliver(msg: NetMsg): void;
}
function fakeLink(): FakeLink {
  const messages: NetMsg[] = [];
  let receive: (msg: NetMsg) => void = () => undefined;
  const channel: Channel = { ready: Promise.resolve(), send: message => { messages.push(message); }, close: vi.fn() };
  return { messages, channel, open: cb => { receive = cb; return channel; }, deliver: msg => receive(msg) };
}
const account = (id: string) => ({ id, nickname: id, email: id + '@example.invalid' });
function pvpSession(host: boolean, wire: FakeLink): PvpSession {
  return { host, me: account(host ? 'host' : 'guest'), opponent: { id: host ? 'guest' : 'host', nickname: 'Rival' },
    open: (cb: (message: NetMsg) => void) => wire.open(cb) } as unknown as PvpSession;
}
function roomSession(host: boolean, wire: FakeLink): RoomSession {
  const players = ['host', 'guest', 'third'].map(id => ({ id, nickname: id }));
  return { host, me: account(host ? 'host' : 'guest'), players, room: { host_id: 'host' },
    open: (cb: (message: NetMsg) => void) => wire.open(cb) } as unknown as RoomSession;
}
function pvpHooks(): PvpHooks {
  return { onStart: vi.fn(), onSnap: vi.fn(), onFinish: vi.fn(), onGone: vi.fn() };
}
function multiHooks(): MultiHooks {
  return { onStart: vi.fn(), onSnap: vi.fn(), onFinish: vi.fn(), onGone: vi.fn(), onAbort: vi.fn() };
}
const tick = (connection: RacePvp | RaceMulti) => (connection as unknown as { tick(): void }).tick();

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('SPEED RUSH network channel lifecycle', () => {
  it('reports a local channel rejection as a pre-start failure, not a completed race', async () => {
    const wire = fakeLink(), hooks = pvpHooks();
    wire.channel.ready = Promise.reject(new Error('websocket unavailable'));
    const pvp = new RacePvp(pvpSession(true, wire), 'arc', hooks);
    try {
      await Promise.resolve();
      await Promise.resolve();
      expect(hooks.onGone).toHaveBeenCalledExactlyOnceWith('never');
      expect(pvp.started).toBe(false);
      expect(hooks.onStart).not.toHaveBeenCalled();
      expect(wire.messages.filter(m => m.t === 'start')).toHaveLength(0);
    } finally { pvp.dispose(); }
  });

  it('keeps a pre-start goodbye separate from an in-progress departure', async () => {
    const wire = fakeLink(), hooks = pvpHooks();
    const pvp = new RacePvp(pvpSession(true, wire), 'arc', hooks);
    try {
      await Promise.resolve();
      wire.deliver({ t: 'bye' });
      expect(pvp.started).toBe(false);
      expect(hooks.onGone).toHaveBeenCalledExactlyOnceWith('bye');
    } finally { pvp.dispose(); }
  });

  it('host sends one start per hello but enters the race only once', async () => {
    const wire = fakeLink(), hooks = pvpHooks(), pvp = new RacePvp(pvpSession(true, wire), 'arc', hooks);
    try {
      await Promise.resolve();
      expect(wire.messages).toContainEqual({ t: 'hello', car: 'arc' });
      wire.deliver({ t: 'hello', car: 'bolt' });
      wire.deliver({ t: 'hello', car: 'orbit' });
      expect(pvp.started).toBe(true);
      expect(hooks.onStart).toHaveBeenCalledExactlyOnceWith('bolt');
      expect(wire.messages.filter(m => m.t === 'start')).toHaveLength(2);
    } finally { pvp.dispose(); }
  });

  it('guest accepts only validated remote state and finish packets', async () => {
    const wire = fakeLink(), hooks = pvpHooks(), pvp = new RacePvp(pvpSession(false, wire), 'arc', hooks);
    try {
      await Promise.resolve();
      wire.deliver({ t: 'start', car: 'nonexistent' });
      wire.deliver({ t: 'start', car: 'rally' });
      expect(hooks.onStart).toHaveBeenCalledExactlyOnceWith('arc');
      const valid: Snap = encodeSnap(newCar(buildTrack(), 40, 1));
      wire.deliver({ t: 's', c: valid });
      wire.deliver({ t: 's', c: [Infinity, 1] });
      expect(hooks.onSnap).toHaveBeenCalledExactlyOnceWith(valid);
      for (const time of [-1, Infinity, 3601, '25', null]) wire.deliver({ t: 'fin', time });
      expect(hooks.onFinish).not.toHaveBeenCalled();
      wire.deliver({ t: 'fin', time: 78.2 });
      expect(hooks.onFinish).toHaveBeenCalledExactlyOnceWith(78.2);
      wire.deliver({ t: 'bye' });
      wire.deliver({ t: 'fin', time: 15 });
      expect(hooks.onGone).toHaveBeenCalledExactlyOnceWith('bye');
      expect(hooks.onFinish).toHaveBeenCalledTimes(1);
    } finally { pvp.dispose(); }
  });

  it('room host gathers only known participants and launches once', async () => {
    const wire = fakeLink(), hooks = multiHooks(), multi = new RaceMulti(roomSession(true, wire), 'arc', hooks);
    try {
      await Promise.resolve();
      wire.deliver({ t: 'hello', f: 'intruder', car: 'rally' });
      wire.deliver({ t: 'hello', f: 'guest', car: 'bolt' });
      wire.deliver({ t: 'hello', f: 'third', car: 'fuse' });
      tick(multi);
      expect(hooks.onStart).toHaveBeenCalledExactlyOnceWith([
        { id: 'host', car: 'arc' }, { id: 'guest', car: 'bolt' }, { id: 'third', car: 'fuse' },
      ]);
      wire.deliver({ t: 'hello', f: 'guest', car: 'slide' });
      expect(hooks.onStart).toHaveBeenCalledTimes(1);
      expect(wire.messages.filter(m => m.t === 'start')).toHaveLength(2);
    } finally { multi.dispose(); }
  });

  it('excludes pre-start leavers instead of launching disconnected cars', async () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const wire = fakeLink(), hooks = multiHooks(), multi = new RaceMulti(roomSession(true, wire), 'arc', hooks);
    try {
      await Promise.resolve();
      wire.deliver({ t: 'hello', f: 'guest', car: 'bolt' });
      wire.deliver({ t: 'hello', f: 'third', car: 'fuse' });
      wire.deliver({ t: 'bye', f: 'third' });
      wire.deliver({ t: 'hello', f: 'third', car: 'fuse' });
      expect(hooks.onGone).toHaveBeenCalledExactlyOnceWith('third');
      for (let i = 0; i < 26; i++) { now += 500; tick(multi); }
      expect(hooks.onStart).toHaveBeenCalledTimes(1);
      const rows = vi.mocked(hooks.onStart).mock.calls[0][0];
      expect(rows.map(r => r.id)).toEqual(['host', 'guest']);
      expect(rows.some(r => r.id === 'third')).toBe(false);
    } finally { multi.dispose(); }
  });

  it('immediately aborts an unstarted room when the host departs', async () => {
    const wire = fakeLink(), hooks = multiHooks(), multi = new RaceMulti(roomSession(false, wire), 'arc', hooks);
    try {
      await Promise.resolve();
      wire.deliver({ t: 'bye', f: 'host' });
      expect(hooks.onAbort).toHaveBeenCalledTimes(1);
      expect(hooks.onStart).not.toHaveBeenCalled();
      wire.deliver({ t: 'start', f: 'host', list: [{ id: 'host', car: 'arc' }, { id: 'guest', car: 'bolt' }] });
      expect(hooks.onStart).not.toHaveBeenCalled();
    } finally { multi.dispose(); }
  });

  it('room guest rejects a spoofed start and unknown player messages', async () => {
    const wire = fakeLink(), hooks = multiHooks(), multi = new RaceMulti(roomSession(false, wire), 'arc', hooks);
    try {
      await Promise.resolve();
      const list = [{ id: 'host', car: 'arc' }, { id: 'guest', car: 'bolt' }];
      wire.deliver({ t: 'start', f: 'third', list });
      wire.deliver({ t: 'start', f: 'host', list: [{ id: 'host', car: 'arc' }] });
      expect(hooks.onStart).not.toHaveBeenCalled();
      wire.deliver({ t: 'start', f: 'host', list });
      expect(hooks.onStart).toHaveBeenCalledExactlyOnceWith(list);
      wire.deliver({ t: 'fin', f: 'intruder', time: 30 });
      wire.deliver({ t: 'fin', f: 'third', time: 30 });
      wire.deliver({ t: 'fin', f: 'host', time: 3601 });
      expect(hooks.onFinish).not.toHaveBeenCalled();
      wire.deliver({ t: 'fin', f: 'host', time: 49.5 });
      expect(hooks.onFinish).toHaveBeenCalledExactlyOnceWith('host', 49.5);
      wire.deliver({ t: 'bye', f: 'host' });
      wire.deliver({ t: 'bye', f: 'host' });
      expect(hooks.onGone).toHaveBeenCalledExactlyOnceWith('host');
    } finally { multi.dispose(); }
  });

  it('pausing an unstarted duel does not trigger the 25-second connection timeout', async () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const wire = fakeLink(), hooks = pvpHooks(), pvp = new RacePvp(pvpSession(false, wire), 'arc', hooks);
    try {
      await Promise.resolve();
      now += 30_000; tick(pvp); // throttled browser timer after background suspension
      expect(hooks.onGone).not.toHaveBeenCalled();
      for (let i = 0; i < 20; i++) { now += 500; tick(pvp); }
      expect(hooks.onGone).not.toHaveBeenCalled();
      wire.deliver({ t: 'start', car: 'bolt' });
      expect(hooks.onStart).toHaveBeenCalledExactlyOnceWith('bolt');
    } finally { pvp.dispose(); }
  });

  it('pausing an unfinished room does not immediately force a partial launch', async () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const wire = fakeLink(), hooks = multiHooks(), multi = new RaceMulti(roomSession(true, wire), 'arc', hooks);
    try {
      await Promise.resolve();
      wire.deliver({ t: 'hello', f: 'guest', car: 'bolt' });
      now += 30_000; tick(multi);
      expect(hooks.onStart).not.toHaveBeenCalled();
      expect(hooks.onAbort).not.toHaveBeenCalled();
      for (let i = 0; i < 26; i++) { now += 500; tick(multi); }
      expect(hooks.onStart).toHaveBeenCalledTimes(1);
      const participants = (hooks.onStart as ReturnType<typeof vi.fn>).mock.calls[0][0] as Array<{ id: string }>;
      expect(participants.map(x => x.id)).toEqual(['host', 'guest']);
    } finally { multi.dispose(); }
  });
});
