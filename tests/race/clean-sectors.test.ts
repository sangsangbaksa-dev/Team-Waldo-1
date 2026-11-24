import { describe, expect, it } from 'vitest';
import { createCleanSectors, invalidateCleanSector, stepCleanSectors } from '../../src/race/clean-sectors';

describe('clean sectors', () => {
  it('awards each boundary once despite reversing', () => {
    const state = createCleanSectors(300, 1);
    expect(stepCleanSectors(state, 99, false)).toBe(false);
    expect(stepCleanSectors(state, 100, false)).toBe(true);
    expect(stepCleanSectors(state, 80, false)).toBe(false);
    expect(stepCleanSectors(state, 100, false)).toBe(false);
    expect(stepCleanSectors(state, 200, false)).toBe(true);
    expect(state.clean).toBe(2);
  });
  it('invalidates a collision or recovery only for the current sector', () => {
    const state = createCleanSectors(300, 1);
    expect(stepCleanSectors(state, 100, true)).toBe(false);
    invalidateCleanSector(state);
    expect(stepCleanSectors(state, 200, false)).toBe(false);
    expect(stepCleanSectors(state, 300, false)).toBe(true);
    expect(stepCleanSectors(state, 400, false)).toBe(false);
    expect(state.clean).toBe(1);
  });
  it('does not reward skipped boundaries', () => {
    const state = createCleanSectors(300, 2);
    expect(stepCleanSectors(state, 250, false)).toBe(false);
    expect(state.completed).toBe(2);
    expect(stepCleanSectors(state, 300, false)).toBe(true);
  });
});
