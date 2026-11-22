import { describe, expect, it } from 'vitest';
import { shouldRetainVehicleMesh } from './view';

describe('ZERO ZONE vehicle mesh lifecycle', () => {
  it('does not allocate off-screen BR cars on the first frame', () => {
    expect(shouldRetainVehicleMesh(900, false)).toBe(false);
    expect(shouldRetainVehicleMesh(421, false)).toBe(false);
    expect(shouldRetainVehicleMesh(419, false)).toBe(true);
  });
  it('retains existing meshes across draw-boundary movement without thrashing', () => {
    expect(shouldRetainVehicleMesh(420, true)).toBe(true);
    expect(shouldRetainVehicleMesh(470, true)).toBe(true);
    expect(shouldRetainVehicleMesh(520, true)).toBe(true);
    expect(shouldRetainVehicleMesh(521, true)).toBe(false);
  });
  it('never renders geometry for invalid map distances', () => {
    expect(shouldRetainVehicleMesh(NaN, false)).toBe(false);
    expect(shouldRetainVehicleMesh(Infinity, true)).toBe(false);
  });
});
