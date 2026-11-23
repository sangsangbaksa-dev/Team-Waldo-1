import { describe, expect, it } from 'vitest';
import { driverInput, type RaceHeldControls } from '../../src/race/input';

const empty = (): RaceHeldControls => ({
  left: false, right: false, brake: false, drift: false, nitro: false, gas: false,
});

describe('SPEED RUSH controls', () => {
  it('maps arrow keys and WASD to identical driving input', () => {
    const arrows = driverInput(new Set(['ArrowUp', 'ArrowLeft']), empty(), false, 'racing');
    const wasd = driverInput(new Set(['KeyW', 'KeyA']), empty(), false, 'racing');
    expect(arrows).toEqual(wasd);
    expect(arrows).toMatchObject({ throttle: 1, brake: 0, steer: -1 });
  });

  it('combines steering from keyboard and touch without double-counting', () => {
    const hold = empty(); hold.left = true; hold.nitro = true;
    expect(driverInput(new Set(['ArrowLeft', 'ShiftRight', 'Space']), hold, false, 'racing'))
      .toEqual({ throttle: 0, brake: 0, steer: -1, drift: true, nitro: true });
    hold.right = true;
    expect(driverInput(new Set(), hold, false, 'racing').steer).toBe(0);
  });

  it('only auto-accelerates on coarse pointers after the start signal', () => {
    expect(driverInput(new Set(), empty(), true, 'countdown').throttle).toBe(0);
    expect(driverInput(new Set(), empty(), true, 'racing').throttle).toBe(1);
    expect(driverInput(new Set(), empty(), true, 'done').throttle).toBe(0);
    expect(driverInput(new Set(), empty(), false, 'racing').throttle).toBe(0);
  });

  it('cancels touch auto-throttle while braking but preserves manual gas', () => {
    const hold = empty(); hold.brake = true;
    expect(driverInput(new Set(), hold, true, 'racing')).toMatchObject({ throttle: 0, brake: 1 });
    expect(driverInput(new Set(['ArrowUp']), hold, true, 'racing')).toMatchObject({ throttle: 1, brake: 1 });
    hold.gas = true; hold.brake = false;
    expect(driverInput(new Set(), hold, true, 'countdown').throttle).toBe(1);
  });
});
