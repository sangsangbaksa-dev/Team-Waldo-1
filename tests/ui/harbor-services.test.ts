import { describe, expect, it } from 'vitest';
import { buyService, nearestService, SITES, visitService } from '../../project-harbor/world/services';
import { createVitals } from '../../project-harbor/world/street';
import { World } from '../../project-harbor/world/application';
import { districtAt } from '../../project-harbor/world/domain';
describe('Harbor public services', () => {
  const [clinic, garage, supply] = SITES;
  it('places three reachable sites in each district', () => {
    const world = new World({ load() {}, unload() {} });
    expect(SITES).toHaveLength(18);
    expect(new Set(SITES.map(site => site.id)).size).toBe(18);
    for (const site of SITES) {
      expect(districtAt(site.x, site.z).id).toBe(site.district);
      expect(nearestService(site.x, site.z)).toBe(site);
      expect(world.open(site.x - 4, site.z, 0.65)).toBe(true);
    }
    expect(nearestService(0, 0)).toBeNull();
  });
  it('awards discovery only once', () => {
    const v = createVitals(), visited = new Set<string>();
    expect(visitService(visited, clinic!, v)).toBe(true);
    expect(visitService(visited, clinic!, v)).toBe(false);
    expect(v.money).toBe(60);
  });
  it('charges only for needed and affordable treatment', () => {
    const v = createVitals(); v.health = 30;
    expect(buyService(clinic!, v, null).ok).toBe(false);
    expect(v.health).toBe(30); v.money = 70;
    expect(buyService(clinic!, v, null).ok).toBe(true);
    expect(v.health).toBe(100); expect(v.money).toBe(35);
    expect(buyService(clinic!, v, null).ok).toBe(false);
    expect(v.money).toBe(35);
  });
  it('repairs stationary vehicles only when not wanted', () => {
    const v = createVitals(); v.money = 100;
    const car = { health: 20, maxHealth: 140, speed: 4 };
    expect(buyService(garage!, v, car).ok).toBe(false);
    car.speed = 0; v.wanted = 1;
    expect(buyService(garage!, v, car).ok).toBe(false);
    v.wanted = 0;
    expect(buyService(garage!, v, car).ok).toBe(true);
    expect(car.health).toBe(140); expect(v.money).toBe(45);
  });
  it('caps ammunition and requires a weapon', () => {
    const v = createVitals(); v.money = 100;
    expect(buyService(supply!, v, null).ok).toBe(false);
    v.weapon = 'pistol'; v.reserve = 70;
    expect(buyService(supply!, v, null).ok).toBe(true);
    expect(v.reserve).toBe(72); expect(v.money).toBe(55);
    expect(buyService(supply!, v, null).ok).toBe(false);
  });
});
