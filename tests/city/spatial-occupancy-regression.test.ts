import {describe,expect,it} from 'vitest';
import {World} from '../../src/city/world';
import {emptyMap} from '../../src/city/map';
import {updateVehicles} from '../../src/city/actors';

const make=()=>{const w=new World({seed:9,difficulty:'d4',klass:'warlord',tutorial:true});w.map=emptyMap();w.vehicles=[];return w;};

describe('LAST CITY stale occupants and spatial-index integrity',()=>{
  it('does not eject or damage a boss whose ID is stale on an exploding empty car',()=>{
    const w=make(),b=w.boss(0)!,old={x:b.x,y:b.y,hp:b.hp};
    const v=w.spawnVehicle('sedan',b.x+600,b.y+600,0);
    v.driver=b.id;v.f=0;v.burn=0.01;b.inVeh=0;
    updateVehicles(w,0.03);
    expect(v.alive).toBe(false);
    expect(b.hp).toBe(old.hp);expect(b.inVeh).toBe(0);
    expect(b.x).toBe(old.x);expect(b.y).toBe(old.y);
  });
  it('still detaches the real occupant when its car burns down',()=>{
    const w=make(),b=w.boss(0)!;
    const v=w.spawnVehicle('sedan',b.x,b.y,0);v.driver=b.id;v.f=0;b.inVeh=v.id;v.burn=0.01;
    updateVehicles(w,0.03);
    expect(v.alive).toBe(false);expect(b.inVeh).toBe(0);
    expect(b.hp).toBeLessThan(b.maxHp);
  });
  it('skips actors with invalid position instead of throwing during grid rebuild',()=>{
    const w=make(),b=w.boss(0)!,x=b.x,y=b.y;
    b.x=NaN;
    expect(()=>w.refreshActorGrid()).not.toThrow();
    let hits=0;w.forNear(x,y,30,a=>{if(a===b)hits++;});
    expect(hits).toBe(0);
  });
  it('rejects malformed spatial queries before touching indexed cells',()=>{
    const w=make();w.refreshActorGrid();
    let hits=0;const mark=()=>{hits++;};
    for(const args of [[NaN,0,50],[0,Infinity,50],[0,0,NaN],[0,0,-10],[0,0,Infinity]])w.forNear(args[0],args[1],args[2],mark);
    expect(hits).toBe(0);
  });
});
