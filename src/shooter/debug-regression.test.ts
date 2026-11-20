import { describe, expect, it } from 'vitest';
import { AIR, DRIVE, WEAPONS } from './config';
import { Match, type Vehicle } from './sim';
import { addBox, rayWorld, type GameMap, type Loot, type Box } from './world';

function match() {
  const m = new Match({seed:37,mode:'duel',difficulty:'normal',humans:[{name:'A'},{name:'B'}]});
  m.loot = []; m.map.boxes = []; m.map.grid.clear();
  const p = m.players[0], q = m.players[1]; p.x = p.z = 0; q.x = 80; q.z = 80;
  return {m,p,q};
}
const weapon = (id: number, weapon: 'pistol' | 'rifle'): Loot => ({id,kind:'weapon',weapon,x:0,z:0,taken:false});
function emptyMap(): GameMap { return {boxes:[],grid:new Map()} as unknown as GameMap; }
const box = (x0:number,z0:number,x1:number,z1:number):Box => ({x0,z0,x1,z1,y0:0,y1:3,kind:'wall',tex:0});

describe('ZERO ZONE debugging regressions', () => {
  it('consumes a slot request when the requested slot is empty', () => {
    const {m,p} = match(); p.input.slot = 1; m.step(1/60);
    expect(p.input.slot).toBe(-1); expect(p.cur).toBe(0);
  });
  it('does not start reload while actively healing', () => {
    const {m,p} = match(); p.hp = 40; p.kits = 1; p.guns[0]!.mag = 4;
    p.input.heal = 2; p.input.reload = true; m.step(1/60);
    expect(p.healT).toBeGreaterThan(0); expect(p.reload).toBe(0);
  });
  it('does not consume a duplicate weapon when ammo is already full', () => {
    const {m,p} = match(); p.guns[0]!.reserve = WEAPONS.pistol.mag*6;
    const l = weapon(999,'pistol'); m.loot.push(l); p.input.interact = true; m.step(1/60);
    expect(l.taken).toBe(false);
  });
  it('continues searching after an unusable duplicate weapon', () => {
    const {m,p} = match(); p.guns[0]!.reserve = WEAPONS.pistol.mag*6;
    const a = weapon(999,'pistol'), b = weapon(1000,'rifle'); m.loot.push(a,b);
    p.input.interact = true; m.step(1/60);
    expect(a.taken).toBe(false); expect(b.taken).toBe(true);
  });
  it('does not reduce an existing cooldown when picking up a new gun', () => {
    const {m,p} = match(); p.cd = 0.8; m.loot.push(weapon(999,'rifle'));
    p.input.interact = true; m.step(1/60); expect(p.cd).toBeGreaterThan(0.7);
  });
  it('prefers fitting an attachment to the spare weapon over downgrading the current weapon', () => {
    const {m,p} = match(); p.guns[0] = {id:'rifle',mag:30,reserve:30,att:{sight:'scope4'}};
    const spare = {id:'smg' as const,mag:30,reserve:30,att:{}}; p.guns[1] = spare;
    expect(m.partTarget(p,'reddot')).toEqual({gun:spare,fit:'new'});
  });
  it('does not multiply shotgun pellet damage by pellet count a second time', () => {
    const {m,p} = match();
    const car = {id:0,kind:'car',x:5,z:0,yaw:0,w:4,d:2,h:2,hp:300,max:300,driver:-1,wreck:false,moving:true} as Vehicle;
    m.vehicles.push(car); m.bullet(p.id,'shotgun',0,1,0,0,0,[],false);
    expect(car.hp).toBeCloseTo(300-WEAPONS.shotgun.dmg*DRIVE.shotCut);
  });
  it('keeps last attacker when zone damage occurs', () => {
    const {m,p,q} = match(); m.damage(p,5,q.id,'pistol',false,0,1,0,false);
    m.damage(p,1,-1,'zone',false,0,1,0,true); expect(p.lastHitBy).toBe(q.id);
  });
  it('preserves horizontal acceleration while descending', () => {
    const m = new Match({seed:19,mode:'br',difficulty:'normal',humans:[{name:'A'}],fill:1,air:true});
    const p = m.players[0]; p.air=2; p.alt=280; p.x=p.z=0; p.input.yaw=0; p.input.mz=1;
    m['stepAir'](p,0.1); const previous=p.vx; m['stepAir'](p,0.1);
    expect(p.vx).toBeGreaterThan(previous);
  });
  it('uses parachute descent speed immediately when opened', () => {
    const m = new Match({seed:19,mode:'br',difficulty:'normal',humans:[{name:'A'}],fill:1,air:true});
    const p=m.players[0]; p.air=2; p.alt=200; p.input.jump=true; p.jumpHeld=false; m['stepAir'](p,0.1);
    expect(p.air).toBe(3); expect(p.alt).toBeCloseTo(200-AIR.chute*0.1);
  });
});

describe('exact world grid ray traversal', () => {
  it('detects a thin wall inside a briefly crossed neighboring cell', () => {
    const m=emptyMap(); addBox(m,box(16.05,15.6,16.2,15.95));
    const d=Math.SQRT1_2;
    expect(rayWorld(m,15,1,14.8,d,0,d,10)).toBeCloseTo(1.05/d);
  });
  it('detects a box with an index above the old 16384-entry mask', () => {
    const m=emptyMap(); addBox(m,box(2,8,3,9));
    for(let i=1;i<16384;i++) m.boxes.push(box(90,90,91,91));
    addBox(m,box(5,0.2,6,0.8));
    expect(rayWorld(m,0,1,0.5,1,0,0,15)).toBeCloseTo(5);
  });
  it('does not skip exact grid boundaries', () => {
    const m=emptyMap(); addBox(m,box(1,15.5,3,16));
    expect(rayWorld(m,0,1,16,1,0,0,10)).toBe(1);
  });
  it('does not hit a wall beyond the requested ray distance', () => {
    const m=emptyMap(); addBox(m,box(5,-1,6,1));
    expect(rayWorld(m,0,1,0,1,0,0,4)).toBe(Infinity);
  });
  it('handles vertical rays without grid stepping', () => {
    const m=emptyMap(); addBox(m,box(-1,-1,1,1));
    expect(rayWorld(m,0,5,0,0,-1,0,10)).toBe(2);
  });
  it('returns no hit for invalid ray values', () => {
    const m=emptyMap(); expect(rayWorld(m,0,1,0,NaN,0,0,5)).toBe(Infinity);
  });
});
