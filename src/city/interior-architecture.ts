// LAST CITY — decorative shell, separate from collision/furniture placement.
import * as THREE from 'three';
import { DOOR_HALF, type InteriorLayout } from './interior';
import type { Kit, Quality } from './interiorkit';

export type DetailBox = { x0:number; y0:number; z0:number; x1:number; y1:number; z1:number; material:'metal'|'accent'|'panel'|'light' };
export function architecturePlan(lay: Pick<InteriorLayout,'kind'|'w'|'d'|'h'>, quality: Quality): DetailBox[] {
  const {w:W,d:D,h:H,kind}=lay, out:DetailBox[]=[];
  const box=(x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,material:DetailBox['material']):void=>{
    if(x1>x0&&y1>y0&&z1>z0)out.push({x0,y0,z0,x1,y1,z1,material});
  };
  // Entrance trim, leaving the original opening entirely untouched.
  for(const [a,b] of [[0,W/2-DOOR_HALF-2],[W/2+DOOR_HALF+2,W]]) {
    box(a,0,D-0.8,b,2,D,'accent');
    box(a,H-2.4,D-0.9,b,H,D,'accent');
  }
  if(quality==='low')return out;
  const industrial=kind==='plant'||kind==='gunshop', ornate=kind==='bank'||kind==='casino', club=kind==='club';
  // Continuous cornice and recessed accent line close to the ceiling.
  for(const z of [0,D-1.2]) {
    box(0,H-5,z,W,H-3,z+1.2,'panel');
    box(2,H-5.8,z+0.15,W-2,H-5.2,z+1.05,'accent');
  }
  for(const x of [0,W-1.2]) {
    box(x,H-5,1.2,x+1.2,H-3,D-1.2,'panel');
    box(x+0.15,H-5.8,2,x+1.05,H-5.2,D-2,'accent');
  }
  // Repeated structural ribs: overhead, rather than new floor obstacles.
  if(industrial || ornate) {
    const n=quality==='high'?5:3;
    for(let i=1;i<=n;i++){
      const z=D*i/(n+1), half=industrial?2.8:1.6;
      box(3,H-3.4,z-half,W-3,H,z+half,'metal');
      if(ornate)box(5,H-4,z-half*0.6,W-5,H-3.4,z+half*0.6,'accent');
    }
  }
  // Edge-mounted vents and cable trays, varied by business type.
  const rows=quality==='high'?4:2;
  for(let j=1;j<=rows;j++) {
    const z=D*j/(rows+1);
    if(industrial) {
      for(const x of [3,W-11]) {
        box(x,H-7,z-9,x+8,H-2,z+9,'metal');
        for(let k=0;k<4;k++)box(x+0.8,H-7.4,z-7+k*4,x+7.2,H-7,z-6+k*4,'panel');
      }
    } else {
      const x=club||ornate?9:12;
      for(const a of [x,W-x-10]){
        box(a,H-3,z-10,a+10,H,z+10,'panel');
        box(a+1,H-3.6,z-9,a+9,H-3,z+9,'light');
      }
    }
  }
  return out;
}
/** Batch all decorative boxes by material; no new dynamic light sources. */
export function addInteriorArchitecture(kit:Kit,lay:InteriorLayout,accent:number):void{
  const plan=architecturePlan(lay,kit.quality), rich=lay.kind==='bank'||lay.kind==='casino', industrial=lay.kind==='plant'||lay.kind==='gunshop';
  const mats={metal:kit.mat(industrial?0x444e57:0x81796c),accent:kit.mat(accent),panel:kit.mat(rich?0xc6b99c:industrial?0x8b959d:0x303a40),light:kit.glow(lay.kind==='club'?0xda81ff:rich?0xffddb2:0xe3f3ff,1.1)};
  const dummy=new THREE.Object3D();
  for(const key of Object.keys(mats) as DetailBox['material'][]){
    const boxes=plan.filter(b=>b.material===key);if(!boxes.length)continue;
    const mesh=new THREE.InstancedMesh(kit.bx,mats[key],boxes.length);
    boxes.forEach((b,i)=>{dummy.position.set((b.x0+b.x1)/2,(b.y0+b.y1)/2,(b.z0+b.z1)/2);dummy.scale.set(b.x1-b.x0,b.y1-b.y0,b.z1-b.z0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
    mesh.instanceMatrix.needsUpdate=true;kit.scene.add(mesh);kit.own(mesh);
  }
}
