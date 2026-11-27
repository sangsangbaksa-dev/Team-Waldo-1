import { describe, expect, it } from 'vitest';
import { makeSave, parseSave, restoreSave } from '../../project-harbor/world/save';
import { World } from '../../project-harbor/world/application';
import { createVitals } from '../../project-harbor/world/street';
import { PACKAGES } from '../../project-harbor/world/exploration';
import { SITES } from '../../project-harbor/world/services';
function state() {
  const world = new World({ load() {}, unload() {} });
  world.x = 64; world.z = 64;
  return { world, vitals: createVitals(), visitedServices: new Set<string>(), collectedPackages: new Set<string>(), driving: false, airborne: false, hijack: null };
}
describe('Harbor local saves', () => {
  it('restores location, wallet, inventory and discovery state', () => {
    const a = state(); a.vitals.money = 700; a.vitals.weapon = 'pistol'; a.vitals.magazine = 8; a.vitals.reserve = 15;
    a.visitedServices.add(SITES[0]!.id); a.collectedPackages.add(PACKAGES[0]!.id);
    const data = makeSave(a); expect(data).not.toBeNull();
    const b = state(); b.world.x = 320;
    expect(restoreSave(b, data!)).toBe(true); expect(b.world.x).toBe(64);
    expect(b.vitals.money).toBe(700); expect(b.vitals.magazine).toBe(8);
    expect(b.visitedServices).toEqual(a.visitedServices); expect(b.collectedPackages).toEqual(a.collectedPackages);
  });
  it('rejects unsafe saves while wanted, airborne or driving', () => {
    const a = state(); a.vitals.wanted = 1; expect(makeSave(a)).toBeNull();
    a.vitals.wanted = 0; a.airborne = true; expect(makeSave(a)).toBeNull();
    a.airborne = false; a.driving = true; expect(makeSave(a)).toBeNull();
  });
  it('rejects corrupt and incompatible saves and filters unknown discoveries', () => {
    expect(parseSave('broken')).toBeNull(); expect(parseSave('null')).toBeNull();
    const a = makeSave(state())!;
    expect(parseSave(JSON.stringify({ ...a, version: 2 }))).toBeNull();
    expect(parseSave(JSON.stringify({ ...a, money: -100 }))).toBeNull();
    expect(parseSave(JSON.stringify({ ...a, weapon: 'unknown' }))).toBeNull();
    expect(parseSave(JSON.stringify({ ...a, visited: ['fake', SITES[0]!.id, SITES[0]!.id] }))?.visited).toEqual([SITES[0]!.id]);
  });
});
