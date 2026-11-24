import { describe, expect, it } from 'vitest';
import { CoverInput } from '../../src/slack/cover-input';
import { capturePointer, releasePointer } from '../../src/slack/pointer-capture';

describe('study cover input', () => {
  it('keeps the cover active until keyboard and pointer are both released', () => {
    const input = new CoverInput();
    input.pressKey();
    expect(input.claimPrimary(2)).toBe(true);
    expect(input.releaseKey()).toBe(true);
    expect(input.active).toBe(true);
    expect(input.releasePrimary(2)).toBe(true);
    expect(input.active).toBe(false);
  });

  it('ignores other fingers and preserves middle button ownership', () => {
    const input = new CoverInput();
    input.claimPrimary(2); input.claimMiddle(1);
    expect(input.claimPrimary(3)).toBe(false);
    expect(input.releasePrimary(3)).toBe(false);
    expect(input.releasePrimary(2)).toBe(true);
    expect(input.active).toBe(true);
    expect(input.releaseMiddle(1)).toBe(true);
    expect(input.active).toBe(false);
  });

  it('clears all held sources and ignores a delayed release after pause', () => {
    const input = new CoverInput();
    input.pressKey(); input.claimPrimary(2); input.claimMiddle(1);
    expect(input.clear()).toBe(2);
    expect(input.active).toBe(false);
    expect(input.claimPrimary(4)).toBe(true);
    expect(input.releasePrimary(2)).toBe(false);
    expect(input.active).toBe(true);
  });

  it('does not throw when capture is unsupported or the pointer has been cancelled', () => {
    const target = {
      setPointerCapture() { throw new Error('unsupported'); },
      hasPointerCapture() { return true; },
      releasePointerCapture() { throw new Error('cancelled'); },
    };
    expect(() => capturePointer(target, 1)).not.toThrow();
    expect(() => releasePointer(target, 1)).not.toThrow();
    expect(() => releasePointer(target, null)).not.toThrow();
  });
});
