import { describe, expect, it } from 'vitest';
import { SCATTER_CELL, STRUCTURE_CELL, cellIsNear, spatialCell } from '../../src/shooter/render-spatial';

describe('Zero Zone spatial rendering buckets', () => {
  it('handles negative coordinates without mixing regions', () => {
    expect(spatialCell(-0.01, SCATTER_CELL)).toBe(-1);
    expect(spatialCell(0, SCATTER_CELL)).toBe(0);
    expect(spatialCell(-64, SCATTER_CELL)).toBe(-1);
    expect(spatialCell(127.9, STRUCTURE_CELL)).toBe(0);
    expect(spatialCell(128, STRUCTURE_CELL)).toBe(1);
  });

  it('keeps cells visible when their edges intersect the draw radius', () => {
    expect(cellIsNear(0, 0, 0, 0, 0)).toBe(true);
    expect(cellIsNear(0, 0, -1, 0, 0)).toBe(true);
    expect(cellIsNear(0, 0, 1, 0, 64)).toBe(true);
    expect(cellIsNear(0, 0, 1, 0, 63.9)).toBe(false);
    expect(cellIsNear(0, 0, 2, 0, 127.9)).toBe(false);
    expect(cellIsNear(-10, -10, -1, -1, 1)).toBe(true);
    expect(cellIsNear(-10, -10, 1, 1, 100)).toBe(false);
  });
});
