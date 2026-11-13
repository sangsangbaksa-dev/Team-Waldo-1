import * as THREE from 'three';
import { FACILITY_TYPES } from './facilities';
import type { War } from './war';
import { createWorldLabel } from './renderLabels';
import { batchStaticChildren } from './renderBatches';
export function createFacilityVisuals(parent:THREE.Group,w:War){
 const models=new Map<number,{root:THREE.Group;label:ReturnType<typeof createWorldLabel>}>();
 const materials=[0x63c8be,0xdb626e,0xe5b74e,0xa58ade].map(color=>new THREE.MeshStandardMaterial({color,roughness:.4,metalness:.2}));
 const stone=new THREE.MeshStandardMaterial({color:0xc3bba7,roughness:.9});
 const dark=new THREE.MeshStandardMaterial({color:0x324855,metalness:.3,roughness:.45});
 const wood=new THREE.MeshStandardMaterial({color:0x805c3e});
 const crop=new THREE.MeshStandardMaterial({color:0xc9b35f});
 const crystal=new THREE.MeshStandardMaterial({color:0x5be1ee,emissive:0x167f91,emissiveIntensity:.6,metalness:.4,roughness:.2});
 const shared=new Set<THREE.BufferGeometry>();
 function create(b:NonNullable<War['facilities']>[number]){
  const root=new THREE.Group();root.position.set(b.x,0,b.z);root.name=FACILITY_TYPES[b.kind].label;
  const mesh=(geo:THREE.BufferGeometry,mat:THREE.Material,x:number,y:number,z:number)=>{shared.add(geo);const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;root.add(m);return m;};
  const box=(x:number,y:number,z:number,sx:number,sy:number,sz:number,mat:THREE.Material=stone)=>mesh(new THREE.BoxGeometry(sx,sy,sz),mat,x,y,z);
  const team=materials[b.owner];
  box(0,.35,0,12,.7,12,dark);
  if(b.kind==='farm'){
   box(-3,2,0,4,4,6,wood);mesh(new THREE.ConeGeometry(4,3,4),team,-3,5.5,0).rotation.y=Math.PI/4;
   for(let i=0;i<5;i++)for(let j=0;j<4;j++)box(1+i*.95,1,j*2-3,.5,1.5,.5,crop);
  }else if(b.kind==='mine'){
   mesh(new THREE.ConeGeometry(5,6,7),dark,0,3,0);
   for(let i=0;i<5;i++)mesh(new THREE.OctahedronGeometry(1.5),crystal,Math.sin(i*2)*3,3+i*.6,Math.cos(i*2)*3);
   box(0,6,0,8,.8,1,wood);box(-4,4,0,.6,7,.6,wood);box(4,4,0,.6,7,.6,wood);
  }else if(b.kind==='tower'){
   box(0,5,0,5,10,5);box(0,10,0,8,2,8,team);box(0,12,-2,1.8,1.8,7,dark);
   for(const x of [-3,3])for(const z of [-3,3])box(x,12,z,1.5,3,1.5);
  }else{
   box(0,3,0,9,6,8);mesh(new THREE.ConeGeometry(7,4,4),team,0,8,0).rotation.y=Math.PI/4;
   box(0,2,-4.1,2,4,.3,wood);
   for(const x of [-3,3])for(const z of [-4.1,4.1])box(x,4,z,1.2,1.8,.3,crystal);
   if(b.kind==='city')for(const x of [-4,4]){box(x,5,3,3,10,3);mesh(new THREE.ConeGeometry(2.5,3,4),team,x,11.5,3);}
   if(b.kind==='barracks'){box(-5,4,-4,1,8,1,wood);box(-3,7,-4,4,2,.2,team);}
   if(b.kind==='market')for(let i=0;i<4;i++){box(i*2-3,1,6,1.6,2,1.6,wood);box(i*2-3,3,6,1.7,.3,2,team);}
  }
  // Merge rigid parts by material to keep the 30-building cities inexpensive to draw.
  for(const batch of batchStaticChildren(root))shared.add(batch.geometry);
  const label=createWorldLabel(18,4.5);label.update(FACILITY_TYPES[b.kind].label,'생산 시설',team.color.getHex());label.sprite.position.set(0,17,0);root.add(label.sprite);
  parent.add(root);return {root,label};
 }
 const update=()=>{
  const alive=new Set((w.facilities??[]).map(b=>b.id));
  for(const [id,m] of models)if(!alive.has(id)){parent.remove(m.root);m.label.dispose();models.delete(id);}
  for(const b of (w.facilities??[]).filter(b=>!b.interior)){
   let m=models.get(b.id);if(!m){m=create(b);models.set(b.id,m);}
   const progress=1-b.remaining/FACILITY_TYPES[b.kind].seconds;m.root.scale.y=b.remaining>0?.15+progress*.85:1;
   m.label.sprite.visible=b.remaining===0;
  }
 };
 return {update,dispose:()=>{models.forEach(m=>{parent.remove(m.root);m.label.dispose();});shared.forEach(g=>g.dispose());[...materials,stone,dark,wood,crop,crystal].forEach(m=>m.dispose());models.clear();}};
}
