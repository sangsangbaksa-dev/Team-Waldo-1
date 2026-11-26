import { describe, expect, it } from 'vitest';
import { beginBrake, beginCanvasPointer, createTouch, endPointer, stickOffset } from '../../src/tycoon/scene/touch';
import { driveCommand, planDriveSteps } from '../../src/tycoon/scene/driving';

describe('HUSTLE touch pointers', () => {
  it('gives the left side to the stick and does not let that finger brake', () => {
    const tc = createTouch();
    expect(beginCanvasPointer(tc, 3, 40, 200, 400)).toBe('move');
    expect(beginCanvasPointer(tc, 3, 300, 200, 400)).toBeNull();
    expect(beginBrake(tc, 3)).toBe(false);
    expect(beginCanvasPointer(tc, 8, 300, 80, 400)).toBe('look');
    const moved = stickOffset(tc, 3, 40 + 55, 200);
    expect(moved).toEqual({ x: 38, y: 0 });
    expect(endPointer(tc, 3)).toBe('move');
    expect(tc.mx).toBe(0);
    expect(endPointer(tc, 3)).toBeNull();
  });

  it('clamps combined pedals and drops throttle while braking', () => {
    expect(driveCommand({ left: true, right: false, forward: true, back: false, brake: true }, 1, -1)).toEqual({
      steer: 0, throttle: 0, brake: true,
    });
    expect(driveCommand({ left: false, right: false, forward: true, back: false, brake: false }, 2, -2)).toEqual({
      steer: -1, throttle: 1, brake: false,
    });
  });

  it('keeps a 30fps frame and two 60fps frames on the same step count', () => {
    let slowLeft = 0, fastLeft = 0, slowSteps = 0, fastSteps = 0;
    for (let i = 0; i < 30; i++) {
      const slow = planDriveSteps(1 / 30, slowLeft);
      slowLeft = slow.leftover;
      slowSteps += slow.steps;
      for (let k = 0; k < 2; k++) {
        const fast = planDriveSteps(1 / 60, fastLeft);
        fastLeft = fast.leftover;
        fastSteps += fast.steps;
      }
    }
    expect(Math.abs(slowSteps - fastSteps)).toBeLessThanOrEqual(1);
    expect(slowSteps).toBeGreaterThan(50);
    expect(planDriveSteps(0.1, 0).steps).toBe(6);
    expect(planDriveSteps(Number.NaN, 0)).toEqual({ steps: 0, leftover: 0 });
  });
});
