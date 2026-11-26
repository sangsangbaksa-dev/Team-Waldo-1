import * as T from 'three';
import {CHUNK, districtAt, roadHalf, terrainHeight, type WorldProp} from './domain';
import {chunkKey,type ChunkData,type ChunkView} from './application';
import {PROFILES} from './civic/regions';
type Part={geometry:T.BufferGeometry;x:number;y:number;z:number;sx:number;sy:number;sz:number;color:number;yaw:number;glow:boolean};
export class ThreeChunks implements ChunkView {
  private readonly chunks=new Map<string,T.Group>();
  private readonly box=new T.BoxGeometry(1,1,1);
  private readonly cone=new T.ConeGeometry(.5,1,7);
  private readonly cylinder=new T.CylinderGeometry(.5,.5,1,7);
  private readonly material=new T.MeshStandardMaterial({roughness:.91});
  private readonly glowMaterial=new T.MeshStandardMaterial({roughness:.4,emissive:0xffe2a8,emissiveIntensity:.8});
  private readonly grounds=new Map<number,T.MeshStandardMaterial>();
  constructor(private readonly scene:T.Scene){}
  setNight(amount:number){this.glowMaterial.emissiveIntensity=.25+Math.max(0,Math.min(1,amount))*1.6;}
  private part(p:WorldProp,lod:0|1):Part[]{
    const y=terrainHeight(p.x,p.z);
    const yaw=p.yaw??0;
    const make=(geometry:T.BufferGeometry,x:number,z:number,dy:number,sx:number,sy:number,sz:number,color:number,glow=false,turn=yaw):Part=>({geometry,x,y:y+dy,z,sx,sy,sz,color,yaw:turn,glow});
    const b=(dy:number,w:number,h:number,d:number,c:number,glow=false)=>make(this.box,p.x,p.z,dy,w,h,d,c,glow);
    const look=PROFILES[districtAt(p.x,p.z).id];
    if(p.kind==='tree')return [
      make(this.cylinder,p.x,p.z,p.h*.28,.55,p.h*.56,.55,0x63513c),
      make(this.cone,p.x,p.z,p.h*.71,p.h*.48,p.h*.7,p.h*.48,p.color)
    ];
    if(p.kind==='cactus')return [make(this.cylinder,p.x,p.z,p.h/2,.75,p.h,.75,p.color),...(lod===0?[make(this.box,p.x+.65,p.z,p.h*.6,1.4,.45,.45,p.color)]:[])];
    if(p.kind==='lamp')return [
      make(this.cylinder,p.x,p.z,p.h*.46,.16,p.h*.9,.16,p.color,false,0),
      make(this.box,p.x,p.z,p.h*.94,.55,.28,.55,look.lamp,true,0),
    ];
    if(p.kind==='plant')return [make(this.cone,p.x,p.z,p.h*.55,p.w,p.h,p.d,p.color)];
    const parts=[b(p.h/2,p.w,p.h,p.d,p.color)];
    if(lod===0){
      if(p.kind==='tower'){
        parts.push(b(p.h+.35,p.w*.85,.7,p.d*.85,look.roof));
        for(let floor=4;floor<p.h-2;floor+=8){
          parts.push(make(this.box,p.x,p.z+p.d/2+.015,floor,p.w*.83,.9,.035,look.window,false,0));
          parts.push(make(this.box,p.x+p.w/2+.015,p.z,floor,.035,.9,p.d*.83,look.window,false,0));
        }
      }else if(p.kind==='house'){
        parts.push(b(p.h+.45,p.w*1.08,.9,p.d*1.08,look.roof));
        parts.push(make(this.cylinder,p.x+p.w*.22,p.z-p.d*.18,p.h+1.15,.32,1.1,.32,look.roof,false,0));
        parts.push(make(this.box,p.x,p.z+p.d/2+.02,1.3,1.5,2.1,.05,look.window,false,0));
      }else if(p.kind==='shack'){
        parts.push(b(p.h+.35,p.w*1.16,.55,p.d*1.05,look.roof));
        parts.push(make(this.box,p.x,p.z+p.d/2+.02,1.1,1.3,1.6,.05,look.window,false,yaw+0.04));
      }else if(p.kind==='hangar'){
        parts.push(b(p.h+.4,p.w*1.04,.7,p.d*1.04,look.roof));
        parts.push(b(p.h*.55,p.w*1.02,.28,p.d*1.02,0xc4b15a));
        parts.push(make(this.box,p.x,p.z+p.d/2+.02,1.4,3.2,2.4,.05,0x2e3328,false,0));
      }else if(p.kind==='stall'){
        parts.push(make(this.box,p.x,p.z,p.h+0.15,p.w*1.15,.12,p.d*.7,look.roof,false,yaw));
      }
    }
    return parts;
  }
  load(data:ChunkData){
    const {cx,cz,props,lod}=data,key=chunkKey(cx,cz);
    this.unload(key);
    const group=new T.Group(), x=cx*CHUNK,z=cz*CHUNK;
    const geometry=new T.PlaneGeometry(CHUNK,CHUNK,16,16);
    geometry.rotateX(-Math.PI/2);
    const positions=geometry.attributes.position!;
    for(let i=0;i<positions.count;i++){
      positions.setY(i,terrainHeight(x+CHUNK/2+positions.getX(i),z+CHUNK/2+positions.getZ(i)));
    }
    geometry.computeVertexNormals();
    const tint=districtAt(x+64,z+64).color;
    let groundMaterial=this.grounds.get(tint);
    if(!groundMaterial){groundMaterial=new T.MeshStandardMaterial({color:tint,roughness:1});this.grounds.set(tint,groundMaterial);}
    const ground=new T.Mesh(geometry,groundMaterial);
    ground.position.set(x+64,0,z+64);group.add(ground);
    const parts:Part[]=[];
    const add=(px:number,py:number,pz:number,w:number,h:number,d:number,color:number)=>parts.push({geometry:this.box,x:px,y:py,z:pz,sx:w,sy:h,sz:d,color,yaw:0,glow:false});
    const vx=roadHalf('x',x+64),hz=roadHalf('z',z+64);
    if(vx){
      add(x+64,.04,z+64,vx*2,.12,CHUNK,0x363b3e);
      for(let n=8;n<128;n+=16)if(!hz||Math.abs(n-64)>hz+4)add(x+64,.115,z+n,.18,.018,7,0xd6cba7);
      if(lod===0)for(const side of [-1,1]){ const px=x+64+side*(vx+.6); if(hz){const span=64-hz-1;add(px,.045,z+span/2,1.2,.1,span,0x95948a);add(px,.045,z+128-span/2,1.2,.1,span,0x95948a);}else add(px,.045,z+64,1.2,.1,CHUNK,0x95948a); }
    }
    if(hz){
      // Slight vertical offset prevents intersection z-fighting.
      add(x+64,.052,z+64,CHUNK,.12,hz*2,0x363b3e);
      for(let n=8;n<128;n+=16)if(!vx||Math.abs(n-64)>vx+4)add(x+n,.13,z+64,7,.018,.18,0xd6cba7);
      if(lod===0)for(const side of [-1,1]){ const pz=z+64+side*(hz+.6); if(vx){const span=64-vx-1;add(x+span/2,.05,pz,span,.1,1.2,0x95948a);add(x+128-span/2,.05,pz,span,.1,1.2,0x95948a);}else add(x+64,.05,pz,CHUNK,.1,1.2,0x95948a); }
    }
    if(vx&&hz&&lod===0)for(let stripe=-3;stripe<=3;stripe++)add(x+64+stripe*1.15,.16,z+64,.42,.02,Math.min(vx,hz)*1.15,0xf4f1ea);
    for(const p of props){if(p.detail&&lod!==0)continue;parts.push(...this.part(p,lod));}
    const buckets=new Map<string,{shape:T.BufferGeometry;glow:boolean;list:Part[]}>();
    for(const p of parts){
      const key=(p.glow?'g:':'s:')+p.geometry.uuid;
      const bucket=buckets.get(key)??{shape:p.geometry,glow:p.glow,list:[]};
      bucket.list.push(p);buckets.set(key,bucket);
    }
    const dummy=new T.Object3D(), color=new T.Color();
    for(const bucket of buckets.values()){
      const mesh=new T.InstancedMesh(bucket.shape,bucket.glow?this.glowMaterial:this.material,bucket.list.length);
      bucket.list.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.yaw,0);dummy.scale.set(p.sx,p.sy,p.sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,color.setHex(p.color));});
      if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
      mesh.matrixAutoUpdate=false;mesh.computeBoundingSphere();group.add(mesh);
    }
    this.scene.add(group);this.chunks.set(key,group);
  }
  unload(key:string){
    const group=this.chunks.get(key);if(!group)return;
    this.scene.remove(group);
    for(const child of group.children){
      if(child instanceof T.InstancedMesh)child.dispose();
      else if(child instanceof T.Mesh)child.geometry.dispose();
    }
    this.chunks.delete(key);
  }
}
