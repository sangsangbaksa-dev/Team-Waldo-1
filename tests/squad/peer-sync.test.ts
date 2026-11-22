// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { SquadPvp } from '../../src/squad/net';
import type { Placement, Side } from '../../src/squad/sim';
import type { PvpSession } from '../../src/net/lobby';
import type { NetMsg } from '../../src/net/types';

afterEach(() => vi.useRealTimers());

it('synchronizes two peers and resends an immutable placement snapshot', async () => {
  vi.useFakeTimers();
  const inbox: [Array<{ round: number; army: Placement[] }>, Array<{ round: number; army: Placement[] }>] = [[], []];
  const receivers: [((m: NetMsg) => void) | undefined, ((m: NetMsg) => void) | undefined] = [undefined, undefined];
  const closes = [vi.fn(), vi.fn()] as const;
  const sessionFor = (side: Side): PvpSession => ({
    open(handler: (msg: NetMsg) => void) {
      receivers[side] = handler;
      const other = (1 - side) as Side;
      return { ready: Promise.resolve(), send: (m: NetMsg) => { receivers[other]?.(m); }, close: closes[side] };
    },
  }) as unknown as PvpSession;
  const net0 = new SquadPvp(sessionFor(0), {
    onArmy: (round, army) => inbox[0].push({ round, army }), onGone: vi.fn(),
  });
  const net1 = new SquadPvp(sessionFor(1), {
    onArmy: (round, army) => inbox[1].push({ round, army }), onGone: vi.fn(),
  });
  await Promise.resolve();
  const blue: Placement[] = [{ type: 'guard', x: 5, y: 11 }];
  const red: Placement[] = [{ type: 'archer', x: 5, y: 8 }];
  net0.setArmy(1, blue);
  net1.setArmy(1, red);
  expect(inbox[0][0]).toEqual({ round: 1, army: red });
  expect(inbox[1][0]).toEqual({ round: 1, army: blue });

  // The UI may later mutate its local placement array, but retries must use
  // the exact formation that was submitted to the opponent.
  blue[0]!.x = 0;
  vi.advanceTimersByTime(2000);
  expect(inbox[1].at(-1)?.army[0]!.x).toBe(5);
  net0.dispose(true); net1.dispose(true);
  expect(closes[0]).toHaveBeenCalledTimes(1);
  expect(closes[1]).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
