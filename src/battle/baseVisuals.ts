import * as THREE from 'three';
import { BASE_WIDTH, HQ_SLOT, getBaseState, type PlacedStructure } from './base';
import type { War } from './war';

/** Lightweight low-poly structures appear in the actual 3D home-base district. */
export function createBaseDistrict(scene:THREE.Scene,war:War):{update():void;dispose():void}{
  const owner=war.factions[0],district=new THREE.Group();
  district.name='Player construction district';
  district.position.set(owner.x+38,.12,owner.z-2);
  scene.add(district);
  const box=new THREE.BoxGeometry(1,1,1),cone=new THREE.ConeGeometry(1,1,5),
    cylinder=new THREE.CylinderGeometry(1,1,1,8),gem=new THREE.OctahedronGeometry(1);
  const stone=new THREE.MeshStandardMaterial({color:0x7b8880,roughness:.95}),
    floor=new THREE.MeshStandardMaterial({color:0x405b52,roughness:1}),
    bronze=new THREE.MeshStandardMaterial({color:0xceb06b,metalness:.35,roughness:.58}),
    ore=new THREE.MeshStandardMaterial({color:0x9abac6,metalness:.45,roughness:.33}),
    roof=new THREE.MeshStandardMaterial({color:0x32565f,roughness:.8}),
    wood=new THREE.MeshStandardMaterial({color:0x765842,roughness:1}),
    crop=new THREE.MeshStandardMaterial({color:0xc2a35b,roughness:1}),
    flag=new THREE.MeshStandardMaterial({color:0x57c6bc,side:THREE.DoubleSide,roughness:.75}),
    grass=new THREE.MeshStandardMaterial({color:0x46705d,roughness:1});
  const geometries=[box,cone,cylinder,gem],materials=[stone,floor,bronze,ore,roof,wood,crop,flag,grass];
  function add(parent:THREE.Group,g:THREE.BufferGeometry,m:THREE.Material,x:number,y:number,z:number,sx:number,sy:number,sz:number):THREE.Mesh{
    const mesh=new THREE.Mesh(g,m);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);
    mesh.castShadow=false;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  add(district,box,grass,0,-.12,0,47,.18,47);
  for(let slot=0;slot<BASE_WIDTH*BASE_WIDTH;slot++){
    const col=slot%BASE_WIDTH,row=Math.floor(slot/BASE_WIDTH);
    const x=(col-2)*9,z=(row-2)*9;
    add(district,box,slot===HQ_SLOT?bronze:floor,x,.015,z,8.55,.09,8.55);
    if(slot===HQ_SLOT){
      add(district,cylinder,stone,x,2,z,3.3,3.9,3.3);
      add(district,cone,roof,x,5,z,3.7,3.7,3.7);
      add(district,box,flag,x+1.7,6,z,.3,2.2,1.8);
    }
  }
  // The district sits beside the original keep; the keep and existing fort model remain intact.
  const constructed=new THREE.Group();district.add(constructed);
  let last='';
  function construct(s:PlacedStructure):void{
    const col=s.slot%BASE_WIDTH,row=Math.floor(s.slot/BASE_WIDTH);
    const g=new THREE.Group();g.position.set((col-2)*9,0,(row-2)*9);
    constructed.add(g);
    add(g,box,stone,0,.2,0,7.8,.45,7.8);
    if(s.kind==='mine'){
      add(g,box,stone,0,1.3,0,5.4,2.3,4.9);
      add(g,cone,roof,0,3.2,0,4.3,2.1,4.3);
      for(const [x,z] of [[-2,2],[.4,2.2],[2.1,1.4]]){
        const crystal=add(g,gem,ore,x,1,z,.9,1.7,.85);crystal.rotation.z=.25;
      }
    }else if(s.kind==='farm'){
      add(g,box,wood,0,1.3,-.6,5,2.5,4.3);
      add(g,cone,roof,0,3.5,-.6,4.6,2.4,4.6);
      for(let i=0;i<4;i++)add(g,box,crop,-2.7+i*1.75,.3,2.8,1.1,.5,1.9);
    }else if(s.kind==='barracks'){
      add(g,box,stone,0,1.9,0,5.8,3.6,5.4);
      add(g,cone,roof,0,4.5,0,5.4,2.7,5.4);
      add(g,box,wood,0,1.25,2.8,2,2.3,.3);
      add(g,box,flag,1.85,3.2,2.8,.85,1.25,.2);
    }else{
      add(g,cylinder,stone,0,2.5,0,3.2,4.9,3.2);
      add(g,cylinder,bronze,0,5.2,0,3.8,.7,3.8);
      add(g,cone,roof,0,6.7,0,3.8,2.9,3.8);
      for(const x of [-1.3,1.3])add(g,box,stone,x,1,1.9,.7,2,.7);
    }
  }
  const update=()=>{
    const base=getBaseState(war);
    const next=base.structures.map(s=>s.kind+':'+s.slot).join('|');
    if(next===last)return;
    last=next;constructed.clear();
    for(const structure of base.structures)construct(structure);
  };
  update();
  return {update,dispose:()=>{scene.remove(district);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}};
}
