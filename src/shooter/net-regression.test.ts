import { describe, expect, it } from 'vitest';
import { WEAPONS } from './config';
import { parseNade, parsePose, parseShot, plausibleNadeThrow, plausiblePlayerShot, RemoteNadeLimiter, type NetShot } from './net';

const human = { x: 14, z: -7, air: 0 };
const shot = (w: NetShot['w'] = 'rifle'): NetShot => ({
  w, ox: 14, oy: 1.5, oz: -7,
  ends: Array.from({length: WEAPONS[w].pellets}, () => [27, 1.5, -7]).flat(),
});

describe('ZERO ZONE online grenade sender verification', () => {
  const player = { x: 12, z: -7, air: 0, veh: -1, alive: true };
  const nade = { x: 12.5, y: 1.55, z: -6.8, vx: 17, vy: 5, vz: 0 };

  it('accepts ordinary throws and rejects impossible origins or launch speeds', () => {
    expect(plausibleNadeThrow(nade, player)).toBe(true);
    expect(plausibleNadeThrow({...nade,x:200},player)).toBe(false);
    expect(plausibleNadeThrow({...nade,z:400},player)).toBe(false);
    expect(plausibleNadeThrow({...nade,y:40},player)).toBe(false);
    expect(plausibleNadeThrow({...nade,vx:75},player)).toBe(false);
    expect(plausibleNadeThrow({...nade,vy:Infinity},player)).toBe(false);
  });
  it('does not allow parachute, vehicle or dead-player grenade spawns', () => {
    expect(plausibleNadeThrow(nade,{...player,air:3})).toBe(false);
    expect(plausibleNadeThrow(nade,{...player,veh:2})).toBe(false);
    expect(plausibleNadeThrow(nade,{...player,alive:false})).toBe(false);
  });
  it('throttles forged repeated grenades but preserves different AI owners', () => {
    const limiter = new RemoteNadeLimiter();
    expect(limiter.allow(1,100)).toBe(true);
    expect(limiter.allow(1,100)).toBe(false);
    expect(limiter.allow(1,200)).toBe(false);
    expect(limiter.allow(2,200)).toBe(true);
    expect(limiter.allow(1,1100)).toBe(true);
    expect(limiter.allow(1,1000)).toBe(false);
    expect(limiter.allow(1,Infinity)).toBe(false);
  });
  it('retains the same accepted throw after network payload parsing', () => {
    const parsed = parseNade({t:'nd',o:1,...nade});
    expect(parsed).not.toBeNull();
    expect(plausibleNadeThrow(parsed!,player)).toBe(true);
  });
});

describe('ZERO ZONE remote pose bounds', () => {
  const valid = {t:'p',x:30,z:-20,yaw:0,pitch:0,hp:100,ar:150,w:'pistol',sp:7,ad:0,rl:0,cr:0};
  it('preserves valid map poses and the aircraft departure position', () => {
    expect(parsePose(valid)).not.toBeNull();
    expect(parsePose({...valid,x:500,a:1,al:320})?.air).toBe(1);
  });
  it('rejects absurd remote coordinates, health and malformed parachute altitude', () => {
    expect(parsePose({...valid,x:1_000_001})).toBeNull();
    expect(parsePose({...valid,z:-1_000_001})).toBeNull();
    expect(parsePose({...valid,hp:999})).toBeNull();
    expect(parsePose({...valid,a:3,al:999})).toBeNull();
    expect(parsePose({...valid,a:3,al:undefined})).toBeNull();
    expect(parsePose({...valid,a:2.5,al:300})).toBeNull();
  });
  it('rejects invalid vehicle IDs and incomplete vehicle poses', () => {
    expect(parsePose({...valid,v:1.5})).toBeNull();
    expect(parsePose({...valid,vs:[5,6,7]})).toBeNull();
    expect(parsePose({...valid,vs:[5,6,7,Infinity]})).toBeNull();
    expect(parsePose({...valid,vs:[5,6,7,8],v:0})?.vs).toEqual([5,6,7,8]);
  });
});
describe('ZERO ZONE remote human shot authorization', () => {
  it('allows normal rifle and shotgun pellet counts in both online modes', () => {
    expect(plausiblePlayerShot(shot('rifle'), human)).toBe(true);
    expect(plausiblePlayerShot(shot('shotgun'), human)).toBe(true);
  });
  it('rejects weapon fire originating far away from the last known player pose', () => {
    expect(plausiblePlayerShot({...shot(),ox:115},human)).toBe(false);
    expect(plausiblePlayerShot({...shot(),oz:90},human)).toBe(false);
  });
  it('rejects shots fired from an impossible eye height or during parachuting', () => {
    expect(plausiblePlayerShot({...shot(),oy:50},human)).toBe(false);
    expect(plausiblePlayerShot(shot(),{...human,air:2})).toBe(false);
  });
  it('rejects altered pellet counts and endpoints beyond the weapon range', () => {
    const normal = shot('shotgun');
    expect(plausiblePlayerShot({...normal,ends:normal.ends.slice(3)},human)).toBe(false);
    const rifle = shot('rifle');
    expect(plausiblePlayerShot({...rifle,ends:[WEAPONS.rifle.range+100,1.5,0]},human)).toBe(false);
  });
  it('rejects non-finite coordinates even when called before packet parsing', () => {
    expect(plausiblePlayerShot({...shot(),ox:NaN},human)).toBe(false);
    expect(plausiblePlayerShot({...shot(),ends:[Infinity,0,0]},human)).toBe(false);
  });
  it('keeps accepting ordinary wire shots with rounded positions', () => {
    const normal = shot('rifle');
    const packet = parseShot({t:'sh',w:normal.w,ox:normal.ox,oy:normal.oy,oz:normal.oz,e:normal.ends});
    expect(packet).not.toBeNull();
    expect(plausiblePlayerShot(packet!,human)).toBe(true);
  });
});
