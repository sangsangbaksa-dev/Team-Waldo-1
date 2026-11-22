import { describe, expect, it } from 'vitest';
import { blendFogAlpha } from './fog-alpha';
import { FOG_HIDDEN, FOG_SEEN, FOG_VISIBLE } from './vision';

const make = (size = 3) => {
  const data = new Uint8Array(size * size * 4), current = new Float32Array(size * size).fill(226);
  for (let i = 0; i < current.length; i++) data[i * 4 + 3] = 226;
  return { data, current, state: new Uint8Array(size * size), size };
};
describe('FRONTLINE fog texture update optimization', () => {
  it('skips uploading when hidden cells already match their target', () => {
    const f = make();
    expect(blendFogAlpha(f.data, f.current, f.state, f.size, 0.1, 226, 118)).toEqual({ dirty: false, settled: true });
  });
  it('interpolates visible cells and uploads changed alpha only', () => {
    const f = make();
    f.state[1] = FOG_VISIBLE;
    expect(blendFogAlpha(f.data, f.current, f.state, f.size, 0.25, 226, 118)).toEqual({ dirty: true, settled: false });
    expect(f.current[1]).toBeCloseTo(169.5);
    expect(f.data[((f.size - 1) * f.size + 1) * 4 + 3]).toBe(170);
    expect(f.data[1 * 4 + 3]).toBe(226);
  });
  it('settles fully and does not request a second upload after convergence', () => {
    const f = make();
    f.state[0] = FOG_VISIBLE;
    expect(blendFogAlpha(f.data, f.current, f.state, f.size, 1, 226, 118)).toEqual({ dirty: true, settled: true });
    expect(blendFogAlpha(f.data, f.current, f.state, f.size, 0.1, 226, 118)).toEqual({ dirty: false, settled: true });
  });
  it('smoothly re-fogs previously visible cells', () => {
    const f = make(); f.state[0] = FOG_SEEN;
    const a = blendFogAlpha(f.data, f.current, f.state, f.size, 0.5, 226, 118);
    expect(a).toEqual({ dirty: true, settled: false });
    expect(f.current[0]).toBeCloseTo(172);
    expect(f.current[8]).toBe(226);
  });
  it('preserves the untouched hidden channel while other cells change', () => {
    const f = make(2); f.state.fill(FOG_HIDDEN); f.state[3] = FOG_VISIBLE;
    blendFogAlpha(f.data, f.current, f.state, f.size, 0.5, 226, 118);
    // Simulation cell 3 (bottom right) maps to texture pixel 1 (top right).
    for (let i = 0; i < 4; i++) expect(f.data[i * 4 + 3]).toBe(i === 1 ? 113 : 226);
  });
});
