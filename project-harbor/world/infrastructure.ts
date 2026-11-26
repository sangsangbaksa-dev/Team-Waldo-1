import * as T from 'three';
import {CHUNK, districtAt, roadHalf, terrainHeight, type WorldProp} from './domain';
import {chunkKey,type ChunkData,type ChunkView} from './application';
type Part={geometry:T.BufferGeometry;x:number;y:number;z:number;sx:number;sy:number;sz:number;color:number};
export class ThreeChunks implements ChunkView {
  private readonly chunks=new Map<string,T.Group>();
  private readonly box=new T.BoxGeometry(1,1,1);
  private readonly cone=new T.ConeGeometry(.5,1,7);
  private readonly cylinder=new T.CylinderGeometry(.5,.5,1,7);
  private readonly material=new T.MeshStandardMaterial({roughness:.91});
  constructor(private readonly scene:T.Scene){}
  private part(p:WorldProp,lod:0|1):Part[]{
    const y=terrainHeight(p.x,p.z);
    const make=(geometry:T.BufferGeometry,x:number,z:number,dy:number,sx:number,sy:number,sz:number,color:number):Part=>({geometry,x,y:y+dy,z,sx,sy,sz,color});
    const b=(dy:number,w:number,h:number,d:number,c:number)=>make(this.box,p.x,p.z,dy,w,h,d,c);
    if(p.kind==='tree')return [
      make(this.cylinder,p.x,p.z,p.h*.28,.55,p.h*.56,.55,0x63513c),
      make(this.cone,p.x,p.z,p.h*.71,p.h*.48,p.h*.7,p.h*.48,p.color)
    ];
    if(p.kind==='cactus')return [make(this.cylinder,p.x,p.z,p.h/2,.75,p.h,.75,p.color),...(lod===0?[make(this.box,p.x+.65,p.z,p.h*.6,1.4,.45,.45,p.color)]:[])];
    const parts=[b(p.h/2,p.w,p.h,p.d,p.color)];
    if(lod===0){
      if(p.kind==='tower'){
        parts.push(b(p.h+.35,p.w*.85,.7,p.d*.85,0x444e54));
        // Distinct horizontal window bands on the street-facing facades.
        for(let floor=3;floor<p.h-1;floor+=4){
          parts.push(make(this.box,p.x,p.z+p.d/2+.015,floor,p.w*.83,.9,.035,0x344955));
          parts.push(make(this.box,p.x+p.w/2+.015,p.z,floor,.035,.9,p.d*.83,0x344955));
        }
      }else if(p.kind==='house'||p.kind==='shack'||p.kind==='hangar'){
        parts.push(b(p.h+.45,p.w*1.07,.9,p.d*1.07,p.kind==='house'?0x594d45:0x505650));
        parts.push(make(this.box,p.x,p.z+p.d/2+.02,1.25,2.2,2.5,.05,0x414743));
      }
    }
    return parts;
  }
  load(data:ChunkData){
    const {cx,cz,props,lod}=data,key=chunkKey(cx,cz);
    this.unload(key);
    const group=new T.Group(), x=cx*CHUNK,z=cz*CHUNK;
    const geometry=new T.PlaneGeometry(CHUNK,CHUNK,lod===0?16:8,lod===0?16:8);
    geometry.rotateX(-Math.PI/2);
    const positions=geometry.attributes.position!;
    for(let i=0;i<positions.count;i++){
      positions.setY(i,terrainHeight(x+CHUNK/2+positions.getX(i),z+CHUNK/2+positions.getZ(i)));
    }
    geometry.computeVertexNormals();
    const ground=new T.Mesh(geometry,new T.MeshStandardMaterial({color:districtAt(x+64,z+64).color,roughness:1}));
    ground.position.set(x+64,0,z+64);group.add(ground);
    const parts:Part[]=[];
    const add=(px:number,py:number,pz:number,w:number,h:number,d:number,color:number)=>parts.push({geometry:this.box,x:px,y:py,z:pz,sx:w,sy:h,sz:d,color});
    const vx=roadHalf('x',x+64),hz=roadHalf('z',z+64);
    if(vx){
      add(x+64,.04,z+64,vx*2,.12,CHUNK,0x363b3e);
      for(let n=8;n<128;n+=16)if(!hz||Math.abs(n-64)>hz+4)add(x+64,.115,z+n,.18,.018,7,0xd6cba7);
      if(lod===0)for(const side of [-1,1])add(x+64+side*(vx+.6),.045,z+64,1.2,.1,CHUNK,0x95948a);
    }
    if(hz){
      // Slight vertical offset prevents intersection z-fighting.
      add(x+64,.052,z+64,CHUNK,.12,hz*2,0x363b3e);
      for(let n=8;n<128;n+=16)if(!vx||Math.abs(n-64)>vx+4)add(x+n,.13,z+64,7,.018,.18,0xd6cba7);
      if(lod===0)for(const side of [-1,1])add(x+64,.05,z+64+side*(hz+.6),CHUNK,.1,1.2,0x95948a);
    }
    for(const p of props)parts.push(...this.part(p,lod));
    const buckets=new Map<T.BufferGeometry,Part[]>();
    for(const p of parts){const list=buckets.get(p.geometry)||[];list.push(p);buckets.set(p.geometry,list);}
    const dummy=new T.Object3D(), color=new T.Color();
    for(const [shape,list] of buckets){
      const mesh=new T.InstancedMesh(shape,this.material,list.length);
      list.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.scale.set(p.sx,p.sy,p.sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,color.setHex(p.color));});
      mesh.computeBoundingSphere();group.add(mesh);
    }
    this.scene.add(group);this.chunks.set(key,group);
  }
  unload(key:string){
    const group=this.chunks.get(key);if(!group)return;
    this.scene.remove(group);
    for(const child of group.children){
      if(child instanceof T.InstancedMesh)child.dispose();
      else if(child instanceof T.Mesh){child.geometry.dispose();if(child.material instanceof T.Material)child.material.dispose();}
    }
    this.chunks.delete(key);
  }
}
