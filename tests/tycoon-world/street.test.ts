import { describe, expect, it } from 'vitest';
import { SPOTS } from '../../src/tycoon/core';
import { buildLayout } from '../../src/tycoon/scene/layout';
import { GeoBuilder } from '../../src/tycoon/scene/geo';
import { addStreetProps, streetProps } from '../../src/tycoon/scene/street';

describe('district street furniture', () => {
  const layout = buildLayout(SPOTS);
  it('is deterministic, bounded and clear of actual shop entrances', () => {
    for (const b of layout.blocks) {
      const props = streetProps(b, 'high');
      expect(props).toEqual(streetProps(b, 'high'));
      expect(props).toHaveLength(4);
      expect(streetProps(b, 'low')).toHaveLength(2);
      for (const p of props) for (const l of b.lots) expect(Math.hypot(l.doorX - p.x, l.doorZ - p.z)).toBeGreaterThan(6);
    }
  });
  it('creates collision bounds only for solid props within the block', () => {
    for (const b of layout.blocks) {
      const detail = new GeoBuilder(), glow = new GeoBuilder(), bounds = addStreetProps(detail, glow, b, 'high');
      expect(bounds.length).toBeGreaterThanOrEqual(4);
      expect(bounds.length).toBeLessThanOrEqual(8);
      for (const p of bounds) {
        expect(p.x0).toBeGreaterThan(b.cx - 18); expect(p.x1).toBeLessThan(b.cx + 18);
        expect(p.z0).toBeGreaterThan(b.cz - 18); expect(p.z1).toBeLessThan(b.cz + 18);
      }
      const g = detail.build()!; expect(g.index!.count).toBeLessThan(4000); g.dispose(); glow.build()?.dispose();
    }
  });
});
