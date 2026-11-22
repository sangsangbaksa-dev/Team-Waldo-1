// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import { terrain } from '../../src/squad/terrain';

it('rasterizes the tactical grid only once for a given terrain size', () => {
  const original = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext');
  let gridStrokes = 0;
  const state: Record<string, unknown> = {};
  const gradient = { addColorStop: vi.fn() };
  const context = new Proxy(state, {
    get(target, key) {
      if (key === 'stroke') return () => { if (target.strokeStyle === '#ffffff0a') gridStrokes++; };
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
      if (key in target) return target[key as string];
      return () => undefined;
    },
  }) as unknown as CanvasRenderingContext2D;
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true, value: vi.fn(() => context),
  });
  try {
    const first = terrain(600, 1000);
    expect(gridStrokes).toBe(34); // 13 vertical boundaries + 21 horizontal
    expect(terrain(600, 1000)).toBe(first);
    expect(gridStrokes).toBe(34);
    const resized = terrain(300, 500);
    expect(resized).not.toBe(first);
    expect(gridStrokes).toBe(68);
  } finally {
    if (original) Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', original);
  }
});
