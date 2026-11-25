import { expect, it } from 'vitest';
import { TapBuffer } from '../../src/sky/tap-buffer';

it('keeps a quick cannon press available after the pointer is released between frames', () => {
  const tap = new TapBuffer();
  tap.press();
  tap.tick(1 / 60);
  expect(tap.active).toBe(true);
  tap.tick(0.14);
  expect(tap.active).toBe(false);
});

it('clears a queued press when the flight session loses focus', () => {
  const tap = new TapBuffer();
  tap.press();
  tap.reset();
  expect(tap.active).toBe(false);
});
