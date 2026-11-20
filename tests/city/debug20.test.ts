import {describe,it,expect} from 'vitest';
import {World} from '../../src/city/world';
import {emptyMap,navBlocked,clearLine} from '../../src/city/map';
import {switchWeapon,updateVehicles} from '../../src/city/actors';
import {CIV} from '../../src/city/defs';
function sandbox(){const w=new World({seed:7,difficulty:'d4',klass:'tycoon',tutorial:true});w.map=emptyMap();w.vehicles=[];return w;}
describe('LAST CITY defensive regressions',()=>{
it('rejects fractional and nonfinite weapon selection',()=>{const w=sandbox();switchWeapon(w,0,NaN);switchWeapon(w,0,0.5);expect(w.factions[0].cur).toBe(0);});
it('does not create ammunition from an empty pickup',()=>{const w=sandbox(),f=w.factions[0];w.giveWeapon(f,'railgun',0);expect(f.slots.some(s=>s.id==='railgun')).toBe(false);});
it('does not reload the current magazine by collecting reserve ammo',()=>{const w=sandbox(),f=w.factions[0];w.giveWeapon(f,'railgun',5);const s=f.slots.find(s=>s.id==='railgun')!;s.mag=0;w.giveWeapon(f,'railgun',5);expect(s.mag).toBe(0);expect(s.ammo).toBe(10);});
it('clears a reload when equipping another pickup',()=>{const w=sandbox(),f=w.factions[0];f.reloadT=1;w.giveWeapon(f,'rifle',20);expect(f.reloadT).toBe(0);});
it('clears pending reload on death',()=>{const w=sandbox(),f=w.factions[0];f.reloadT=1;w.killActor(w.boss(0)!,1);expect(f.reloadT).toBe(0);});
it('rejects invalid damage without poisoning health',()=>{const w=sandbox(),b=w.boss(0)!,hp=b.hp;w.hurtActor(b,NaN,1);w.hurtActor(b,-10,1);expect(b.hp).toBe(hp);});
it('rejects invalid structure and vehicle damage',()=>{const w=sandbox(),s=w.hq(0)!,v=w.spawnVehicle('sedan',400,400,0);w.hurtStruct(s,NaN,1);w.hurtVehicle(v,-20,1);expect(s.hp).toBe(s.maxHp);expect(v.hp).toBe(v.maxHp);});
it('does not damage a vehicle with a stale occupant link',()=>{const w=sandbox(),a=w.boss(0)!,v=w.spawnVehicle('sedan',400,400,0);a.inVeh=v.id;w.hurtActor(a,20,1);expect(a.inVeh).toBe(0);expect(a.hp).toBeLessThan(a.maxHp);expect(v.hp).toBe(v.maxHp);});
it('does not detach the real driver when a stale occupant dies',()=>{const w=sandbox(),a=w.boss(0)!,b=w.boss(1)!,v=w.spawnVehicle('sedan',400,400,0);a.inVeh=b.inVeh=v.id;v.driver=b.id;w.killActor(a,1);expect(v.driver).toBe(b.id);});
it('does not clear the actual driver when stale actor exits',()=>{const w=sandbox(),a=w.boss(0)!,b=w.boss(1)!,v=w.spawnVehicle('sedan',400,400,0);a.inVeh=b.inVeh=v.id;v.driver=b.id;const x=a.x;w.toggleVehicle(0);expect(a.inVeh).toBe(0);expect(a.x).toBe(x);expect(v.driver).toBe(b.id);});
it('pushes a pedestrian at the exact car center away',()=>{const w=sandbox(),a=w.spawnActor('civ',CIV,400,400),v=w.spawnVehicle('sedan',400,400,0);w.refreshActorGrid();updateVehicles(w,1/30);expect(Math.hypot(a.x-v.x,a.y-v.y)).toBeGreaterThanOrEqual(v.r+a.r-0.01);});
it('does not corrupt simulation for invalid dt',()=>{const w=sandbox(),t=w.time;w.step(NaN);w.step(-1);expect(w.time).toBe(t);});
it('rejects invalid navigation coordinates',()=>{const m=emptyMap();expect(navBlocked(m,NaN,0)).toBe(true);expect(clearLine(m,0,0,Infinity,0)).toBe(false);});
});
