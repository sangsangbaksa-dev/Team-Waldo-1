// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import type { NetMsg } from '../../src/net/types';
import { CityDuel } from '../../src/city/duel';
import { CityRoom } from '../../src/city/room';

function fakeChannel() {
  let onMsg: (m: NetMsg) => void = () => {};
  let resolveReady!: () => void;
  const sent: NetMsg[] = [];
  const ready = new Promise<void>(resolve => { resolveReady = resolve; });
  return {
    open: (listener: (m: NetMsg) => void) => {
      onMsg = listener;
      return { ready, send: (m: NetMsg) => { sent.push(m); }, close: () => {} };
    },
    receive: (m: NetMsg) => onMsg(m),
    resolveReady,
    sent,
  };
}

const pose: NetMsg = { t: 'p', x: 10, y: 20, a: 0, hp: 60, mh: 100, w: 'pistol' };

describe('LAST CITY multiplayer session lifecycle', () => {
  it('ignores packets and pending channel readiness after a duel ends', async () => {
    const net = fakeChannel();
    const hooks = {
      onStart: vi.fn(), onPose: vi.fn(), onShot: vi.fn(), onDeaths: vi.fn(),
      onArmy: vi.fn(), onHqDown: vi.fn(), onChat: vi.fn(), onGone: vi.fn(),
    };
    const session = { host: true, open: net.open } as unknown as ConstructorParameters<typeof CityDuel>[0];
    const duel = new CityDuel(session, 'warlord', hooks);
    duel.started = true;
    net.receive({ t: 'bye' });
    expect(hooks.onGone).toHaveBeenCalledWith('bye');
    net.receive(pose);
    duel.sendPose({ x: 0, y: 0, a: 0, hp: 1, mh: 1, w: 'pistol' }, 999);
    duel.sendHqDown();
    expect(hooks.onPose).not.toHaveBeenCalled();
    expect(net.sent).toHaveLength(0);
    duel.dispose();
    net.resolveReady();
    await Promise.resolve();
    expect(net.sent).toHaveLength(0);
  });

  it('ignores late room packets and sends after leaving a multiplayer room', async () => {
    const net = fakeChannel();
    const hooks = {
      onStart: vi.fn(), onPose: vi.fn(), onShot: vi.fn(), onDeaths: vi.fn(),
      onHqDown: vi.fn(), onChat: vi.fn(), onGone: vi.fn(), onAbort: vi.fn(),
    };
    const session = {
      host: true, me: { id: 'me' }, players: [{ id: 'me' }, { id: 'op' }],
      room: { host_id: 'me' }, open: net.open,
    } as unknown as ConstructorParameters<typeof CityRoom>[0];
    const room = new CityRoom(session, 'warlord', hooks);
    room.started = true;
    net.receive({ ...pose, f: 'op' });
    expect(hooks.onPose).toHaveBeenCalledTimes(1);
    room.dispose();
    net.receive({ ...pose, f: 'op' });
    room.sendHqDown();
    room.sendChat('hello');
    expect(hooks.onPose).toHaveBeenCalledTimes(1);
    expect(net.sent).toHaveLength(0);
    net.resolveReady();
    await Promise.resolve();
    expect(net.sent).toHaveLength(0);
  });
});
