import { describe, expect, it } from 'vitest';
import { cityIcon, hudIcon } from '../../src/city/icons';
import { lootArt } from '../../src/city/loottex';
import { PERKS } from '../../src/city/defs';
import { SHOP } from '../../src/city/shop';
import { WEATHER_ICON } from '../../src/city/clock';

describe('city icons', () => {
  it('draws every perk, shop and weather icon as svg', () => {
    const all = [...PERKS.map(p => p.icon), ...Object.values(SHOP).flat().map(s => s.icon), ...Object.values(WEATHER_ICON)];
    for (const ch of all) expect(cityIcon(ch), ch).toMatch(/^<svg/);
  });
  it('draws hud icons and ignores unknown names', () => {
    for (const n of ['cash', 'troops', 'kit', 'w:pistol', 'w:railgun']) expect(hudIcon(n), n).toMatch(/^<svg/);
    expect(hudIcon('nope')).toBe('');
  });
  it('maps loot types to drawn art', () => {
    expect(lootArt('cash')).toBe('cash');
    expect(lootArt('weapon')).toBeNull();
  });
  it('falls back to the raw text for unknown icons', () => {
    expect(cityIcon('x')).toBe('x');
  });
});
