import { afterEach, describe, expect, it } from 'vitest';
import type { ClientMessage, ServerMessage } from '../src/application/protocol.js';
import { neutralInput } from '../src/domain/combat.js';
import { createWorld } from '../src/domain/world.js';
import { guestLink, hostLink, type Link } from '../src/infrastructure/link.js';

const world = createWorld();
const links: Link[] = [];
afterEach(() => { for (const link of links.splice(0)) link.close(); });

function peer(make: (events: Parameters<typeof guestLink>[0]) => Link) {
  const received: ServerMessage[] = [];
  const state = { opened: false, failure: '', closed: false };
  const link = make({
    opened: () => { state.opened = true; },
    message: message => received.push(message),
    failed: reason => { state.failure = reason; },
    closed: () => { state.closed = true; },
  });
  links.push(link);
  const wait = async <T>(find: () => T | undefined, ms = 6000): Promise<T> => {
    const end = Date.now() + ms;
    for (;;) {
      const value = find();
      if (value !== undefined) return value;
      if (Date.now() > end) throw new Error('Timed out');
      await new Promise(resolve => setTimeout(resolve, 15));
    }
  };
  return {
    link, received, state, wait,
    room: () => received.find(message => message.type === 'room') as Extract<ServerMessage, { type: 'room' }> | undefined,
    latest: () => [...received].reverse().find(message => message.type === 'state') as Extract<ServerMessage, { type: 'state' }> | undefined,
  };
}

describe('relay rooms hosted by a player', () => {
  it('lets a guest join, start a round, and play against the host-run simulation', async () => {
    const host = peer(events => hostLink(world, events, 'local'));
    await host.wait(() => host.state.opened || undefined);
    host.link.send({ type: 'create', name: 'alpha' });
    const hosted = await host.wait(host.room);
    expect(hosted.room.code).toMatch(/^[A-Z2-9]{5}$/);
    expect(hosted.room.host).toBe(hosted.room.self);

    const guest = peer(events => guestLink(events, 'local'));
    guest.link.send({ type: 'join', name: 'bravo', code: hosted.room.code.toLowerCase() });
    const joined = await guest.wait(guest.room);
    expect(joined.room.host).toBe(hosted.room.self);
    await host.wait(() => host.latest()?.state.players.length === 2 || undefined);

    guest.link.send({ type: 'start' } satisfies ClientMessage);
    await new Promise(resolve => setTimeout(resolve, 80));
    expect(host.latest()?.state.phase).toBe('lobby');
    host.link.send({ type: 'start' });
    await guest.wait(() => guest.latest()?.state.phase === 'active' || undefined);

    const mine = guest.latest()!.state.players.find(player => player.id === joined.room.self)!;
    let seq = 0;
    const steer = setInterval(() => guest.link.send({
      type: 'input', seq: ++seq, generation: mine.generation, input: { ...neutralInput(), forward: 1 },
    }), 50);
    const moved = await guest.wait(() => {
      const now = guest.latest()?.state.players.find(player => player.id === joined.room.self);
      return now && Math.hypot(now.position.x - mine.position.x, now.position.z - mine.position.z) > 1 ? now : undefined;
    });
    clearInterval(steer);
    expect(moved.id).toBe(joined.room.self);
    const hostView = host.latest()!.state.players.find(player => player.id === joined.room.self)!;
    expect(hostView).toBeDefined();
  }, 15000);

  it('rejects a late joiner, and a guest hears when the host closes the room', async () => {
    const host = peer(events => hostLink(world, events, 'local'));
    await host.wait(() => host.state.opened || undefined);
    host.link.send({ type: 'create', name: 'alpha' });
    const { room } = await host.wait(host.room);
    const guest = peer(events => guestLink(events, 'local'));
    guest.link.send({ type: 'join', name: 'bravo', code: room.code });
    await guest.wait(guest.room);
    host.link.send({ type: 'start' });
    await guest.wait(() => guest.latest()?.state.phase === 'active' || undefined);
    const late = peer(events => guestLink(events, 'local'));
    late.link.send({ type: 'join', name: 'late', code: room.code });
    const error = await late.wait(() => late.received.find(message => message.type === 'error'));
    expect((error as { message: string }).message).toMatch(/already in a round/);
    host.link.close();
    const closed = await guest.wait(() => guest.received.find(message => message.type === 'error' && /closed/.test(message.message)));
    expect(closed).toBeDefined();
  }, 15000);
});
