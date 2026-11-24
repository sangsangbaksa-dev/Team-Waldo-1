import { describe, expect, it } from 'vitest';
import { activateFocus, createFocus, tickFocus } from '../../src/slack/domain/focus';
describe('focus', () => {
  it('spends a charge only on valid activation and cannot stack', () => {
    const f = createFocus();
    expect(activateFocus(f, false)).toBe(false);
    expect(f.uses).toBe(3);
    expect(activateFocus(f, true)).toBe(true);
    expect(activateFocus(f, true)).toBe(false);
    expect(f.uses).toBe(2);
  });
  it('expires or ends on cover and cannot exceed three uses', () => {
    const f = createFocus();
    for (let i = 0; i < 3; i++) {
      expect(activateFocus(f, true)).toBe(true);
      tickFocus(f, i === 0 ? 7 : 0, i !== 0);
      expect(f.remaining).toBe(0);
    }
    expect(activateFocus(f, true)).toBe(false);
  });
});
