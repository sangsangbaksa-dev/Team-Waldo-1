import { describe, expect, it } from 'vitest';
import { radarNorthDirection } from '../../src/outlaw/minimap';

describe('OUTLAW rotating mini-radar compass', () => {
  it('puts north at the top for a north-up map', () => {
    const [x, y] = radarNorthDirection(0);
    expect(x).toBeCloseTo(0); expect(y).toBeCloseTo(-1);
  });
  it('rotates north around the rim in sync with the actual rendered map', () => {
    for (const angle of [Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI * 2]) {
      const [x,y] = radarNorthDirection(angle);
      expect(x).toBeCloseTo(Math.sin(angle));
      expect(y).toBeCloseTo(-Math.cos(angle));
      expect(x*x + y*y).toBeCloseTo(1);
    }
  });
});
