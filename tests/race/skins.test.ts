import { describe, expect, it } from 'vitest';
import { SKINS, skinById } from '../../src/race/skins';
import { SKINS as publicSkins, skinById as publicSkinLookup, paintOf, CARS } from '../../src/race/config';
import { sanitizeGarage, buySkin } from '../../src/race/garage';

describe('SPEED RUSH lightweight cosmetics', () => {
  it('preserves the public API through config and garage', () => {
    expect(publicSkins).toBe(SKINS);
    expect(publicSkinLookup).toBe(skinById);
    expect(skinById('night').color).toBe('#15171d');
    expect(paintOf(CARS[0], 'night')).toMatchObject({ color: '#15171d' });
  });
  it('removes retired engine upgrades but keeps purchased paints and coins', () => {
    expect(sanitizeGarage({ coins: 300, skins: ['night','not-a-skin'], cars: { arc: { accel: 5 } } }))
      .toEqual({ coins: 300, skins: ['night'] });
    expect(buySkin({coins: 300, skins: []},'night')).toEqual({coins:80,skins:['night']});
  });
});
