import { describe, expect, it } from 'vitest';
import { framePlan, STEP, escapeRaceText } from '../../src/race/frame-plan';
import { newCar, separateCars, syncLocalVelocity } from '../../src/race/physics';
import { buildTrack } from '../../src/race/track';

describe('SPEED RUSH frame timing', () => {
  it.each([10, 15, 30, 60, 144])('advances the same clock at %i FPS', fps => {
    let accumulator = 0, ticks = 0;
    for (let i = 0; i < fps * 3; i++) {
      const next = framePlan(accumulator, 1/fps);
      accumulator = next.remainder; ticks += next.steps;
    }
    expect(ticks * STEP).toBeCloseTo(3, 8);
  });
  it('bounds long suspended frames, keeping a finite remainder', () => {
    expect(framePlan(0, 10).steps).toBe(18);
    expect(framePlan(NaN, -1)).toEqual({ steps: 0, remainder: 0 });
  });
  it('escapes nicknames instead of injecting markup', () => {
    expect(escapeRaceText('<img onerror="x"> & \'')).toBe('&lt;img onerror=&quot;x&quot;&gt; &amp; &#39;');
  });
  it('keeps speed and slip consistent with collision impulses', () => {
    const t = buildTrack(), a = newCar(t,0,0), b = newCar(t,0,0);
    b.x += Math.cos(a.h) * 2; b.z += Math.sin(a.h) * 2;
    a.vx = Math.cos(a.h)*40; a.vz = Math.sin(a.h)*40; syncLocalVelocity(a);
    expect(separateCars(a,b)).toBeGreaterThan(0);
    expect(a.vf).toBeCloseTo(a.vx*Math.cos(a.h)+a.vz*Math.sin(a.h));
    expect(b.vf).toBeGreaterThan(0);
  });
});
