import { describe, expect, it } from 'vitest';
import { districtAt, generateCity } from '../../src/outlaw/world';
import { districtName } from '../../src/outlaw/minimap';

describe('OUTLAW shared city neighborhood classification', () => {
  it('matches every generated building zone across multiple world seeds', () => {
    for (const seed of [1, 7, 19, 57]) {
      const map = generateCity(seed);
      for (const building of map.buildings) {
        expect(districtAt(map, building.x, building.z), `seed ${seed} / building ${building.id}`).toBe(building.district);
      }
    }
  });
  it('identifies park centers and never uses an adjacent building as a fallback', () => {
    const map = generateCity(18);
    expect(map.parks.length).toBeGreaterThan(2);
    for (const park of map.parks) {
      expect(districtAt(map, park.x, park.z)).toBe('park');
      expect(districtName(park.x, park.z, map)).toBe('공원 지구');
    }
  });
  it('gives the minimap and traffic the same classification near outer road edges', () => {
    const map = generateCity(29);
    const labels = { residential:'주거 지구', industrial:'공업 지구',
      downtown:'다운타운', commercial:'상업 지구', park:'공원 지구' };
    for (const x of [-799, -710, -300, 0, 300, 799]) for (const z of [-799,-300,0,300,799]) {
      const zone = districtAt(map,x,z);
      expect(districtName(x,z,map)).toBe(labels[zone]);
    }
  });
});
