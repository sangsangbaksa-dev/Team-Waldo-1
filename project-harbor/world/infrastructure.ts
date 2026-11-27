import * as T from 'three';
import {CHUNK, districtAt, roadHalf, terrainHeight, type WorldProp} from './domain';
import {chunkKey,type ChunkData,type ChunkView} from './application';
import {PROFILES} from './civic/regions';
import {Scenery} from './scenery';
type Part={geometry:T.BufferGeometry;x:number;y:number;z:number;sx:number;sy:number;sz:number;color:number;yaw:number;glow:boolean;authored?:boolean};
export class ThreeChunks implements ChunkView {
  private readonly chunks=new Map<string,T.Group>();
  private readonly box=new T.BoxGeometry(1,1,1);
  private readonly cone=new T.ConeGeometry(.5,1,7);
  private readonly cylinder=new T.CylinderGeometry(.5,.5,1,7);
  private readonly material=new T.MeshStandardMaterial({roughness:.91});
  private readonly glowMaterial=new T.MeshStandardMaterial({roughness:.4,emissive:0xffe2a8,emissiveIntensity:.8});
  private readonly grounds=new Map<number,T.MeshStandardMaterial>();
  private readonly scenery=new Scenery();
  private readonly descriptions=new Map<string,ChunkData>();
  private readonly refresh=new Set<string>();
  private readonly authoredMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:.88});
  private readonly authoredGlow=new T.MeshBasicMaterial({vertexColors:true});
  private readonly roof=(()=>{const shape=new T.Shape();shape.moveTo(-.5,0);shape.lineTo(.5,0);shape.lineTo(0,1);shape.closePath();return new T.ExtrudeGeometry(shape,{depth:1,bevelEnabled:false}).translate(0,0,-.5);})();
  private disposed=false;
  constructor(private readonly scene:T.Scene){
    void this.scenery.load().then(ok=>{if(ok&&!this.disposed)for(const [key,data] of this.descriptions)if(data.lod===0)this.refresh.add(key);});
  }
  setNight(amount:number){
    this.glowMaterial.emissiveIntensity=.25+Math.max(0,Math.min(1,amount))*1.6;
    const next=this.refresh.values().next();
    if(!next.done){const data=this.descriptions.get(next.value);this.refresh.delete(next.value);if(data)this.load(data);}
  }
  private part(p:WorldProp,lod:0|1):Part[]{
    const y=terrainHeight(p.x,p.z);
    const yaw=p.yaw??0;
    const make=(geometry:T.BufferGeometry,x:number,z:number,dy:number,sx:number,sy:number,sz:number,color:number,glow=false,turn=yaw):Part=>({geometry,x,y:y+dy,z,sx,sy,sz,color,yaw:turn,glow});
    const b=(dy:number,w:number,h:number,d:number,c:number,glow=false)=>make(this.box,p.x,p.z,dy,w,h,d,c,glow);
    const look=PROFILES[districtAt(p.x,p.z).id];
    if(lod===0){const authored=this.scenery.parts(p);if(authored)return authored.map(a=>({...make(a.geometry,p.x,p.z,0,a.sx,a.sy,a.sz,0xffffff,a.glow,a.yaw),authored:true}));}
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
        const rows=Math.min(18,Math.floor((p.h-3)/3.4));
        for(let row=0;row<rows;row++){
          const floor=3.6+row*(p.h-4)/Math.max(1,rows);
          for(const side of [-1,1]){
            for(let bay=-1;bay<=1;bay++){
              const shade=(row+bay+side+Math.floor(p.x))%7===0?0x526773:look.window;
              parts.push(make(this.box,p.x+bay*p.w*.29,p.z+side*(p.d/2+.035),floor,p.w*.23,1.75,.055,shade,false,0));
              parts.push(make(this.box,p.x+side*(p.w/2+.035),p.z+bay*p.d*.29,floor,.055,1.75,p.d*.23,shade,false,0));
            }
          }
          if(row%4===0)parts.push(b(floor-1.14,p.w+.08,.12,p.d+.08,look.roof));
        }
        parts.push(b(.28,p.w+.35,.56,p.d+.35,look.roof));
        parts.push(make(this.box,p.x,p.z+p.d/2+.06,1.25,Math.min(3.8,p.w*.4),2.5,.12,0x29363d,false,0));
        parts.push(make(this.box,p.x,p.z+p.d/2+.55,2.75,Math.min(4.6,p.w*.5),.18,1.2,look.roof,false,0));
        parts.push(b(p.h+.85,p.w*.24,1,p.d*.3,0x727778));
      }else if(p.kind==='house'){
        parts.push(make(this.roof,p.x,p.z,p.h,p.w*1.06,Math.min(2.2,p.w*.17),p.d*1.06,look.roof));
        for(const side of [-1,1])for(const bay of [-1,1]){
          parts.push(make(this.box,p.x+bay*p.w*.29,p.z+side*(p.d/2+.025),p.h*.62,p.w*.18,1.35,.05,look.window,false,0));
          parts.push(make(this.box,p.x+side*(p.w/2+.025),p.z+bay*p.d*.27,p.h*.62,.05,1.35,p.d*.18,look.window,false,0));
        }
        parts.push(make(this.box,p.x,p.z+p.d/2+.045,2.65,2.2,.2,1.1,look.roof,false,0));
        parts.push(make(this.cylinder,p.x+p.w*.22,p.z-p.d*.18,p.h+1.15,.32,1.1,.32,look.roof,false,0));
        parts.push(make(this.box,p.x,p.z+p.d/2+.02,1.3,1.5,2.1,.05,look.window,false,0));
      }else if(p.kind==='shack'){
        parts.push(b(p.h+.35,p.w*1.16,.55,p.d*1.05,look.roof));
        parts.push(make(this.box,p.x,p.z+p.d/2+.02,1.1,1.3,1.6,.05,look.window,false,yaw+0.04));
        for(const side of [-1,1])for(let strip=-2;strip<=2;strip++)parts.push(make(this.box,p.x+strip*p.w*.17,p.z+side*(p.d/2+.026),p.h*.78,p.w*.11,.06,.045,look.roof,false,0));
      }else if(p.kind==='hangar'){
        parts.push(b(p.h+.4,p.w*1.04,.7,p.d*1.04,look.roof));
        parts.push(b(p.h*.55,p.w*1.02,.28,p.d*1.02,0xc4b15a));
        parts.push(make(this.box,p.x,p.z+p.d/2+.02,p.h*.29,p.w*.58,p.h*.54,.05,0x2e3328,false,0));
        for(let rib=-3;rib<=3;rib++)parts.push(make(this.box,p.x+rib*p.w*.075,p.z+p.d/2+.06,p.h*.29,.045,p.h*.52,.045,look.roof,false,0));
        for(const side of [-1,1])for(const bay of [-1,0,1])parts.push(make(this.box,p.x+side*(p.w/2+.03),p.z+bay*p.d*.27,p.h*.7,.06,.85,p.d*.19,look.window,false,0));
      }else if(p.kind==='stall'){
        parts.push(make(this.box,p.x,p.z,p.h+0.15,p.w*1.15,.12,p.d*.7,look.roof,false,yaw));
      }
    }
    return parts;
  }
  load(data:ChunkData){
    const {cx,cz,props,lod}=data,key=chunkKey(cx,cz);
    this.unload(key);
    this.descriptions.set(key,data);
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
    if(lod===0){
      // Painted lines and curb surfaces remain instanced with the road geometry.
      const roadDetails=(half:number,other:number,vertical:boolean)=>{
        if(!half)return;
        const strip=(offset:number,along:number,width:number,length:number,color:number)=>{
          if(vertical)add(x+64+offset,.138,z+along,width,.016,length,color);
          else add(x+along,.148,z+64+offset,length,.016,width,color);
        };
        for(const side of [-1,1]){
          const edge=side*(half-.3);
          if(other){
            const len=64-other-2;
            strip(edge,len/2,.12,len,0xb5b1a3);
            strip(edge,128-len/2,.12,len,0xb5b1a3);
            for(let off=-half+.9;off<half-.5;off+=1.15)
              strip(off,64+side*(other+2),.42,2.0,0xd9d8ce);
            strip(0,64+side*(other+4.0),half*1.7,.18,0xd9d8ce);
          }else strip(edge,64,.12,128,0xb5b1a3);
          if(half>=15)for(let n=8;n<128;n+=16)
            if(!other||Math.abs(n-64)>other+7)strip(side*half*.5,n,.12,6,0xd3d1c6);
          for(let n=12;n<128;n+=24){
            if(other&&Math.abs(n-64)<other+7)continue;
            strip(side*(half-.7),n,.46,.70,0x282d30);
            for(let grate=-1;grate<=1;grate++)strip(side*(half-.7)+grate*.13,n,.035,.62,0x777c7c);
          }
        }
        if(!other)strip(0,50,.70,.70,0x535658);
      };
      roadDetails(vx,hz,true);
      roadDetails(hz,vx,false);
    }
    for(const p of props){if(p.detail&&lod!==0)continue;parts.push(...this.part(p,lod));}
    const buckets=new Map<string,{shape:T.BufferGeometry;glow:boolean;authored:boolean;list:Part[]}>();
    for(const p of parts){
      const key=(p.authored?'a:':'p:')+(p.glow?'g:':'s:')+p.geometry.uuid;
      const bucket=buckets.get(key)??{shape:p.geometry,glow:p.glow,authored:!!p.authored,list:[]};
      bucket.list.push(p);buckets.set(key,bucket);
    }
    const dummy=new T.Object3D(), color=new T.Color();
    for(const bucket of buckets.values()){
      const material=bucket.authored?(bucket.glow?this.authoredGlow:this.authoredMaterial):(bucket.glow?this.glowMaterial:this.material);
      const mesh=new T.InstancedMesh(bucket.shape,material,bucket.list.length);
      bucket.list.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.yaw,0);dummy.scale.set(p.sx,p.sy,p.sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,color.setHex(p.color));});
      if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
      mesh.matrixAutoUpdate=false;mesh.computeBoundingSphere();group.add(mesh);
    }
    this.scene.add(group);this.chunks.set(key,group);
  }
  unload(key:string){
    this.descriptions.delete(key);this.refresh.delete(key);
    const group=this.chunks.get(key);if(!group)return;
    this.scene.remove(group);
    for(const child of group.children){
      if(child instanceof T.InstancedMesh)child.dispose();
      else if(child instanceof T.Mesh)child.geometry.dispose();
    }
    this.chunks.delete(key);
  }
  dispose(){
    this.disposed=true;
    for(const key of [...this.chunks.keys()])this.unload(key);
    this.scenery.dispose();
    for(const geometry of [this.box,this.cone,this.cylinder,this.roof])geometry.dispose();
    for(const material of [this.material,this.glowMaterial,this.authoredMaterial,this.authoredGlow,...this.grounds.values()])material.dispose();
    this.grounds.clear();
  }
}
