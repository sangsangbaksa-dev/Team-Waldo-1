import { describe, expect, it } from 'vitest';
import { updateFogAlpha } from '../src/rts/fog-alpha';

describe('fog texture dirty detection', () => {
  it('does not dirty an already settled pixel', () => {
    const cur = new Float32Array([80]), rgba = new Uint8Array([6, 10, 18, 80]);
    expect(updateFogAlpha(cur, rgba, 0, 3, 80, 0.5)).toBe(false);
    expect(Array.from(rgba)).toEqual([6, 10, 18, 80]);
  });
  it('keeps subpixel progress until the rounded byte changes', () => {
    const cur = new Float32Array([100]), rgba = new Uint8Array([6, 10, 18, 100]);
    expect(updateFogAlpha(cur, rgba, 0, 3, 99, 0.25)).toBe(false);
    expect(updateFogAlpha(cur, rgba, 0, 3, 99, 0.25)).toBe(false);
    expect(updateFogAlpha(cur, rgba, 0, 3, 99, 0.25)).toBe(true);
    expect(rgba[3]).toBe(99);
  });
  it('changes only the requested texture byte', () => {
    const cur = new Float32Array([10, 50]), rgba = new Uint8Array([1, 2, 3, 50, 4, 5, 6, 10]);
    expect(updateFogAlpha(cur, rgba, 0, 7, 0, 1)).toBe(true);
    expect(Array.from(rgba)).toEqual([1, 2, 3, 50, 4, 5, 6, 0]);
  });
});
