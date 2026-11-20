// Street furniture adapted from OUTLAW CITY's procedural bench/bus_stop design
// (src/outlaw/cityview.ts). The two new consumers share meshes, not game state.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CityMap } from '../city/map';
import type { Track } from '../race/track';
import { BLOCK } from '../city/defs';

export type Furniture = {kind:'bench'|'shelter';x:number;y:number;z:number;yaw:number;scale:number};
export function parkFurniture(map: Pick<CityMap,'blocks'|'trees'|'solids'>,quality:'low'|'standard'|'high'):Furniture[]{
  const out:Furniture[]=[];
  for(const block of map.blocks){
    if(block.type!=='park'&&block.type!=='plaza')continue;
    const candidates=[[BLOCK/2-52,24,0],[BLOCK/2+52,BLOCK-24,Math.PI],[24,BLOCK/2,Math.PI/2],[BLOCK-24,BLOCK/2,-Math.PI/2]];
    for(const [dx,dz,yaw] of candidates){
      const x=block.x+dx,z=block.y+dz,r=37;
      if(map.trees.some(t=>Math.hypot(t.x-x,t.y-z)<r+t.r))continue;
      if(map.solids.some(s=>s.alive&&x+r>s.x&&x-r<s.x+s.w&&z+r>s.y&&z-r<s.y+s.h))continue;
      out.push({kind:'bench',x,y:0.08,z,yaw,scale:21});
      if(quality==='low'||quality==='standard'&&out.filter(o=>o.x>=block.x&&o.x<block.x+BLOCK&&o.z>=block.y&&o.z<block.y+BLOCK).length>=2)break;
    }
  }
  return out;
}
export function startFurniture(t:Track,low:boolean):Furniture[]{
  const out:Furniture[]=[];
  for(const side of [-1,1]){
    const i=Math.min(t.n-1,2),lat=side*(t.halfWidth+5.4),x=t.x[i]-t.tz[i]*lat,z=t.z[i]+t.tx[i]*lat;
    // Never place scenery against another branch of the road.
    if(t.x.some((px,j)=>Math.hypot(px-x,t.z[j]-z)<t.halfWidth+2.0))continue;
    out.push({kind:low?'bench':'shelter',x,y:t.y[i]+0.04,z,yaw:-Math.atan2(t.tz[i],t.tx[i])+(side>0?Math.PI:0),scale:1});
  }
  return out;
}
function geometry(kind:Furniture['kind']):THREE.BufferGeometry{
  const parts:THREE.BufferGeometry[]=[];
  const b=(w:number,h:number,d:number,x:number,y:number,z:number,color:number):void=>{
    const g=new THREE.BoxGeometry(w,h,d).translate(x,y,z),c=new THREE.Color(color),v=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<v.length;i+=3){v[i]=c.r;v[i+1]=c.g;v[i+2]=c.b;}
    g.setAttribute('color',new THREE.BufferAttribute(v,3));parts.push(g);
  };
  // Source geometry proportions: OUTLAW CITY bench/bus stop.
  for(let i=0;i<4;i++)b(2.7,0.10,0.14,0,0.65,-0.25+i*0.17,0x94745b);
  for(let i=0;i<3;i++)b(2.7,0.15,0.12,0,0.83+i*0.18,-0.3,0x94745b);
  for(const side of [-1,1]){
    b(.12,.65,.5,side,.33,0,0x3e484a);
    b(.10,.16,.61,side,0.92,0,0x3e484a);
  }
  if(kind==='shelter'){
    b(3.5,.15,1.7,0,2.7,0,0x46545a);
    for(const side of [-1,1])b(.1,2.7,.1,side*1.6,1.35,-.7,0x46545a);
    b(3.4,.2,.12,0,2.55,0.78,0x334049);
    b(3.2,.055,.07,0,2.43,0.79,0xd1e4ec);
  }
  const g=mergeGeometries(parts)!;parts.forEach(p=>p.dispose());return g;
}
export function addStreetFurniture(scene:THREE.Scene,items:readonly Furniture[]):{dispose():void}{
  const root=new THREE.Group(),mat=new THREE.MeshLambertMaterial({vertexColors:true}),geos:THREE.BufferGeometry[]=[];
  const d=new THREE.Object3D();
  for(const kind of ['bench','shelter'] as const){
    const list=items.filter(o=>o.kind===kind);if(!list.length)continue;
    const geo=geometry(kind);geos.push(geo);
    const mesh=new THREE.InstancedMesh(geo,mat,list.length);
    list.forEach((p,i)=>{d.position.set(p.x,p.y,p.z);d.rotation.set(0,p.yaw,0);d.scale.setScalar(p.scale);d.updateMatrix();mesh.setMatrixAt(i,d.matrix);});
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();root.add(mesh);
  }
  scene.add(root);
  return {dispose(){scene.remove(root);root.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.dispose();});geos.forEach(g=>g.dispose());mat.dispose();}};
}
