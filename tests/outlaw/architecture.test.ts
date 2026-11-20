import { describe, expect, it } from 'vitest';
import { architectureDetails } from '../../src/outlaw/architecture';
import { generateCity } from '../../src/outlaw/world';

describe('Outlaw architectural geometry', () => {
  it('keeps details deterministic, finite and within a bounded per-building budget', () => {
    const map = generateCity(7);
    for (const b of map.buildings) {
      const parts = architectureDetails(b, 'high');
      expect(parts.length).toBeLessThanOrEqual(30);
      expect(parts).toEqual(architectureDetails(b, 'high'));
      for (const p of parts) {
        expect([p.x, p.y, p.z, p.w, p.h, p.d].every(Number.isFinite)).toBe(true);
        expect(Math.min(p.w, p.h, p.d)).toBeGreaterThan(0);
      }
    }
  });
  it('removes ordinary details on low quality but keeps landmarks distinct', () => {
    const map = generateCity(7), b = map.buildings.find(b => b.kind === 'shop')!;
    expect(architectureDetails(b, 'low')).toEqual([]);
    expect(architectureDetails(b, 'low', true).some(p => p.material === 'glass')).toBe(true);
  });
});
