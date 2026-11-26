import {describe,it,expect} from 'vitest';
import {CHUNK,WIDTH,DEPTH,DISTRICTS,HIGHWAYS,CROSS_HIGHWAY,districtAt,roadHalf,roadDistance,terrainHeight,propsFor,blocked} from '../../project-harbor/world/domain';
import {World,type ChunkData} from '../../project-harbor/world/application';

describe('Harbor free-roam world',()=>{
  it('defines six distinct districts within a connected 24 by 16 grid',()=>{
    expect(WIDTH/CHUNK).toBe(24);expect(DEPTH/CHUNK).toBe(16);
    expect(new Set(DISTRICTS.map(d=>districtAt(d.x,d.z).id)).size).toBe(6);
    for(const x of HIGHWAYS){expect(roadHalf('x',x)).toBe(15);expect(roadDistance(x,CROSS_HIGHWAY)).toBeLessThan(0);expect(terrainHeight(x,CROSS_HIGHWAY)).toBe(0);}
    expect(roadHalf('z',CROSS_HIGHWAY)).toBe(15);
  });
  it('generates deterministic props clear of road shoulders and chunk borders',()=>{
    for(let cx=0;cx<WIDTH/CHUNK;cx++)for(let cz=0;cz<DEPTH/CHUNK;cz++){
      const props=propsFor(cx,cz);expect(props).toEqual(propsFor(cx,cz));
      for(const p of props){
        expect(roadDistance(p.x,p.z)).toBeGreaterThanOrEqual(Math.max(p.w,p.d)/2+3);
        expect(p.x-p.w/2).toBeGreaterThanOrEqual(cx*CHUNK+2);
        expect(p.z-p.d/2).toBeGreaterThanOrEqual(cz*CHUNK+2);
        expect(blocked(p.x,p.z,props)).toBe(true);
      }
    }
  });
  it('streams a bounded active set with nearby detail and evicts distant chunks',()=>{
    const active=new Map<string,ChunkData>();
    const world=new World({load(c){active.set(c.cx+':'+c.cz,c);},unload(key){active.delete(key);}});
    world.stream(2);expect(active.size).toBe(2);
    world.stream(100);expect(active.size).toBe(49);
    expect([...active.values()].filter(c=>c.lod===0)).toHaveLength(9);
    world.x=64;world.z=64;world.stream(100);
    expect(active.size).toBe(16);expect(world.activeChunks).toBe(16);
    expect([...active.values()].every(c=>c.cx<=3&&c.cz<=3)).toBe(true);
  });
  it('advances time and allows movement along an unobstructed road',()=>{
    const world=new World({load(){},unload(){}});
    world.x=1088;world.z=1088;
    const before=world.z;world.move(1,0,.05,false);
    expect(world.z).toBeLessThan(before);expect(world.hours).toBeGreaterThan(10);
    world.x=2;world.yaw=-Math.PI/2;world.move(1,0,.05,true);expect(world.x).toBe(2);
  });
});
