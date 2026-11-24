import { describe, expect, it } from 'vitest';
import { HeldPointer, primaryReleased } from '../../src/city/input';

describe('city pointer lifecycle', () => {
  it('keeps firing when a different finger ends', () => {
    const fire = new HeldPointer();
    expect(fire.press(0)).toBe(true);
    expect(fire.press(7)).toBe(false);
    fire.release(7);
    expect(fire.active).toBe(true);
    fire.release(0);
    expect(fire.active).toBe(false);
  });

  it('allows a new press after resetting the old gesture', () => {
    const fire = new HeldPointer();
    fire.press(2);
    fire.clear();
    expect(fire.press(3)).toBe(true);
    fire.release(2);
    expect(fire.active).toBe(true);
  });

  it('does not stop a held primary button when the secondary button is released', () => {
    expect(primaryReleased({ pointerType: 'mouse', type: 'pointerup', buttons: 1 })).toBe(false);
    expect(primaryReleased({ pointerType: 'mouse', type: 'pointerup', buttons: 0 })).toBe(true);
    expect(primaryReleased({ pointerType: 'mouse', type: 'pointercancel', buttons: 1 })).toBe(true);
    expect(primaryReleased({ pointerType: 'touch', type: 'pointerup', buttons: 0 })).toBe(false);
  });
});
