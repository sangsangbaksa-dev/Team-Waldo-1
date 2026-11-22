import { describe, expect, it } from 'vitest';
import { advanceDeferredFx, type DeferredFx } from './fx-scheduler';

describe('FRONTLINE deferred effect scheduler', () => {
  it('compacts pending effects in place across multiple frames', () => {
    const fired: number[] = [], ready: DeferredFx[] = [];
    const pending: DeferredFx[] = [
      { left: 0.1, run: () => fired.push(1) },
      { left: 0.5, run: () => fired.push(2) },
      { left: 0.2, run: () => fired.push(3) },
    ];
    const ref = pending;
    advanceDeferredFx(pending, ready, 0.15);
    expect(pending).toBe(ref);
    expect(fired).toEqual([1]);
    expect(pending[0].left).toBeCloseTo(0.35);
    expect(pending[1].left).toBeCloseTo(0.05);
    expect(ready).toHaveLength(0);
    advanceDeferredFx(pending, ready, 0.36);
    expect(fired).toEqual([1, 2, 3]);
    expect(pending).toHaveLength(0);
  });
  it('defers newly scheduled explosions until the next frame', () => {
    const fired: string[] = [], ready: DeferredFx[] = [];
    const pending: DeferredFx[] = [{
      left: 0.1,
      run: () => {
        fired.push('initial');
        pending.push({ left: 0.2, run: () => fired.push('follow-up') });
      },
    }];
    advanceDeferredFx(pending, ready, 0.2);
    expect(fired).toEqual(['initial']);
    expect(pending).toHaveLength(1);
    advanceDeferredFx(pending, ready, 0.19);
    expect(fired).toEqual(['initial']);
    advanceDeferredFx(pending, ready, 0.02);
    expect(fired).toEqual(['initial', 'follow-up']);
  });
  it('preserves callback order when several effects mature simultaneously', () => {
    const order: number[] = [], ready: DeferredFx[] = [];
    const pending = [4, 1, 3].map(x => ({ left: 0.01, run: () => order.push(x) }));
    advanceDeferredFx(pending, ready, 0.02);
    expect(order).toEqual([4, 1, 3]);
  });
});
