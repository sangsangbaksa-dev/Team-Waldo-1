import { describe, expect, it, vi } from 'vitest';
import { RaceSpeedEffects } from '../../src/race/speed-effects';

function makeCanvas() {
  const ctx = {
    clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
    lineTo: vi.fn(), stroke: vi.fn(),
  };
  const canvas = {
    width: 1, height: 1,
    getContext: vi.fn(() => ctx),
  } as unknown as HTMLCanvasElement;
  return { canvas, ctx };
}

describe('SPEED RUSH 2D speed layer', () => {
  it('keeps the overlay at half the viewport resolution', () => {
    const { canvas } = makeCanvas(), renderer = new RaceSpeedEffects(canvas);
    renderer.resize(1281, 721);
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(360);
    renderer.resize(1, 1);
    expect(canvas.width).toBe(1);
    expect(canvas.height).toBe(1);
  });

  it('clears but does not draw when motion is reduced or the car is slow', () => {
    const { canvas, ctx } = makeCanvas(), renderer = new RaceSpeedEffects(canvas);
    renderer.render(1, true);
    renderer.render(0.1, false);
    expect(ctx.clearRect).toHaveBeenCalledTimes(2);
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it('draws speed lines when the intensity is high', () => {
    const { canvas, ctx } = makeCanvas(), renderer = new RaceSpeedEffects(canvas);
    renderer.resize(800, 600);
    renderer.render(0.9, false);
    expect(ctx.stroke.mock.calls.length).toBeGreaterThan(36);
    expect(ctx.stroke.mock.calls.length).toBeLessThanOrEqual(86);
    expect(ctx.moveTo).toHaveBeenCalledTimes(ctx.stroke.mock.calls.length);
  });
});
