import {describe,expect,it} from 'vitest';
import {World} from '../../src/city/world';

const finite=(...args:number[])=>args.every(Number.isFinite);
describe('LAST CITY 20-second deterministic simulation regression',()=>{
  it.each([7,17])('keeps actors, vehicles and projectiles finite with seven competing factions (seed %i)',seed=>{
    const w=new World({seed,difficulty:'d4',klass:'warlord',autoPlayer:true});
    for(let frame=0;frame<1200&&!w.over;frame++){
      w.step(1/60);
      if(frame%60!==0)continue;
      for(const a of w.actors)if(a.alive){
        expect(finite(a.x,a.y,a.ang,a.hp,a.maxHp,a.vx,a.vy)).toBe(true);
        expect(a.maxHp).toBeGreaterThan(0);
        expect(w.byId.get(a.id)).toBe(a);
      }
      for(const v of w.vehicles)if(v.alive){
        expect(finite(v.x,v.y,v.vx,v.vy,v.hp,v.ang,v.burn)).toBe(true);
        expect(v.maxHp).toBeGreaterThan(0);
      }
      for(const b of w.bullets)expect(finite(b.x,b.y,b.vx,b.vy,b.dmg,b.life)).toBe(true);
    }
    expect(w.actors.length).toBeLessThan(2000);
    expect(w.vehicles.length).toBeLessThan(800);
    expect(w.bullets.length).toBeLessThan(1200);
  },45000);
});
