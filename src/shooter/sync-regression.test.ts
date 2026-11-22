import { describe, expect, it, vi } from 'vitest';
import { AIR, PLAYER } from './config';
import { Match, type Player, type Vehicle } from './sim';
import { canAcceptRoomLoot, canAcceptRoomPickup, canAcceptVehicleDamageReport, easePuppet, parseLoot, WorldSync, WEAPON_IDS, type PuppetTarget } from './sync';

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
  it('accepts a valid player weapon swap within its own online loot ID range', () => {
    const sender = {id:2, remote:true, bot:false, x:30, z:-40} as Player;
    const loot = parseLoot({...base, k:'weapon', w:'rifle', i:3_001_010, x:31, z:-40})!;
    expect(canAcceptRoomLoot(loot, 2, false, sender)).toBe(true);
    expect(canAcceptRoomLoot(loot, 2, true, sender)).toBe(true);
  });
  it('rejects spoofed, distant, unsupported, and anonymous online loot', () => {
    const sender = {id:2, remote:true, bot:false, x:30, z:-40} as Player;
    const loot = parseLoot({...base, k:'weapon', w:'rifle', i:3_001_010, x:31, z:-40})!;
    expect(canAcceptRoomLoot(loot, 1, false, sender)).toBe(false);
    expect(canAcceptRoomLoot({...loot,id:2_001_010},2,false,sender)).toBe(false);
    expect(canAcceptRoomLoot({...loot,x:600},2,false,sender)).toBe(false);
    expect(canAcceptRoomLoot({...loot,kind:'medkit',weapon:null},2,false,sender)).toBe(false);
    expect(canAcceptRoomLoot(loot,2,false,undefined)).toBe(false);
    expect(canAcceptRoomLoot(loot,2,false,{...sender,bot:true})).toBe(false);
    expect(canAcceptRoomLoot({...loot,id:3_000_000},2,false,sender)).toBe(false);
  });
  it('allows the room authority to replicate distant AI death loot in its own namespace', () => {
    const host = {id:0, remote:true, bot:false, x:0,z:0} as Player;
    const loot = parseLoot({...base, k:'helmet', i:1_004_200, x:500, z:200})!;
    expect(canAcceptRoomLoot(loot,0,true,host)).toBe(true);
    expect(canAcceptRoomLoot(loot,0,false,host)).toBe(false);
  });
  it('accepts a short burst of online loot without allowing unlimited packet flooding', () => {
    const {sync} = fixture();
    const sender = {id:1,remote:true,bot:false,x:20,z:30} as Player;
    for (let i = 0; i < 12; i++) {
      const loot = parseLoot({...base,k:'weapon',w:'pistol',i:2_001_000+i,x:20,z:30})!;
      expect(sync.acceptRoomLoot(loot,1,false,sender,100+i)).toBe(true);
    }
    expect(sync.acceptRoomLoot(parseLoot({...base,k:'weapon',w:'pistol',i:2_002_000,x:20,z:30})!,1,false,sender,500)).toBe(false);
    expect(sync.acceptRoomLoot(parseLoot({...base,k:'weapon',w:'pistol',i:2_002_001,x:20,z:30})!,1,false,sender,1200)).toBe(true);
  });
  it('does not throttle multiple simultaneous AI death drops from the current host', () => {
    const {sync} = fixture();
    const host = {id:0,remote:true,bot:false,x:0,z:0} as Player;
    for (let i = 0; i < 30; i++) {
      const loot = parseLoot({...base,k:'weapon',w:'rifle',i:1_001_000+i,x:150,z:150})!;
      expect(sync.acceptRoomLoot(loot,0,true,host,100)).toBe(true);
    }
  });
  it('accepts nearby player pickups but rejects remote item deletion', () => {
    const sender = {id:1,remote:true,bot:false,x:20,z:-10} as Player;
    const loot = parseLoot({...base,k:'weapon',w:'rifle',i:2_001_001,x:22,z:-9})!;
    expect(canAcceptRoomPickup(loot,sender,false)).toBe(true);
    expect(canAcceptRoomPickup({...loot,x:500},sender,false)).toBe(false);
    expect(canAcceptRoomPickup(loot,undefined,false)).toBe(false);
    expect(canAcceptRoomPickup(loot,undefined,true)).toBe(false);
    expect(canAcceptRoomPickup({...loot,taken:true},sender,false)).toBe(false);
    expect(canAcceptRoomPickup(loot,{...sender,bot:true},false)).toBe(false);
    expect(canAcceptRoomPickup({...loot,x:500},sender,true)).toBe(true);
  });
  it('does not extrapolate a stale bot indefinitely', () => {
    const {bot} = fixture(); bot.x = bot.z = 0;
    const target: PuppetTarget = {x:0,z:0,yaw:0,pitch:0,speed:10,vx:10,vz:0,air:0,alt:0,hp:100,w:'pistol',ads:false,crouch:false,reload:false};
    for (let i=0;i<500;i++) easePuppet(bot,target,0.02);
    expect(target.x).toBeCloseTo(8); expect(bot.x).toBeLessThanOrEqual(8.001);
    expect(bot.speed).toBe(0);
  });
  it('periodically re-sends a parked car for peers who join after it stopped', () => {
    const {m, sync} = fixture();
    const car = { id:0, x:42, z:-12, yaw:0.7, speed:0, hp:300, max:300,
      lastBy:-1, driver:-1, remote:false, wreck:false, moving:false } as Vehicle;
    m.vehicles.push(car);
    for (let tick=1;tick<24;tick++) {
      const packet = sync.world(tick*125, []);
      expect(packet?.vv).toEqual([]);
    }
    const packet = sync.world(24*125, []);
    expect(packet?.vv).toEqual([car.id, 420, -120, 70, 0, 0, 0]);
  });
  it('stops predicting a remote car after 600ms without a new packet', () => {
    const {m, sync} = fixture();
    const car = { id: 0, x: 0, z: 0, yaw: 0, speed: 0, remote: true, wreck: false } as (typeof m.vehicles)[number];
    m.vehicles.push(car);
    sync.vehs.set(0, { x: 0, z: 0, yaw: 0, speed: 20, at: 0 });
    for (let i = 0; i < 100; i++) sync.step(0.02);
    expect(sync.vehs.get(0)?.x).toBeCloseTo(12);
    expect(car.x).toBeLessThanOrEqual(12.001);
    expect(car.speed).toBe(0);
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
    expect(car.speed).toBe(20);
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
  it('accepts damage reports only from the remote human currently driving that car', () => {
    const reporter = { id: 2, veh: 3, alive: true, remote: true, bot: false } as Player;
    const vehicle = { id: 3, driver: 2, remote: true, wreck: false } as Vehicle;
    expect(canAcceptVehicleDamageReport(true, vehicle, reporter, 42)).toBe(true);
    expect(canAcceptVehicleDamageReport(true, {...vehicle, driver: 4}, reporter, 42)).toBe(false);
    expect(canAcceptVehicleDamageReport(true, vehicle, {...reporter, veh: -1}, 42)).toBe(false);
    expect(canAcceptVehicleDamageReport(true, vehicle, {...reporter, bot: true}, 42)).toBe(false);
  });
  it('rejects malformed or irrelevant multiplayer vehicle damage events', () => {
    const reporter = { id: 2, veh: 3, alive: true, remote: true, bot: false } as Player;
    const vehicle = { id: 3, driver: 2, remote: true, wreck: false } as Vehicle;
    for (const damage of [0, -10, Infinity, NaN, '100']) {
      expect(canAcceptVehicleDamageReport(true, vehicle, reporter, damage)).toBe(false);
    }
    expect(canAcceptVehicleDamageReport(false, vehicle, reporter, 10)).toBe(false);
    expect(canAcceptVehicleDamageReport(true, {...vehicle, remote: false}, reporter, 10)).toBe(false);
    expect(canAcceptVehicleDamageReport(true, {...vehicle, wreck: true}, reporter, 10)).toBe(false);
    expect(canAcceptVehicleDamageReport(true, vehicle, {...reporter, alive: false}, 10)).toBe(false);
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
