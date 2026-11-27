import { describe, expect, it } from 'vitest';
import { civilType, nearbyRental, rentalEligibility, RENTALS } from '../../project-harbor/world/rental';
import { World } from '../../project-harbor/world/application';
import { districtAt } from '../../project-harbor/world/domain';
import { StreetSim } from '../../project-harbor/world/street-sim';
describe('Harbor civilian vehicles and rentals', () => {
  it('places six accessible rental points in their own districts', () => {
    const world = new World({ load() {}, unload() {} });
    expect(RENTALS).toHaveLength(6);
    for (const site of RENTALS) {
      expect(districtAt(site.x, site.z).id).toBe(site.district);
      expect(world.open(site.x, site.z)).toBe(true);
      expect(nearbyRental(site)).toEqual(site);
    }
  });
  it('uses varied district fleets and actual traffic types', () => {
    expect(civilType('rich', 0)).toBe('sport');
    expect(civilType('slum', 0)).toBe('truck');
    expect(new Set(new StreetSim().cars.map(car => car.type)).size).toBeGreaterThanOrEqual(4);
  });
  it('rejects insufficient cash, wanted, driving and busy states', () => {
    const site = RENTALS[0]!;
    expect(rentalEligibility(site, site.price, 0, false, false)).toBeNull();
    expect(rentalEligibility(site, 0, 0, false, false)).not.toBeNull();
    expect(rentalEligibility(site, 999, 1, false, false)).not.toBeNull();
    expect(rentalEligibility(site, 999, 0, true, false)).not.toBeNull();
    expect(rentalEligibility(site, 999, 0, false, true)).not.toBeNull();
  });
});
