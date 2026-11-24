import { describe, expect, it } from 'vitest';
import { PointerHolds } from '../../src/race/application/pointer-holds';

describe('race pointer ownership', () => {
  it('ignores releases from another finger and keeps other controls active', () => {
    const holds = new PointerHolds<string>();
    holds.press('gas', 1);
    holds.press('gas', 2);
    holds.press('left', 3);
    holds.release('gas', 99);
    holds.release('gas', 1);
    expect(holds.active('gas')).toBe(true);
    holds.release('gas', 2);
    expect(holds.active('gas')).toBe(false);
    expect(holds.active('left')).toBe(true);
  });

  it('clears all held inputs and ignores late cancellation after reset', () => {
    const holds = new PointerHolds<string>();
    holds.press('nitro', 1);
    holds.press('brake', 2);
    holds.clear();
    holds.release('nitro', 1);
    expect(holds.active('nitro')).toBe(false);
    expect(holds.active('brake')).toBe(false);
    holds.press('nitro', 3);
    holds.release('nitro', 1);
    expect(holds.active('nitro')).toBe(true);
  });
});
