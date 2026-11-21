import { describe, expect, it } from 'vitest';
import { weaponIcon } from '../../src/outlaw/icons';
import { WEAPON_ORDER } from '../../src/outlaw/types';

describe('outlaw weapon icons', () => {
  it('every weapon has a drawn svg with shapes', () => {
    for (const id of WEAPON_ORDER) {
      const svg = weaponIcon(id);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toMatch(/<(path|rect|ellipse)/);
    }
  });
});
