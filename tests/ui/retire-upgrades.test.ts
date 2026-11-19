// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { retireUpgradeSaves } from '../../src/shared/retire-upgrades';

it('removes retired wallets and strips garage stat levels, preserving coins, cosmetics and unrelated records', () => {
  localStorage.clear();
  for (const k of ['waldo.rts.armory.v1', 'waldo.city.career.v1', 'waldo.shooter.perks.v1']) localStorage.setItem(k, '{}');
  localStorage.setItem('waldo.race.garage.v1', JSON.stringify({ coins: 220, skins: ['night'], cars: { arc: { top: 3 } } }));
  localStorage.setItem('waldo.preferences.v1', '{"sound":false}');
  retireUpgradeSaves(); retireUpgradeSaves();
  for (const k of ['waldo.rts.armory.v1', 'waldo.city.career.v1', 'waldo.shooter.perks.v1']) expect(localStorage.getItem(k)).toBeNull();
  expect(JSON.parse(localStorage.getItem('waldo.race.garage.v1')!)).toEqual({ coins: 220, skins: ['night'] });
  expect(localStorage.getItem('waldo.preferences.v1')).toBe('{"sound":false}');
  localStorage.clear();
});
