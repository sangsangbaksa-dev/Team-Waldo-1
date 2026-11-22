import { describe, expect, it, vi } from 'vitest';
import { AIR, PLAYER } from './config';
import { Match } from './sim';
import { easePuppet, parseLoot, WorldSync, WEAPON_IDS, type PuppetTarget } from './sync';

function fixture() {
  const m = new Match({seed: 42, mode: 'duel', difficulty: 'normal', humans: [{name:'A'}], fill: 2, authority: false});
  return {m, bot: m.players[1], sync: new WorldSync(m)};
}
const base = { t: 'la', i: 999, x: 0, z: 0, w: null, p: null, l: 0 };
describe('network synchronization regressions', () => {
  it('rejects weapons without a weapon ID', () => {
    expect(parseLoot({...base,k:'weapon'})).toBeNull();
  });
  it('rejects attachments without a part ID', () => {
    expect(parseLoot({...base,k:'attach'})).toBeNull();
  });
  it('rejects a weapon ID on nonweapon loot', () => {
    expect(parseLoot({...base,k:'ammo',w:'rifle'})).toBeNull();
  });
  it('rejects incompatible attachments received over the network', () => {
    expect(parseLoot({...base,k:'weapon',w:'pistol',a:{sight:'scope8'}})).toBeNull();
  });
  it('keeps valid rifle attachments', () => {
    expect(parseLoot({...base,k:'weapon',w:'rifle',a:{sight:'scope8'}})?.att?.sight).toBe('scope8');
  });
  it('normalizes missing helmet level to one', () => {
    expect(parseLoot({...base,k:'helmet'})?.level).toBe(1);
  });
  it('does not extrapolate a stale bot indefinitely', () => {
    const {bot} = fixture(); bot.x = bot.z = 0;
    const target: PuppetTarget = {x:0,z:0,yaw:0,pitch:0,speed:10,vx:10,vz:0,air:0,alt:0,hp:100,w:'pistol',ads:false,crouch:false,reload:false};
    for (let i=0;i<500;i++) easePuppet(bot,target,0.02);
    expect(target.x).toBeCloseTo(8); expect(bot.x).toBeLessThanOrEqual(8.001);
  });
  it('stops predicting a remote car after 600ms without a new packet', () => {
    const {m, sync} = fixture();
    const car = { id: 0, x: 0, z: 0, yaw: 0, speed: 0, remote: true, wreck: false } as (typeof m.vehicles)[number];
    m.vehicles.push(car);
    sync.vehs.set(0, { x: 0, z: 0, yaw: 0, speed: 20, at: 0 });
    for (let i = 0; i < 100; i++) sync.step(0.02);
    expect(sync.vehs.get(0)?.x).toBeCloseTo(12);
    expect(car.x).toBeLessThanOrEqual(12.001);
  });
  it('starts predicting a remote car again after a fresh packet', () => {
    const {m, sync} = fixture();
    const car = { id: 0, x: 0, z: 0, yaw: 0, speed: 0, remote: true, wreck: false } as (typeof m.vehicles)[number];
    m.vehicles.push(car);
    sync.vehs.set(0, { x: 0, z: 0, yaw: 0, speed: 20, at: 0, extrapolated: 0.6 });
    sync.step(0.02);
    expect(sync.vehs.get(0)?.x).toBe(0);
    sync.vehs.set(0, { x: 15, z: 0, yaw: 0, speed: 20, at: 1000 });
    sync.step(0.1);
    expect(sync.vehs.get(0)?.x).toBeCloseTo(17);
  });
  it('only updates collision boxes when a parked remote car actually moves', () => {
    const {m, sync} = fixture();
    const car = { id: 0, x: 12, z: 15, yaw: 0, speed: 0, driver: -1, remote: true, wreck: false, moving: false } as (typeof m.vehicles)[number];
    m.vehicles.push(car);
    const parkBox = vi.spyOn(m, 'parkBox').mockImplementation(() => {});
    sync.vehicleState(car, 12, 15, 0, 0, -1, false, 100);
    expect(parkBox).not.toHaveBeenCalled();
    sync.vehicleState(car, 13, 15, 0, 0, -1, false, 200);
    expect(parkBox).toHaveBeenCalledTimes(1);
    sync.vehicleState(car, 13, 15, 0, 0, -1, false, 300);
    expect(parkBox).toHaveBeenCalledTimes(1);
    parkBox.mockRestore();
  });
  it('rejects out-of-bounds bot coordinates', () => {
    const {sync,bot}=fixture();
    sync.apply({t:'w', b:[bot.id, 10001, 0,0,0,0,0,0,0,0,0,100]},0);
    expect(sync.bots.has(bot.id)).toBe(false);
  });
  it('clamps remote health and altitude to simulation limits', () => {
    const {sync,bot}=fixture();
    sync.apply({t:'w', b:[bot.id,0,0,0,0,0,0,0,0,3,9999,9999]},0);
    expect(sync.bots.get(bot.id)?.alt).toBe(AIR.alt);
    expect(sync.bots.get(bot.id)?.hp).toBe(PLAYER.hp);
  });
  it('ignores bot shot packets with excess pellets', () => {
    const {m,sync,bot}=fixture(); m.events=[];
    const w=WEAPON_IDS.indexOf('pistol');
    sync.apply({t:'w',s:[[bot.id,w,0,100,0,100,10,0,200,10,0]]},0);
    expect(m.events.some(e=>e.t==='shot')).toBe(false);
  });
  it('ignores bot shot packets with impossible origins', () => {
    const {m,sync,bot}=fixture(); m.events=[];
    sync.apply({t:'w',s:[[bot.id,WEAPON_IDS.indexOf('pistol'),100001,100,0,100,10,0]]},0);
    expect(m.events.some(e=>e.t==='shot')).toBe(false);
  });
});
