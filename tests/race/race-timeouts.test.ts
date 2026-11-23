// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RaceTimeouts } from '../../src/race/race-timeouts';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('SPEED RUSH session-owned result timers', () => {
  it('fires a settled ranking once and removes its completed timer', () => {
    const timers = new RaceTimeouts(), done = vi.fn();
    timers.schedule(600, done);
    expect(timers.size).toBe(1);
    vi.advanceTimersByTime(599);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(done).toHaveBeenCalledTimes(1);
    expect(timers.size).toBe(0);
  });

  it('cancels pending 30s fallbacks and result cards on exit or rematch', () => {
    const timers = new RaceTimeouts(), fallback = vi.fn(), card = vi.fn();
    timers.schedule(30000, fallback);
    timers.schedule(700, card);
    expect(timers.size).toBe(2);
    timers.clear();
    timers.clear();
    vi.advanceTimersByTime(35000);
    expect(fallback).not.toHaveBeenCalled();
    expect(card).not.toHaveBeenCalled();
    expect(timers.size).toBe(0);
  });

  it('can schedule a fresh race after a previous session was cleared', () => {
    const timers = new RaceTimeouts(), old = vi.fn(), next = vi.fn();
    timers.schedule(500, old);
    timers.clear();
    timers.schedule(200, next);
    vi.advanceTimersByTime(1000);
    expect(old).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(timers.size).toBe(0);
  });
});
