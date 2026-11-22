import { describe, expect, it } from 'vitest';
import { drawPoiIcon, POI_KINDS } from '../../src/outlaw/poiicons';
import { phoneIcon } from '../../src/outlaw/icons';

describe('outlaw poi icons', () => {
  it('every poi kind draws shapes, not text', () => {
    expect(POI_KINDS.length).toBe(15);
    for (const kind of POI_KINDS) {
      const calls: string[] = [];
      const g = new Proxy({}, { get: (_t, k) => (k === 'canvas' ? {} : (..._a: unknown[]) => { calls.push(String(k)); }), set: () => true }) as unknown as CanvasRenderingContext2D;
      drawPoiIcon(g, kind, 10, '#fff');
      expect(calls.some(c => c === 'fill' || c === 'stroke' || c === 'fillRect')).toBe(true);
      expect(calls).not.toContain('fillText');
    }
  });
  it('phone icon is an svg', () => { expect(phoneIcon().startsWith('<svg')).toBe(true); });
});
