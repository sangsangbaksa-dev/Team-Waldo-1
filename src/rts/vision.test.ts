import { describe, expect, it } from 'vitest';
import { RtsSim } from './sim';
import { Vision, FOG_VISIBLE } from './vision';

describe('FRONTLINE fog versioning', () => {
  it('increments the minimap revision on first exploration', () => {
    const s = new RtsSim(), v = new Vision(s.map.size, 0);
    expect(v.version).toBe(0);
    expect(v.update(s, true)).toBe(true);
    expect(v.version).toBe(1);
    expect(v.state.some(x => x === FOG_VISIBLE)).toBe(true);
  });
  it('avoids redundant minimap and fog updates when positions have not changed', () => {
    const s = new RtsSim(), v = new Vision(s.map.size, 0);
    v.update(s, true);
    expect(v.update(s, true)).toBe(true);
    expect(v.version).toBe(1);
  });
  it('detects movement of a friendly scout and ignores movement of an enemy', () => {
    const s = new RtsSim(), v = new Vision(s.map.size, 0);
    v.update(s, true);
    const enemy = s.units.find(u => u.owner === 1)!;
    enemy.x += 5; enemy.y += 5;
    expect(v.update(s, true)).toBe(true);
    expect(v.version).toBe(1);
    const friendly = s.units.find(u => u.owner === 0)!;
    friendly.x += 17;
    expect(v.update(s, true)).toBe(true);
    expect(v.version).toBe(2);
  });
});
