import { describe, expect, it, vi } from 'vitest';
import { advanceMatchChunk, FAST_FORWARD } from '../../src/shooter/fast-forward';

describe('ZERO ZONE spectator fast forward', () => {
  it('limits work per animation frame instead of blocking the UI for an entire match', () => {
    const match = { over: false, step: vi.fn(), drain: vi.fn() };
    const done = advanceMatchChunk(match, 18000, () => 0);
    expect(done).toBe(FAST_FORWARD.maxStepsPerFrame);
    expect(match.step).toHaveBeenCalledTimes(FAST_FORWARD.maxStepsPerFrame);
    expect(match.drain).toHaveBeenCalledTimes(done);
    expect(match.step).toHaveBeenCalledWith(FAST_FORWARD.stepSeconds);
  });

  it('stops at the time budget even when many simulated steps remain', () => {
    let now = 0;
    const match = { over: false, step: vi.fn(), drain: vi.fn() };
    const done = advanceMatchChunk(match, 500, () => (now += 4));
    expect(done).toBe(2);
    expect(match.drain).toHaveBeenCalledTimes(2);
  });

  it('stops as soon as the winner is known', () => {
    let steps = 0;
    const match = { over: false, step: vi.fn(), drain: vi.fn() };
    match.step.mockImplementation(() => { if (++steps === 3) match.over = true; });
    expect(advanceMatchChunk(match, 90, () => 0)).toBe(3);
    expect(advanceMatchChunk(match, 90, () => 0)).toBe(0);
    expect(match.drain).toHaveBeenCalledTimes(3);
  });

  it('does nothing with no remaining steps or an invalid budget', () => {
    const match = { over: false, step: vi.fn(), drain: vi.fn() };
    for (const remaining of [0, -1, Number.NaN, Infinity]) expect(advanceMatchChunk(match, remaining)).toBe(0);
    expect(match.step).not.toHaveBeenCalled();
  });
});
