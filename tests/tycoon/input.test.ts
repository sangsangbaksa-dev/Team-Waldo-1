import { describe, expect, it } from 'vitest';
import { isRepeatedCommand } from '../../src/tycoon/application/input';

describe('HUSTLE one-shot commands', () => {
  it('rejects repeated interaction, ride, menu, view and confirmation commands', () => {
    for (const code of ['Escape', 'Enter', 'Tab', 'KeyE', 'KeyF', 'KeyH', 'KeyM', 'KeyV', 'Digit1', 'Digit9']) {
      expect(isRepeatedCommand(code, true)).toBe(true);
      expect(isRepeatedCommand(code, false)).toBe(false);
    }
  });

  it('preserves continuous movement and keyboard map navigation', () => {
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'Space', 'ArrowLeft']) {
      expect(isRepeatedCommand(code, true)).toBe(false);
    }
  });
});
