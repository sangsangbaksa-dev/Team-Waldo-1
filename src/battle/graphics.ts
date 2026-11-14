import * as THREE from 'three';
import { createGrandArmyVisuals } from './grandArmyVisuals';
import { BATTLEFIELD_FEATURES } from './battlefieldLayout';
import { createBattlefieldEnvironment } from './environment3d';
import { MAP_HALF_SIZE, OUTPOST_NAMES, OUTPOST_BONUSES, UNIT_STATS, type Unit, type UnitKind, type War } from './war';
import { createWorldLabel, type WorldLabel } from './renderLabels';
import { createBattleEffects } from './renderEffects';
import { batchStaticChildren, type StaticBatch } from './renderBatches';
import { createVisualDetails } from './visualDetails';
import { createKingdomScenery } from './kingdomScenery';

/** Procedural, self-contained industrial 3D battlefield. No external models or textures. */
export const FACTION_COLORS = [0x50d9d1, 0xf06a77, 0xf5c45d, 0xaa8eed] as const;
const clamp = THREE.MathUtils.clamp;
const dist = (x:number,z:number,a:number,b:number) => Math.hypot(x-a,z-b);
type UnitVisual = {
  root: THREE.Group; kind: UnitKind; previousX: number; previousZ: number;
  leftLeg: THREE.Mesh; rightLeg: THREE.Mesh; health: THREE.Mesh;
  previousHp: number; owner: number;
};
type Fortress = {
  root:THREE.Group; towers:THREE.Group; structures:THREE.Group[];
  banner:THREE.Mesh; rubble:THREE.Group; alive:boolean; label:WorldLabel;
  ring:THREE.Mesh; previousHp:number; previousCooldown:number;
};
type PostVisual = {banner:THREE.Mesh; crystal:THREE.Mesh; progress:THREE.Mesh;
  territory:THREE.Mesh; label:WorldLabel; previousOwner:number|null};
type Projectile = {sprite:THREE.Mesh;start:THREE.Vector3;end:THREE.Vector3;age:number;duration:number};
export interface BattleWorld {
  update(dt:number):void;
  setQuality(high:boolean):void;
  setReducedMotion(enabled:boolean):void;
  setLabelsVisible(visible:boolean):void;
  setStrategicOverlaysVisible(visible:boolean):void;
  dispose():void;
}
const seeded = (seed:number) => () => {
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  return seed/4294967296;
};
export function terrainShade(x:number,z:number):number {
  return clamp(.5+.24*Math.sin(x*.24)*Math.cos(z*.21)+.1*Math.sin((x+z)*.77),0,1);
}
export function createBattleWorld(scene:THREE.Scene,war:War):BattleWorld {
  const world=new THREE.Group();world.name='Stylized kingdom';scene.add(world);
  let highQuality=true;
  let reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let strategicOverlaysVisible=true;
  const labels:WorldLabel[]=[];
  const effects=createBattleEffects(world);
  const art=createVisualDetails();
  scene.background=new THREE.Color(0x4a6068);
  scene.fog=new THREE.FogExp2(0x4a6068,.0011);
  const ambient=new THREE.HemisphereLight(0xaac4cf,0x3b4a34,1.75);
  scene.add(ambient);
  const sun=new THREE.DirectionalLight(0xffdca6,3.1);
  sun.position.set(-130,220,140);
  sun.castShadow=true;
  // A 2048px atlas avoids the 3K shadow allocation stall on repeated 600-unit battles.
  sun.shadow.mapSize.set(2048,2048);
  sun.shadow.camera.left=-280;sun.shadow.camera.right=280;
  sun.shadow.camera.top=280;sun.shadow.camera.bottom=-280;
  sun.shadow.camera.near=10;sun.shadow.camera.far=520;
  sun.shadow.normalBias=.035;sun.shadow.bias=-.0001;
  scene.add(sun,sun.target);
  const fill=new THREE.DirectionalLight(0x6f9cb8,.75);fill.position.set(35,35,-45);scene.add(fill);

  const material=(color:number,metalness=0,roughness=.83,emissive=0)=>
    new THREE.MeshStandardMaterial({color,metalness,roughness,emissive,emissiveIntensity:emissive?.55:0});
  const stone=material(0x7a7f7b),stoneDark=material(0x3a4448),
    mortar=material(0x505e65),roof=material(0x2c4a58),
    timber=material(0x51473e),woodDark=material(0x2f3331),
    cream=material(0xb3ac98),gold=material(0xd2ab68,.55,.3),
    meadow=material(0x50703f),leaves=material(0x3a5d3c),
    leafLight=material(0x66864f),waterMat=new THREE.MeshStandardMaterial({
      color:0x2f6d7c,roughness:.16,metalness:.2,transparent:true,opacity:.94
    }),roadMat=material(0x465055),soilMat=material(0x5d554b),
    ember=material(0xffb45a,0,.4,0xff8130);
  const teamMats=FACTION_COLORS.map(color=>material(new THREE.Color(color).lerp(new THREE.Color(0x465450),.35).getHex(),.25,.52));
  const bannerMats=FACTION_COLORS.map(color=>new THREE.MeshStandardMaterial({
    color,side:THREE.DoubleSide,roughness:.65
  }));
  const markerMats=FACTION_COLORS.map(color=>new THREE.MeshBasicMaterial({
    color,transparent:true,opacity:.76,depthWrite:false,side:THREE.DoubleSide
  }));
  const wheatMats=[material(0xc0a461),material(0x9c874f)];
  const farmRoofMaterial=material(0x976e47);
  // Sloped masonry roofs give working buildings a grounded architectural profile.
  const roofShape=new THREE.BufferGeometry();
  roofShape.setAttribute('position',new THREE.Float32BufferAttribute([
    -.5,-.5,-.5, 0,.5,-.5, .5,-.5,-.5,
    -.5,-.5,.5, .5,-.5,.5, 0,.5,.5,
    -.5,-.5,-.5, -.5,-.5,.5, 0,.5,-.5,
    -.5,-.5,.5, 0,.5,.5, 0,.5,-.5,
    0,.5,-.5, 0,.5,.5, .5,-.5,-.5,
    .5,-.5,-.5, 0,.5,.5, .5,-.5,.5,
  ],3));
  roofShape.computeVertexNormals();
  const box=new THREE.BoxGeometry(1,1,1),
    cylinder=new THREE.CylinderGeometry(.5,.5,1,10),
    sphere=new THREE.SphereGeometry(.5,12,8),
    cone=new THREE.ConeGeometry(.5,1,5),
    rock=new THREE.DodecahedronGeometry(.5,0),
    torus=new THREE.TorusGeometry(1,.022,5,120),
    unitRingGeometry=new THREE.RingGeometry(1.15,1.42,18),
    baseRingGeometry=new THREE.RingGeometry(21.5,22,64);
  const add=(parent:THREE.Object3D,g:THREE.BufferGeometry,m:THREE.Material,
    x:number,y:number,z:number,sx=1,sy=1,sz=1)=>{
    const object=new THREE.Mesh(g,m);
    object.position.set(x,y,z);object.scale.set(sx,sy,sz);
    object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;
  };
  // Low-height sculpted terrain: game-space remains planar and unit movement unchanged.
  add(world,new THREE.PlaneGeometry(700,700),waterMat,0,-1.15,0).rotation.x=-Math.PI/2;
  const terrain=new THREE.PlaneGeometry(MAP_HALF_SIZE*2,MAP_HALF_SIZE*2,150,150);
  terrain.rotateX(-Math.PI/2);
  const position=terrain.getAttribute('position');
  const vertexColors:number[]=[];
  const greenA=new THREE.Color(0x34483a),greenB=new THREE.Color(0x66805a);
  for(let i=0;i<position.count;i++){
    const x=position.getX(i),z=position.getZ(i);
    const edge=Math.max(Math.abs(x),Math.abs(z));
    position.setY(i,-.23+.085*Math.sin(x*.28)*Math.cos(z*.24)-Math.max(0,edge-(MAP_HALF_SIZE-9))*.26);
    const shade=terrainShade(x,z),c=greenA.clone().lerp(greenB,shade);
    vertexColors.push(c.r,c.g,c.b);
  }
  terrain.setAttribute('color',new THREE.Float32BufferAttribute(vertexColors,3));
  terrain.computeVertexNormals();
  const ground=add(world,terrain,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}),0,0,0);
  ground.castShadow=false;ground.receiveShadow=true;

  const rng=seeded(738139);
  const road=(ax:number,az:number,bx:number,bz:number,width=2.9)=>{
    const dx=bx-ax,dz=bz-az,d=Math.hypot(dx,dz);
    const segment=add(world,box,roadMat,(ax+bx)/2,.005,(az+bz)/2,width,.065,d);
    segment.rotation.y=Math.atan2(dx,dz);segment.receiveShadow=true;
  };
  for(const f of war.factions){
    road(f.x,f.z,f.x*.42,f.z*.42,3.9);
    road(f.x*.42,f.z*.42,0,0,2.8);
  }
  for(const p of war.outposts)road(p.x,p.z,0,0,2.3);
  // Track junctions, clumps of flowers and low-poly foliage give the ground depth.
  const trunkGeo=new THREE.CylinderGeometry(.16,.24,1,6);
  const crownGeo=new THREE.ConeGeometry(1,2.2,6);
  const treeTrunks=new THREE.InstancedMesh(trunkGeo,timber,620);
  const treeCrowns=new THREE.InstancedMesh(crownGeo,leaves,620);
  const dummy=new THREE.Object3D();
  let treeCount=0;
  for(let i=0;i<2900&&treeCount<620;i++){
    const x=(rng()-.5)*(MAP_HALF_SIZE*1.85),z=(rng()-.5)*(MAP_HALF_SIZE*1.85);
    if(Math.abs(x)>MAP_HALF_SIZE-7||Math.abs(z)>MAP_HALF_SIZE-7||
      war.factions.some(f=>dist(x,z,f.x,f.z)<18)||
      war.outposts.some(p=>dist(x,z,p.x,p.z)<11)||
      Math.abs(Math.abs(x)-Math.abs(z))<3.6)continue;
    const h=2.6+rng()*2.8;
    dummy.position.set(x,h*.23,z);dummy.scale.set(1,h*.46,1);
    dummy.rotation.set(0,rng()*Math.PI*2,0);dummy.updateMatrix();
    treeTrunks.setMatrixAt(treeCount,dummy.matrix);
    dummy.position.set(x,h*.62,z);dummy.scale.set(h*.7,h*.8,h*.7);
    dummy.updateMatrix();treeCrowns.setMatrixAt(treeCount,dummy.matrix);
    treeCount++;
  }
  treeTrunks.count=treeCount;treeCrowns.count=treeCount;
  treeTrunks.instanceMatrix.needsUpdate=true;treeCrowns.instanceMatrix.needsUpdate=true;
  treeTrunks.castShadow=false;treeCrowns.castShadow=false;
  world.add(treeTrunks,treeCrowns);
  const rocks=new THREE.InstancedMesh(rock,stoneDark,420);
  let rockCount=0;
  for(let i=0;i<1400&&rockCount<420;i++){
    const x=(rng()-.5)*(MAP_HALF_SIZE*1.86),z=(rng()-.5)*(MAP_HALF_SIZE*1.86);
    if(war.factions.some(f=>dist(x,z,f.x,f.z)<13)||
       war.outposts.some(p=>dist(x,z,p.x,p.z)<9))continue;
    const scale=.4+rng()*1.2;
    dummy.position.set(x,scale*.28,z);dummy.scale.set(scale,scale*.65,scale*.8);
    dummy.rotation.set(rng(),rng()*Math.PI*2,rng()*.2);dummy.updateMatrix();
    rocks.setMatrixAt(rockCount++,dummy.matrix);
  }
  rocks.count=rockCount;rocks.instanceMatrix.needsUpdate=true;
  rocks.castShadow=false;world.add(rocks);

  // Scenic ruins, colorful wildflower meadows and abandoned watchfires add depth
  // to the expanded world without new textures or external assets.
  const ruins = [
    [-213,-208],[212,-205],[-210,213],[214,209],
    [-208,19],[212,22],[7,-217],[16,211],[-142,192],[177,-156],
  ] as const;
  for(let i=0;i<ruins.length;i++){
    const [x,z]=ruins[i];
    const ruin=new THREE.Group();ruin.position.set(x,0,z);
    ruin.rotation.y=(i*1.4)%6.28;world.add(ruin);
    const platform=add(ruin,box,stoneDark,0,.23,0,10,.45,9);
    platform.castShadow=false;
    for(const [px,pz] of [[-3.7,-3.5],[3.6,-3.4],[-3.6,3.5],[3.5,3.6]]){
      const height=3.5+(i%3)*1.15;
      add(ruin,box,stone,px,height*.5,pz,.95,height,.95);
      add(ruin,box,cream,px,height+.12,pz,1.45,.42,1.45);
    }
    add(ruin,box,stone,-.3,2.1,-3.6,4.2,3.7,.8);
    add(ruin,box,stoneDark,-.3,3.9,-3.6,5,.35,1.05);
    add(ruin,box,woodDark,0,.25,0,2.4,.36,2.4);
    add(ruin,sphere,ember,0,1.1,0,.84,1.1,.84).castShadow=false;
    road(x,z,x*.78,z*.78,1.9);
  }
  const flowerGeometry=new THREE.SphereGeometry(.35,5,5);
  const flowerMats=[material(0x7b8071),material(0x896c62),material(0x778487)];
  const flowers=flowerMats.map(mat=>new THREE.InstancedMesh(flowerGeometry,mat,420));
  const flowerCounts=[0,0,0];
  for(let i=0;i<3100;i++){
    const x=(rng()-.5)*MAP_HALF_SIZE*1.9,z=(rng()-.5)*MAP_HALF_SIZE*1.9;
    if(war.factions.some(f=>dist(x,z,f.x,f.z)<21) ||
       war.outposts.some(p=>dist(x,z,p.x,p.z)<12) ||
       ruins.some(([rx,rz])=>dist(x,z,rx,rz)<12))continue;
    const type=i%3;
    if(flowerCounts[type]>=420)continue;
    dummy.position.set(x,.17+rng()*.15,z);
    dummy.scale.set(.46+rng()*.65,.32+rng()*.45,.48+rng()*.5);
    dummy.rotation.set(0,rng()*Math.PI*2,0);dummy.updateMatrix();
    flowers[type].setMatrixAt(flowerCounts[type]++,dummy.matrix);
  }
  flowers.forEach((mesh,index)=>{
    mesh.count=flowerCounts[index];mesh.instanceMatrix.needsUpdate=true;
    mesh.castShadow=false;mesh.receiveShadow=false;world.add(mesh);
  });

  // Tactical installations share the exact deterministic layout used by unit movement.
  // Instanced parts keep the additional geometry affordable in the grand-battle mode.
  createBattlefieldEnvironment(world,BATTLEFIELD_FEATURES);

  // Extra vegetation and populated medieval kingdoms use GPU instancing.
  art.landscape(world,war);
  createKingdomScenery(world,war);

  const fortresses:Fortress[]=war.factions.map(f=>{
    const root=new THREE.Group();root.position.set(f.x,0,f.z);world.add(root);
    const territoryRing=add(root,baseRingGeometry,markerMats[f.id],0,.15,0);
    territoryRing.rotation.x=-Math.PI/2;
    territoryRing.castShadow=false;
    const label=createWorldLabel(34,8.5);
    label.sprite.position.set(f.x,25,f.z);
    world.add(label.sprite);labels.push(label);
    const slab=add(root,cylinder,stoneDark,0,.28,0,19,1.2,19);
    slab.rotation.y=Math.PI/4;
    // Stone curtain walls with center gate and four individual watchtowers.
    add(root,box,stone,0,2,-7.2,14,4,1.1);
    add(root,box,stone,-7.2,2,0,1.1,4,14);
    add(root,box,stone,7.2,2,0,1.1,4,14);
    add(root,box,stone,-4.8,2,7.2,4.2,4,1.1);
    add(root,box,stone,4.8,2,7.2,4.2,4,1.1);
    for(const z of [-7.1,7.1]){
      for(let x=-6;x<=6;x+=2)if(z<0||Math.abs(x)>2)
        add(root,box,cream,x,4.35,z,1.1,.95,1.35);
    }
    for(const x of [-7.1,7.1])
      for(let z=-5;z<=5;z+=2)add(root,box,cream,x,4.35,z,1.35,.95,1.1);
    const gate=add(root,box,woodDark,0,1.8,7.6,4,3.6,.45);
    add(root,box,gold,0,3.7,7.9,4.5,.35,.5);
    for(const x of [-1.4,1.4])add(root,sphere,gold,x,1.8,7.94,.22,.22,.22);
    gate.castShadow=true;
    const towers=new THREE.Group();root.add(towers);
    for(const x of [-7.1,7.1])for(const z of [-7.1,7.1]){
      add(towers,cylinder,stone,x,3.55,z,5.6,7.1,5.6);
      add(towers,cylinder,stoneDark,x,7.35,z,6.2,.8,6.2);
      const cap=add(towers,cone,roof,x,9.15,z,7.5,3.2,7.5);
      cap.rotation.y=Math.PI/4;
      add(towers,sphere,gold,x,11,z,.7,.7,.7);
    }
    const keep=add(root,box,mortar,0,6.4,-.6,9.5,12,9.5);
    for(const z of [-5.3,4.1])for(let x=-3.8;x<=3.8;x+=1.9)
      add(root,box,cream,x,12.9,z,1,.95,1);
    const cap=add(root,cone,roof,0,15,-.6,14.5,5,14.5);
    cap.rotation.y=Math.PI/4;
    for(const y of [4.2,7.2,10.2]){
      add(root,box,woodDark,0,y,4.22,1.9,1.3,.15);
      add(root,box,gold,0,y,4.36,1.1,.1,.2);
    }
    keep.castShadow=true;
    add(root,cylinder,woodDark,0,17.5,-.6,.23,4.7,.23);
    const banner=add(root,box,bannerMats[f.id],1.25,18.65,-.6,2.5,1.7,.13);
    add(root,sphere,gold,0,20,-.6,.5,.5,.5);
    // Each production building has an independent recognizable silhouette.
    const structures:THREE.Group[]=[];
    const farm=new THREE.Group();farm.position.set(-12.8,0,12.5);root.add(farm);
    add(farm,box,timber,0,1.7,0,6.5,3.4,5.4);
    add(farm,roofShape,farmRoofMaterial,0,4.45,0,9.2,3.15,7.2);
    add(farm,box,cream,0,2,2.79,1.8,2,.18);
    for(let i=0;i<5;i++)add(farm,box,wheatMats[i%2],-5+i*2.2,.13,6.8,1.7,.15,5.2);
    structures.push(farm);
    const mine=new THREE.Group();mine.position.set(0,0,14);root.add(mine);
    add(mine,box,stoneDark,0,1.45,0,6.6,3,5.2);
    add(mine,roofShape,roof,0,4.48,0,8.6,3.4,7.2);
    for(let i=0;i<3;i++){
      const ore=add(mine,rock,gold,-2+i*2.2,.45,4.4,1.6,1.4,1.6);
      ore.rotation.set(i*.35,i*.9,0);
    }
    add(mine,box,woodDark,2,5,2.6,.4,9,.4);
    add(mine,box,timber,1.5,9.3,2.6,4,.5,.5);
    structures.push(mine);
    const barracks=new THREE.Group();barracks.position.set(13,0,12.5);root.add(barracks);
    add(barracks,box,stone,0,2.2,0,7.4,4.4,6.3);
    add(barracks,roofShape,roof,0,5.58,0,10.5,3.2,8.5);
    add(barracks,box,woodDark,0,1.8,3.24,2.2,3.3,.3);
    for(const x of [-2.6,2.6])add(barracks,box,teamMats[f.id],x,3,3.24,1.1,1.5,.18);
    structures.push(barracks);
    art.fortress(root,structures,f.id);
    for(const building of structures)building.scale.setScalar(.9);
    const rubble=new THREE.Group();root.add(rubble);rubble.visible=false;
    for(let i=0;i<14;i++){
      const a=i*2.399,r=2.5+(i%5)*1.3;
      const debris=add(rubble,rock,stoneDark,Math.cos(a)*r,.5,Math.sin(a)*r,1.7,.8,1.2);
      debris.rotation.set(i*.24,i*.65,0);
    }
    batchStaticChildren(root,new Set([banner,territoryRing]));
    batchStaticChildren(towers);batchStaticChildren(rubble);
    structures.forEach(building=>batchStaticChildren(building));
    return {root,towers,structures,banner,rubble,alive:f.alive,label,ring:territoryRing,
      previousHp:f.hp,previousCooldown:f.turretCooldown};
  });

  const posts:PostVisual[]=war.outposts.map(p=>{
    const root=new THREE.Group();root.position.set(p.x,0,p.z);world.add(root);
    const territory=add(root,new THREE.RingGeometry(8.5,9,48),
      new THREE.MeshBasicMaterial({color:0xc8b67b,transparent:true,opacity:.65,depthWrite:false,side:THREE.DoubleSide}),0,.12,0);
    territory.rotation.x=-Math.PI/2;territory.castShadow=false;
    const label=createWorldLabel(25,6.25);
    label.sprite.position.set(p.x,12.5,p.z);
    world.add(label.sprite);labels.push(label);
    add(root,cylinder,stoneDark,0,.5,0,10,1,10);
    add(root,cylinder,stone,0,1,0,7.5,1,7.5);
    add(root,cylinder,gold,0,1.6,0,4,.5,4);
    for(let i=0;i<6;i++){
      const a=i*Math.PI/3;
      add(root,cylinder,stone,Math.cos(a)*5.2,1.7,Math.sin(a)*5.2,1.3,3.3,1.3);
      add(root,sphere,ember,Math.cos(a)*5.2,3.4,Math.sin(a)*5.2,.6,.95,.6);
    }
    const crystal=add(root,new THREE.OctahedronGeometry(1.7),material(0xffd184,.2,.18,0xaa5a13),
      0,5.4,0,1,1.8,1);
    add(root,cylinder,timber,0,5.9,-2.6,.2,7,.2);
    const flagMaterial=new THREE.MeshStandardMaterial({color:0xc8b67b,side:THREE.DoubleSide,roughness:.65});
    const banner=add(root,box,flagMaterial,1.3,7,-2.6,2.65,1.55,.16);
    const progress=add(root,new THREE.RingGeometry(6.7,7.4,64),
      new THREE.MeshBasicMaterial({color:FACTION_COLORS[0],side:THREE.DoubleSide,depthWrite:false}),0,.14,0);
    progress.rotation.x=-Math.PI/2;progress.visible=false;progress.castShadow=false;
    batchStaticChildren(root,new Set([banner,crystal,progress,territory]));
    return {banner,crystal,progress,territory,label,previousOwner:p.owner};
  });
  // The current order is visible on the terrain as well as the HUD/minimap.
  const routeGeometry=new THREE.BufferGeometry();
  routeGeometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(6),3));
  const routeMaterial=new THREE.LineDashedMaterial({color:0xffe1a0,dashSize:3,gapSize:2,
    transparent:true,opacity:.8,depthWrite:false});
  const route=new THREE.Line(routeGeometry,routeMaterial);route.frustumCulled=false;
  route.renderOrder=1;world.add(route);
  const destination=new THREE.Group();world.add(destination);
  const destinationRing=add(destination,new THREE.RingGeometry(9,9.5,64),
    new THREE.MeshBasicMaterial({color:0xffe1a0,side:THREE.DoubleSide,transparent:true,opacity:.9,depthWrite:false}),0,.22,0);
  destinationRing.rotation.x=-Math.PI/2;destinationRing.castShadow=false;
  const pointer=add(destination,new THREE.ConeGeometry(1.6,2.4,4),
    new THREE.MeshBasicMaterial({color:0xffe1a0}),0,14,0);
  pointer.rotation.z=Math.PI;pointer.castShadow=false;
  // Shrinking safe-zone border, with a faint translucent vertical storm curtain.
  const ring=add(world,new THREE.RingGeometry(.997,1.003,160),
    new THREE.MeshBasicMaterial({color:0x84e9ff,side:THREE.DoubleSide,transparent:true,opacity:.9,depthWrite:false}),
    0,.33,0);
  ring.rotation.x=Math.PI/2;ring.castShadow=false;
  const storm=add(world,new THREE.CylinderGeometry(1,1,13,120,1,true),
    new THREE.MeshBasicMaterial({color:0x90b9ff,side:THREE.DoubleSide,transparent:true,
      opacity:.085,depthWrite:false}),0,6.6,0);
  storm.castShadow=false;
  // Small moving clouds cast light atmospheric silhouettes without expensive volumetrics.
  const clouds:THREE.Group[]=[];
  for(let i=0;i<16;i++){
    const c=new THREE.Group();world.add(c);
    c.position.set(-175+i*32,58+i%3*5,-128+i*24);
    const cloudMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.12,depthWrite:false});
    for(let p=0;p<3;p++){
      const puff=add(c,sphere,cloudMat,p*4,0,(p%2)*2,13,3.8,7);
      puff.castShadow=false;
    }
    clouds.push(c);
  }

  const grandVisuals=war.grandBattle?createGrandArmyVisuals(world,war):null;
  const models=new Map<number,UnitVisual>(),projectiles:Projectile[]=[];
  // Reuse resources for short-lived soldiers/projectiles; avoid per-death GPU leaks.
  const bowGeometry=new THREE.TorusGeometry(.75,.08,5,18,Math.PI*1.3);
  const healthMaterial=material(0x82e4a0);
  const missileGeometry=new THREE.SphereGeometry(.27,8,6);
  const missileMaterial=new THREE.MeshBasicMaterial({color:0xffeea5});
  const cooldowns=new Map<number,number>();
  const freeMissiles:THREE.Mesh[]=[];
  const unitBatches=new Map<string,{rider:readonly StaticBatch[];mount:readonly StaticBatch[]}>();
  function makeUnit(u:Unit):UnitVisual {
    const root=new THREE.Group();world.add(root);
    const marker=add(root,unitRingGeometry,markerMats[u.owner],0,.08,0);
    marker.rotation.x=-Math.PI/2;marker.castShadow=false;
    const rider=new THREE.Group();root.add(rider);
    if(u.kind==='cavalry')rider.position.y=1.35;
    const team=teamMats[u.owner];
    const armor=u.kind==='guardian'?stoneDark:team;
    const body=add(rider,cylinder,armor,0,1.32,0,1.35,1.6,.92);
    add(rider,cylinder,team,0,.95,0,1.5,.45,1.1);
    add(rider,sphere,cream,0,2.43,0,1,.95,1);
    add(rider,cone,u.kind==='guardian'?gold:roof,0,3.11,0,1.25,.95,1.25);
    add(rider,box,timber,-.92,1.35,0,.55,1.4,.65);
    add(rider,box,timber,.92,1.35,0,.55,1.4,.65);
    const leftLeg=add(rider,box,woodDark,-.4,.43,0,.52,.83,.61);
    const rightLeg=add(rider,box,woodDark,.4,.43,0,.52,.83,.61);
    if(u.kind==='cavalry'){
      // A recognizable mount is assembled from shared low-poly primitives.
      add(root,box,timber,0,.92,-.35,2,1.25,2.85);
      const neck=add(root,box,timber,0,1.42,.9,.85,1.75,.75);
      neck.rotation.x=-.12;
      add(root,sphere,cream,0,2.12,1.18,.95,.76,.85);
      for(const x of [-.7,.7])for(const z of [-1.25,.5]){
        add(root,box,woodDark,x,.33,z,.32,.68,.32);
      }
      add(root,box,gold,0,1.56,-.36,1.4,.2,1.35);
    }
    if(u.kind==='archer'){
      add(rider,box,timber,-.85,1.65,-.8,.65,1.35,.65);
      const bow=add(rider,bowGeometry,timber,1.25,1.3,.55);
      bow.rotation.y=Math.PI/2;
      add(rider,box,cream,1.24,1.3,.55,.035,1.5,.04);
    }else{
      add(rider,box,u.kind==='guardian'?gold:stoneDark,-1.2,1.35,.3,.2,1.6,1.3);
      const weapon=add(rider,box,gold,1.14,1.55,.55,.17,u.kind==='guardian'?2.2:1.6,.2);
      weapon.rotation.z=-.22;
      add(rider,box,timber,1.14,.62,.55,.48,.18,.3);
    }
    art.soldier(rider,root,u.kind,u.owner);
    const hpBack=add(root,box,woodDark,0,u.kind==='cavalry'?5.1:3.8,0,1.8,.24,.1);
    const health=add(root,box,healthMaterial,0,u.kind==='cavalry'?5.1:3.8,.075,1.8,.2,.12);
    hpBack.visible=true;health.visible=true;
    root.traverse(child=>{if(child instanceof THREE.Mesh)child.castShadow=false;});
    body.castShadow=true;
    const key=`${u.kind}:${u.owner}`,cached=unitBatches.get(key);
    const riderBatches=batchStaticChildren(rider,new Set([leftLeg,rightLeg]),cached?.rider);
    const mountBatches=batchStaticChildren(root,new Set([marker,hpBack,health]),cached?.mount);
    if(!cached)unitBatches.set(key,{rider:riderBatches,mount:mountBatches});
    return {root,kind:u.kind,previousX:u.x,previousZ:u.z,leftLeg,rightLeg,health,previousHp:u.hp,owner:u.owner};
  }
  function launch(start:THREE.Vector3,end:THREE.Vector3,duration=.28):void {
    if(projectiles.length>=55||reducedMotion)return;
    const sprite=freeMissiles.pop()??new THREE.Mesh(missileGeometry,missileMaterial);
    sprite.position.copy(start);sprite.scale.setScalar(1.1);sprite.castShadow=false;
    world.add(sprite);
    projectiles.push({sprite,start,end,age:0,duration});
  }
  function attackFeedback(u:Unit):void {
    let target:Unit|undefined,closest=Infinity;
    for(const enemy of war.units){
      if(enemy.owner===u.owner||enemy.hp<=0)continue;
      const d=dist(u.x,u.z,enemy.x,enemy.z);
      if(d<closest){closest=d;target=enemy;}
    }
    let goal:{x:number;z:number}|undefined;
    if(target&&closest<=UNIT_STATS[u.kind].range+4)goal=target;
    if(!goal){
      const f=war.factions[u.owner],base=f.target===null?undefined:war.factions[f.target];
      if(base?.alive&&dist(u.x,u.z,base.x,base.z)<=Math.max(5,UNIT_STATS[u.kind].range)+2)goal=base;
    }
    if(!goal)return;
    if(u.kind==='archer')launch(new THREE.Vector3(u.x,2.5,u.z),new THREE.Vector3(goal.x,1.7,goal.z));
    else effects.burst((goal.x+u.x)*.5,1.8,(goal.z+u.z)*.5,0xffe7a4,4,.65);
  }
  function update(dt:number):void {
    const time=war.time;
    ring.scale.set(war.zone,war.zone,war.zone);
    storm.scale.set(war.zone,1,war.zone);
    const ringMat=ring.material as THREE.MeshBasicMaterial;
    ringMat.opacity=reducedMotion?.8:.69+.23*Math.sin(time*2.6);
    for(const f of war.factions){
      const v=fortresses[f.id];
      if(v.alive&&!f.alive)effects.burst(f.x,7,f.z,0xe8c08b,28,2.2);
      else if(f.hp<v.previousHp-1)effects.burst(f.x,8,f.z,0xffa26a,5,1.2);
      if(f.turretCooldown>v.previousCooldown+.5){
        const invader=war.units.filter(u=>u.owner!==f.id&&u.hp>0&&dist(u.x,u.z,f.x,f.z)<14)
          .sort((a,b)=>dist(a.x,a.z,f.x,f.z)-dist(b.x,b.z,f.x,f.z))[0];
        if(invader)launch(new THREE.Vector3(f.x,12,f.z),new THREE.Vector3(invader.x,1.5,invader.z),.35);
      }
      v.previousCooldown=f.turretCooldown;v.previousHp=f.hp;v.alive=f.alive;
      const name=['에메랄드 왕국','붉은 사자','황금 태양','보랏빛 달'][f.id];
      v.label.update(name,f.alive?`본부 ${Math.ceil(f.hp)} / ${f.maxHp}`:'함락된 왕국',
        f.alive?FACTION_COLORS[f.id]:0x8b9890,f.alive?f.hp/f.maxHp:0);
      v.rubble.visible=!f.alive;
      v.towers.visible=f.alive;
      v.banner.visible=f.alive;
      if(!f.alive){v.root.children.forEach(ch=>{if(ch!==v.rubble)ch.visible=false;});continue;}
      for(let i=0;i<3;i++){
        const level=f[(['farm','mine','barracks'] as const)[i]];
        v.structures[i].scale.setScalar(.78+level*.13);
      }
      v.towers.scale.set(1,1+(f.fort-1)*.09,1);
      v.banner.rotation.y=reducedMotion?0:Math.sin(time*1.7+f.id)*.12;
    }
    for(const p of war.outposts){
      const v=posts[p.id],color=p.owner===null?0xffd184:FACTION_COLORS[p.owner];
      (v.banner.material as THREE.MeshStandardMaterial).color.setHex(color);
      (v.crystal.material as THREE.MeshStandardMaterial).color.setHex(color);
      (v.territory.material as THREE.MeshBasicMaterial).color.setHex(color);
      if(!reducedMotion)v.crystal.rotation.y+=dt*.55;
      v.crystal.position.y=reducedMotion?5.25:5.25+Math.sin(time*2.1+p.id)*.32;
      v.progress.visible=strategicOverlaysVisible&&p.contender!==null&&p.progress>1;
      if(p.contender!==null){
        (v.progress.material as THREE.MeshBasicMaterial).color.setHex(FACTION_COLORS[p.contender]);
        v.progress.geometry.setDrawRange(0,Math.floor(p.progress/100*64)*6);
      }
      const bonus=OUTPOST_BONUSES[p.id];
      const detail=p.contender!==null?`점령 진행 ${Math.floor(p.progress)}%`:
        `금 +${bonus.gold.toFixed(1)} · 식량 +${bonus.food.toFixed(1)}`;
      v.label.update(OUTPOST_NAMES[p.id],detail,p.contender===null?color:FACTION_COLORS[p.contender],
        p.contender===null?undefined:p.progress/100);
      if(v.previousOwner!==p.owner&&p.owner!==null)effects.burst(p.x,5,p.z,color,22,1.8);
      v.previousOwner=p.owner;
    }
    const player=war.factions[0];
    const goal=player.target!==null?war.factions[player.target]:player.rally!==null?war.outposts[player.rally]:undefined;
    route.visible=destination.visible=strategicOverlaysVisible&&!!goal&&player.alive;
    if(goal){
      const points=routeGeometry.getAttribute('position');
      points.setXYZ(0,player.x,.4,player.z);points.setXYZ(1,goal.x,.4,goal.z);
      points.needsUpdate=true;route.computeLineDistances();
      destination.position.set(goal.x,0,goal.z);
      const pulse=reducedMotion?1:1+Math.sin(time*2.3)*.05;
      destinationRing.scale.set(pulse,pulse,1);
      pointer.position.y=14+(reducedMotion?0:Math.sin(time*2.3)*.65);
    }
    if(grandVisuals)grandVisuals.update();
    else {
    const active=new Set(war.units.map(u=>u.id));
    for(const [id,v] of models){
      if(!active.has(id)){
        effects.burst(v.root.position.x,1.3,v.root.position.z,FACTION_COLORS[v.owner],8,1);
        world.remove(v.root);
        models.delete(id);cooldowns.delete(id);
      }
    }
    for(const u of war.units){
      let v=models.get(u.id);
      if(!v){v=makeUnit(u);models.set(u.id,v);}
      const dx=u.x-v.previousX,dz=u.z-v.previousZ;
      const moving=Math.hypot(dx,dz)>.008;
      if(moving)v.root.rotation.y=Math.atan2(dx,dz);
      v.previousX=u.x;v.previousZ=u.z;
      const bob=moving&&!reducedMotion?Math.abs(Math.sin(time*11+u.id))*.13:0;
      v.root.position.set(u.x,bob,u.z);
      const gait=moving&&!reducedMotion?Math.sin(time*11+u.id)*.42:0;
      v.leftLeg.rotation.x=gait;v.rightLeg.rotation.x=-gait;
      v.root.scale.setScalar(u.kind==='guardian'?1.24:u.kind==='archer'?.91:1);
      const maxHp=UNIT_STATS[u.kind].hp,healthFrac=clamp(u.hp/maxHp,0,1);
      v.health.visible=healthFrac<.95;
      v.health.scale.x=1.8*healthFrac;
      v.health.position.x=-(1-healthFrac)*.9;
      if(u.hp<v.previousHp-.5)effects.burst(u.x,1.8,u.z,0xffdbba,3,.5);
      v.previousHp=u.hp;
      const old=cooldowns.get(u.id)??u.cooldown;
      if(u.cooldown>old+.4)attackFeedback(u);
      cooldowns.set(u.id,u.cooldown);
    }
    }
    for(let i=projectiles.length-1;i>=0;i--){
      const p=projectiles[i];p.age+=dt;
      const t=clamp(p.age/p.duration,0,1);
      p.sprite.position.lerpVectors(p.start,p.end,t);
      p.sprite.position.y+=Math.sin(t*Math.PI)*2.1;
      if(t>=1){
        effects.burst(p.end.x,p.end.y,p.end.z,0xffe7a4,3,.55);
        world.remove(p.sprite);freeMissiles.push(p.sprite);projectiles.splice(i,1);
      }
    }
    effects.update(dt);
    if(!reducedMotion)clouds.forEach((cloud,i)=>{cloud.position.x=-175+i*32+Math.sin(time*.06+i)*9;});
  }
  function configureEffects():void {
    effects.setEnabled(highQuality&&!reducedMotion);
    clouds.forEach(cloud=>{cloud.visible=highQuality&&!reducedMotion;});
  }
  const setQuality=(high:boolean):void=>{
    highQuality=high;sun.castShadow=high;
    configureEffects();
  };
  const setReducedMotion=(enabled:boolean):void=>{
    reducedMotion=enabled;configureEffects();
  };
  const setLabelsVisible=(visible:boolean):void=>{
    labels.forEach(label=>{label.sprite.visible=visible;});
  };
  const setStrategicOverlaysVisible=(visible:boolean):void=>{
    strategicOverlaysVisible=visible;
    ring.visible=storm.visible=visible;
    fortresses.forEach((fort,index)=>{fort.ring.visible=visible&&war.factions[index].alive;});
    posts.forEach(post=>{post.territory.visible=visible;});
    if(!visible){route.visible=false;destination.visible=false;}
  };
  const dispose=():void=>{
    labels.forEach(label=>label.dispose());effects.dispose();
    scene.remove(world,ambient,sun,sun.target,fill);
    const geos=new Set<THREE.BufferGeometry>(),mats=new Set<THREE.Material>();
    world.traverse(o=>{
      if(o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh){
        geos.add(o.geometry);
        for(const m of Array.isArray(o.material)?o.material:[o.material])mats.add(m);
      }
    });
    geos.add(box);geos.add(cylinder);geos.add(sphere);geos.add(cone);
    geos.add(rock);geos.add(torus);geos.add(trunkGeo);geos.add(crownGeo);geos.add(roofShape);
    geos.add(baseRingGeometry);geos.add(unitRingGeometry);geos.add(routeGeometry);
    geos.add(missileGeometry);geos.add(bowGeometry);mats.add(healthMaterial);
    unitBatches.forEach(batch=>[...batch.rider,...batch.mount].forEach(part=>geos.add(part.geometry)));
    geos.forEach(g=>g.dispose());mats.add(missileMaterial);
    [stone,stoneDark,mortar,roof,timber,woodDark,cream,gold,meadow,leaves,leafLight,...flowerMats,
      waterMat,roadMat,soilMat,ember,routeMaterial,farmRoofMaterial,...wheatMats,...teamMats,...bannerMats,...markerMats].forEach(m=>mats.add(m));
    mats.forEach(m=>m.dispose());
    art.dispose();
    sun.shadow.map?.dispose();
    models.clear();cooldowns.clear();unitBatches.clear();projectiles.length=0;freeMissiles.length=0;
  };
  configureEffects();update(0);
  return {update,setQuality,setReducedMotion,setLabelsVisible,setStrategicOverlaysVisible,dispose};
}
