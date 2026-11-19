// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NetMsg } from '../../src/net/types';
import { Sim } from '../../src/outlaw/sim';
import { PLAYER_ID } from '../../src/outlaw/types';
import { Versus, type VsResult } from '../../src/outlaw/versus';

const players = [{ id: 'a', nickname: 'Alpha' }, { id: 'b', nickname: 'Bravo' }, { id: 'c', nickname: 'Charlie' }];
const openMatches: Versus[] = [];
let clock = 0;

function match(duel: boolean, offline = false) {
  const participants = duel ? players.slice(0, 2) : players;
  const handlers = new Map<string, (message: NetMsg) => void>();
  const sent: Array<{ sender: string; message: NetMsg }> = [];
  const clients = participants.map(({ id }) => {
    const sim = new Sim(20260101);
    const onEnd = vi.fn<(result: VsResult) => void>();
    const report = vi.fn<(winner: string) => void>();
    const versus = new Versus(sim, {
      meId: id, players: participants, duel, report,
      open(handler) {
        handlers.set(id, handler);
        return {
          ready: offline ? Promise.reject(new Error('offline')) : Promise.resolve(),
          send: message => { sent.push({ sender: id, message }); },
          close: () => { handlers.delete(id); },
        };
      },
    }, { onEnd, onFeed: vi.fn(), onGone: vi.fn() });
    openMatches.push(versus);
    return { sim, versus, onEnd, report, update: () => versus.update(1 / 60, sim.drain()) };
  });
  const flush = () => {
    for (const { sender, message } of sent.splice(0)) {
      for (const [receiver, handler] of handlers) if (receiver !== sender) handler(message);
    }
  };
  return { clients, handlers, sent, flush };
}

beforeEach(() => {
  clock = 0;
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});

afterEach(() => {
  for (const versus of openMatches.splice(0)) versus.dispose();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('OUTLAW CITY online', () => {
  it('relays lethal damage to its owner, attributes deaths once, and reports the same winner from both clients', async () => {
    const { clients: [alpha, bravo], handlers, sent, flush } = match(true);
    await Promise.resolve();
    flush();
    const proxy = alpha.sim.peds.find(p => p.name === 'Bravo')!;

    alpha.sim.damagePed(proxy, 200, 0, 'vehicle');
    flush();
    expect(bravo.sim.player.hp).toBe(100);

    let previousHit: NetMsg | undefined;
    for (let kill = 1; kill <= alpha.versus.killLimit; kill++) {
      alpha.sim.damagePed(proxy, 200, PLAYER_ID, 'sniper');
      previousHit ??= sent[0]?.message;
      flush();
      expect(proxy.alive).toBe(true);
      expect(bravo.sim.player.alive).toBe(false);

      bravo.update();
      const death = sent.find(({ message }) => message.t === 'k')!.message;
      expect(sent.some(({ message }) => message.t === 'bye')).toBe(false);
      flush();
      handlers.get('a')?.(death);
      expect(alpha.versus.board()[0]).toMatchObject({ id: 'a', kills: kill });

      if (kill < alpha.versus.killLimit) {
        bravo.sim.respawnPlayer('wasted');
        handlers.get('b')?.(previousHit!);
        expect(bravo.sim.player.hp).toBe(100);
        clock += 100;
        bravo.update();
        flush();
      }
    }
    for (const client of [alpha, bravo]) {
      expect(client.onEnd).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ reason: 'score', winner: 'a' }));
      expect(client.report).toHaveBeenCalledExactlyOnceWith('a');
    }
    expect(sent.some(({ message }) => message.t === 'bye')).toBe(false);
  });

  it('keeps a room active after the first departure and ends it after the last opponent leaves', async () => {
    const { clients: [alpha, bravo, charlie], flush } = match(false);
    await Promise.resolve();
    bravo.versus.dispose();
    flush();
    expect(alpha.onEnd).not.toHaveBeenCalled();
    expect(alpha.sim.peds.some(p => p.name === 'Bravo')).toBe(false);
    charlie.versus.dispose();
    flush();
    expect(alpha.onEnd).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ reason: 'left', winner: 'a' }));
    expect(alpha.report).not.toHaveBeenCalled();
  });

  it('ends a tied duel when the clock elapses between frames', async () => {
    const { clients: [alpha, bravo] } = match(true);
    await Promise.resolve();
    clock += 360001;
    for (const client of [alpha, bravo]) {
      client.update();
      expect(client.onEnd).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ reason: 'time', winner: '' }));
      expect(client.report).not.toHaveBeenCalled();
    }
  });

  it('shows a connection failure without awarding rating', async () => {
    const { clients: [alpha, bravo] } = match(true, true);
    await Promise.resolve();
    for (const client of [alpha, bravo]) {
      expect(client.onEnd).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ reason: 'connection', winner: '' }));
      expect(client.report).not.toHaveBeenCalled();
    }
  });

  it('awards no forfeit when the other client never reaches the match', async () => {
    const { clients: [alpha, bravo] } = match(true);
    await Promise.resolve();
    // The channel subscribes locally, but the other client never delivers a handshake.
    for (let second = 1; second <= 21; second++) {
      clock = second * 1000;
      vi.advanceTimersByTime(1000);
    }
    for (const client of [alpha, bravo]) {
      expect(client.onEnd).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ reason: 'connection', winner: '' }));
      expect(client.report).not.toHaveBeenCalled();
    }
  });
});
