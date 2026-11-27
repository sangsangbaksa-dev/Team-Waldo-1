import { describe, expect, it } from 'vitest';
import { acceptsGameplayInput, TouchButtons } from '../../src/shooter/input';

describe('shooter input lifecycle', () => {
  const live = { phase: 'play', closed: false, paused: false, hasMatch: true, overlay: false };

  it.each(['setup', 'loading', 'dead', 'over'])('rejects input during %s', phase => {
    expect(acceptsGameplayInput({ ...live, phase })).toBe(false);
  });

  it('accepts live and countdown input only when the field is interactive', () => {
    expect(acceptsGameplayInput(live)).toBe(true);
    expect(acceptsGameplayInput({ ...live, phase: 'countdown' })).toBe(true);
    for (const blocked of [{ closed: true }, { paused: true }, { hasMatch: false }, { overlay: true }]) {
      expect(acceptsGameplayInput({ ...live, ...blocked })).toBe(false);
    }
  });

  it('releases only the action owned by the ending pointer', () => {
    const buttons = new TouchButtons();
    expect(buttons.press('fire', 1)).toBe(true);
    expect(buttons.press('interact', 2)).toBe(true);
    expect(buttons.press('fire', 3)).toBe(false);
    expect(buttons.release(3)).toBeUndefined();
    expect(buttons.release(2)).toBe('interact');
    expect(buttons.owns('fire', 1)).toBe(true);
    buttons.clear();
    expect(buttons.release(1)).toBeUndefined();
    expect(buttons.press('fire', 4)).toBe(true);
  });
});
