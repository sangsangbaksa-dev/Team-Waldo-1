import { describe, expect, it } from 'vitest';
import { normalizeFlightControls, PointerHold, pressKey } from '../../src/sky/input-state';

describe('flight input recovery', () => {
  it('restores defaults for malformed or unsupported preferences', () => {
    for (const value of [null, [], 'invalid', { assist: 7, sens: '1.2', inv: 1 }, { assist: -1, sens: Infinity }]) {
      expect(normalizeFlightControls(value)).toEqual({ assist: 2, sens: 1, inv: false });
    }
    expect(normalizeFlightControls({ assist: 0, sens: 0.8, inv: true })).toEqual({ assist: 0, sens: 0.8, inv: true });
  });

  it('ignores a second finger and releases only the owning pointer', () => {
    const hold = new PointerHold();
    expect(hold.claim(4)).toBe(true);
    expect(hold.claim(5)).toBe(false);
    expect(hold.release(5)).toBe(false);
    expect(hold.active).toBe(true);
    expect(hold.release(4)).toBe(true);
    expect(hold.active).toBe(false);
  });

  it('does not share pointer ownership between weapon and boost buttons', () => {
    const fire = new PointerHold(), boost = new PointerHold();
    fire.claim(1); boost.claim(2);
    fire.release(1);
    expect(boost.active).toBe(true);
    boost.clear();
    expect(boost.release(2)).toBe(false);
    expect(boost.claim(3)).toBe(true);
  });

  it('ignores keyboard autorepeat, including after clearing held keys on pause', () => {
    const keys = new Set<string>();
    expect(pressKey(keys, 't', false)).toBe(true);
    expect(pressKey(keys, 't', true)).toBe(false);
    expect(pressKey(keys, 't', false)).toBe(false);
    keys.clear();
    expect(pressKey(keys, 't', true)).toBe(false);
    expect(keys.size).toBe(0);
    expect(pressKey(keys, 't', false)).toBe(true);
  });
});
