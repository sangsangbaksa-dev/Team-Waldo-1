import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/outlaw/sim';
import { WEAPONS, WEAPON_ORDER, PLAYER_ID, blankPedInput, blankCarInput } from '../../src/outlaw/types';
import { setOutfit } from '../../src/outlaw/services';

describe('Outlaw inventory, respawn and vehicle regressions', () => {
  it('restores exact inventory and selected weapon without adding the default pistol', () => {
    const sim = new Sim(7);
    sim.applySave({ v: 1, guns: [['rifle', 12, 20]], selectedWeapon: 'rifle' });
    expect(sim.player.guns[1]).toBeNull();
    expect(sim.curGun(sim.player)?.id).toBe('rifle');
    const saved = sim.exportSave();
    const restored = new Sim(7, saved);
    expect(restored.exportSave().guns).toEqual(saved.guns);
    expect(restored.curGun(restored.player)?.id).toBe('rifle');
    sim.applySave({ v: 1, guns: [] });
    expect(sim.curGun(sim.player)?.id).toBe('fist');
  });
  it('does not charge for fully stocked equipment or an invalid outfit', () => {
    const sim = new Sim(7);
    const poi = sim.map.pois.find(p => p.kind === 'gunshop')!;
    sim.player.x = poi.x; sim.player.z = poi.z;
    sim.cash = 100000;
    sim.player.armor = 100;
    sim.player.guns[1] = { id: 'pistol', mag: 1, reserve: WEAPONS.pistol.reserve };
    const cash = sim.cash;
    sim.buyWeapon('pistol'); sim.buyArmor(); setOutfit(sim, 999);
    expect(sim.cash).toBe(cash);
    sim.buyWeapon('minigun');
    expect(sim.player.guns[WEAPON_ORDER.indexOf('minigun')]?.reserve).toBeLessThanOrEqual(WEAPONS.minigun.reserve);
  });
  it('rejects entry into locked empty or inactive vehicles and emits an exit when wrecked', () => {
    const sim = new Sim(7), p = sim.player;
    const car = sim.spawnVehicle('sedan', p.x + 2, p.z, 0, { locked: true });
    expect(sim.enterVehicle(p, car)).toBe(false);
    car.locked = false;
    expect(sim.enterVehicle(p, car)).toBe(true);
    sim.drain(); sim.damageVehicle(car, car.maxHp, PLAYER_ID);
    expect(p.vehicle).toBe(0);
    expect(sim.drain()).toContainEqual({ t: 'exit', ped: PLAYER_ID, vehicle: car.id });
  });
  it('clears held input and arrest state and ignores nonfinite damage', () => {
    const sim = new Sim(7), p = sim.player;
    const hp = p.hp; sim.damagePed(p, NaN, 0, 'fall'); expect(p.hp).toBe(hp);
    p.fireHeld = p.aiming = p.crouch = true; p.grounded = false;
    sim.wanted.bustT = 1;
    sim.respawnPlayer('busted');
    expect([p.fireHeld,p.aiming,p.crouch,p.grounded,sim.wanted.bustT]).toEqual([false,false,false,true,0]);
  });
});

describe('Outlaw pickup and explosion edge cases', () => {
  it('collects ammunition for an owned gun without switching away from fists', () => {
    const sim = new Sim(7), p = sim.player;
    const pistol = p.guns[WEAPON_ORDER.indexOf('pistol')]!;
    pistol.reserve = 0; p.cur = 0; sim.pickups.length = 0;
    const ammo = sim.spawnPickup('ammo', p.x, p.z, { amount: 20 });
    sim.step(1 / 60, blankPedInput(), blankCarInput());
    expect(ammo.taken).toBe(true);
    expect(pistol.reserve).toBe(20);
    expect(sim.curGun(p)?.id).toBe('fist');
  });
  it('leaves duplicate full-reserve weapons available', () => {
    const sim = new Sim(7), p = sim.player;
    const pistol = p.guns[WEAPON_ORDER.indexOf('pistol')]!;
    pistol.reserve = WEAPONS.pistol.reserve; p.cur = 0; sim.pickups.length = 0;
    const pickup = sim.spawnPickup('weapon', p.x, p.z, { weapon: 'pistol' });
    sim.step(1 / 60, blankPedInput(), blankCarInput());
    expect(pickup.taken).toBe(false);
    expect(sim.curGun(p)?.id).toBe('fist');
  });
  it('ignores invalid explosion inputs without corrupting physics or crime state', () => {
    const sim = new Sim(7), p = sim.player;
    sim.drain();
    const before = [p.hp, p.vx, p.vy, p.vz, sim.wanted.heat];
    sim.explode(p.x, p.y, p.z, 0, 100, PLAYER_ID);
    sim.explode(NaN, p.y, p.z, 8, 100, PLAYER_ID);
    expect([p.hp, p.vx, p.vy, p.vz, sim.wanted.heat]).toEqual(before);
    expect(sim.drain()).toEqual([]);
  });
});
