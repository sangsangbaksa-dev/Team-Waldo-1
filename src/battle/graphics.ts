import * as THREE from 'three';
import { MAP_HALF_SIZE, UNIT_STATS, type Unit, type UnitKind, type War } from './war';

/** Procedural, self-contained stylized 3D battlefield. No external models or textures. */
export const FACTION_COLORS = [0x50d9d1, 0xf06a77, 0xf5c45d, 0xaa8eed] as const;
const clamp = THREE.MathUtils.clamp;
const dist = (x:number,z:number,a:number,b:number) => Math.hypot(x-a,z-b);
type UnitVisual = {
  root: THREE.Group; kind: UnitKind; previousX: number; previousZ: number;
  leftLeg: THREE.Mesh; rightLeg: THREE.Mesh; health: THREE.Mesh;
};
type Fortress = {
  root:THREE.Group; towers:THREE.Group; structures:THREE.Group[];
  banner:THREE.Mesh; rubble:THREE.Group; alive:boolean;
};
type PostVisual = {banner:THREE.Mesh; crystal:THREE.Mesh; progress:THREE.Mesh};
type Projectile = {sprite:THREE.Mesh;start:THREE.Vector3;end:THREE.Vector3;age:number;duration:number};
export interface BattleWorld { update(dt:number):void; dispose():void; }
const seeded = (seed:number) => () => {
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  return seed/4294967296;
};
export function terrainShade(x:number,z:number):number {
  return clamp(.5+.24*Math.sin(x*.24)*Math.cos(z*.21)+.1*Math.sin((x+z)*.77),0,1);
}
export function createBattleWorld(scene:THREE.Scene,war:War):BattleWorld {
  const world=new THREE.Group();world.name='Stylized kingdom';scene.add(world);
  scene.background=new THREE.Color(0xb9d1d0);
  scene.fog=new THREE.FogExp2(0xb9d1d0,.0023);
  const ambient=new THREE.HemisphereLight(0xe9f6ff,0x60704c,2.15);
  scene.add(ambient);
  const sun=new THREE.DirectionalLight(0xffe2ab,2.7);
  sun.position.set(-130,220,140);
  sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);
  sun.shadow.camera.left=-210;sun.shadow.camera.right=210;
  sun.shadow.camera.top=210;sun.shadow.camera.bottom=-210;
  sun.shadow.camera.near=10;sun.shadow.camera.far=520;
  sun.shadow.normalBias=.035;sun.shadow.bias=-.0001;
  scene.add(sun,sun.target);
  const fill=new THREE.DirectionalLight(0x91b4e5,.65);fill.position.set(35,35,-45);scene.add(fill);

  const material=(color:number,metalness=0,roughness=.83,emissive=0)=>
    new THREE.MeshStandardMaterial({color,metalness,roughness,emissive,emissiveIntensity:emissive?.55:0});
  const stone=material(0xb4ad96),stoneDark=material(0x626a6b),
    mortar=material(0x878a7b),roof=material(0x334a55),
    timber=material(0x72513c),woodDark=material(0x45372e),
    cream=material(0xe7d5b2),gold=material(0xe9b85e,.45,.35),
    meadow=material(0x638a55),leaves=material(0x4d785c),
    leafLight=material(0x729764),waterMat=new THREE.MeshStandardMaterial({
      color:0x5e9baa,roughness:.25,metalness:.1,transparent:true,opacity:.94
    }),roadMat=material(0x9e9277),soilMat=material(0x896e51),
    ember=material(0xffb45a,0,.4,0xff8130);
  const teamMats=FACTION_COLORS.map(color=>material(color,.25,.43));
  const bannerMats=FACTION_COLORS.map(color=>new THREE.MeshStandardMaterial({
    color,side:THREE.DoubleSide,roughness:.65
  }));
  const box=new THREE.BoxGeometry(1,1,1),
    cylinder=new THREE.CylinderGeometry(.5,.5,1,10),
    sphere=new THREE.SphereGeometry(.5,12,8),
    cone=new THREE.ConeGeometry(.5,1,5),
    rock=new THREE.DodecahedronGeometry(.5,0),
    torus=new THREE.TorusGeometry(1,.022,5,120);
  const add=(parent:THREE.Object3D,g:THREE.BufferGeometry,m:THREE.Material,
    x:number,y:number,z:number,sx=1,sy=1,sz=1)=>{
    const object=new THREE.Mesh(g,m);
    object.position.set(x,y,z);object.scale.set(sx,sy,sz);
    object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;
  };
  // Low-height sculpted terrain: game-space remains planar and unit movement unchanged.
  add(world,new THREE.PlaneGeometry(700,700),waterMat,0,-1.15,0).rotation.x=-Math.PI/2;
  const terrain=new THREE.PlaneGeometry(MAP_HALF_SIZE*2,MAP_HALF_SIZE*2,110,110);
  terrain.rotateX(-Math.PI/2);
  const position=terrain.getAttribute('position');
  const vertexColors:number[]=[];
  const greenA=new THREE.Color(0x48794c),greenB=new THREE.Color(0x7d9c62);
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
  const treeTrunks=new THREE.InstancedMesh(trunkGeo,timber,340);
  const treeCrowns=new THREE.InstancedMesh(crownGeo,leaves,340);
  const dummy=new THREE.Object3D();
  let treeCount=0;
  for(let i=0;i<1600&&treeCount<340;i++){
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
  const rocks=new THREE.InstancedMesh(rock,stoneDark,260);
  let rockCount=0;
  for(let i=0;i<860&&rockCount<260;i++){
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

  const fortresses:Fortress[]=war.factions.map(f=>{
    const root=new THREE.Group();root.position.set(f.x,0,f.z);world.add(root);
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
    const farmRoof=add(farm,cone,material(0x976e47),0,4.3,0,9.5,3.5,8);
    farmRoof.rotation.y=Math.PI/4;
    add(farm,box,cream,0,2,2.79,1.8,2,.18);
    for(let i=0;i<5;i++)add(farm,box,material(i%2?0x9c874f:0xc0a461),-5+i*2.2,.13,6.8,1.7,.15,5.2);
    structures.push(farm);
    const mine=new THREE.Group();mine.position.set(0,0,14);root.add(mine);
    add(mine,box,stoneDark,0,1.45,0,6.6,3,5.2);
    add(mine,cone,roof,0,4.5,0,8.5,4.3,7.3).rotation.y=Math.PI/4;
    for(let i=0;i<3;i++){
      const ore=add(mine,rock,gold,-2+i*2.2,.45,4.4,1.6,1.4,1.6);
      ore.rotation.set(i*.35,i*.9,0);
    }
    add(mine,box,woodDark,2,5,2.6,.4,9,.4);
    add(mine,box,timber,1.5,9.3,2.6,4,.5,.5);
    structures.push(mine);
    const barracks=new THREE.Group();barracks.position.set(13,0,12.5);root.add(barracks);
    add(barracks,box,stone,0,2.2,0,7.4,4.4,6.3);
    add(barracks,cone,roof,0,5.35,0,10.5,3.5,9.5).rotation.y=Math.PI/4;
    add(barracks,box,woodDark,0,1.8,3.24,2.2,3.3,.3);
    for(const x of [-2.6,2.6])add(barracks,box,teamMats[f.id],x,3,3.24,1.1,1.5,.18);
    structures.push(barracks);
    for(const building of structures)building.scale.setScalar(.9);
    const rubble=new THREE.Group();root.add(rubble);rubble.visible=false;
    for(let i=0;i<14;i++){
      const a=i*2.399,r=2.5+(i%5)*1.3;
      const debris=add(rubble,rock,stoneDark,Math.cos(a)*r,.5,Math.sin(a)*r,1.7,.8,1.2);
      debris.rotation.set(i*.24,i*.65,0);
    }
    return {root,towers,structures,banner,rubble,alive:true};
  });

  const posts:PostVisual[]=war.outposts.map(p=>{
    const root=new THREE.Group();root.position.set(p.x,0,p.z);world.add(root);
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
    const progress=add(root,torus,material(FACTION_COLORS[0]),0,1.63,0,3.1,3.1,3.1);
    progress.rotation.x=Math.PI/2;progress.visible=false;
    return {banner,crystal,progress};
  });
  // Shrinking safe-zone border, with a faint translucent vertical storm curtain.
  const ring=add(world,new THREE.TorusGeometry(1,.075,6,160),
    new THREE.MeshBasicMaterial({color:0x84e9ff,transparent:true,opacity:.9,depthWrite:false}),
    0,.33,0);
  ring.rotation.x=Math.PI/2;ring.castShadow=false;
  const storm=add(world,new THREE.CylinderGeometry(1,1,13,120,1,true),
    new THREE.MeshBasicMaterial({color:0x90b9ff,side:THREE.DoubleSide,transparent:true,
      opacity:.085,depthWrite:false}),0,6.6,0);
  storm.castShadow=false;
  // Small moving clouds cast light atmospheric silhouettes without expensive volumetrics.
  const clouds:THREE.Group[]=[];
  for(let i=0;i<12;i++){
    const c=new THREE.Group();world.add(c);
    c.position.set(-175+i*32,58+i%3*5,-128+i*24);
    const cloudMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.12,depthWrite:false});
    for(let p=0;p<3;p++){
      const puff=add(c,sphere,cloudMat,p*4,0,(p%2)*2,13,3.8,7);
      puff.castShadow=false;
    }
    clouds.push(c);
  }

  const models=new Map<number,UnitVisual>(),projectiles:Projectile[]=[];
  // Reuse resources for short-lived soldiers/projectiles; avoid per-death GPU leaks.
  const bowGeometry=new THREE.TorusGeometry(.75,.08,5,18,Math.PI*1.3);
  const healthMaterial=material(0x82e4a0);
  const missileGeometry=new THREE.SphereGeometry(.27,8,6);
  const missileMaterial=new THREE.MeshBasicMaterial({color:0xffeea5});
  const cooldowns=new Map<number,number>();
  function makeUnit(u:Unit):UnitVisual {
    const root=new THREE.Group();world.add(root);
    const team=teamMats[u.owner];
    const armor=u.kind==='guardian'?stoneDark:team;
    const body=add(root,cylinder,armor,0,1.32,0,1.35,1.6,.92);
    add(root,cylinder,team,0,.95,0,1.5,.45,1.1);
    add(root,sphere,cream,0,2.43,0,1,.95,1);
    add(root,cone,u.kind==='guardian'?gold:roof,0,3.11,0,1.25,.95,1.25);
    add(root,box,timber,-.92,1.35,0,.55,1.4,.65);
    add(root,box,timber,.92,1.35,0,.55,1.4,.65);
    const leftLeg=add(root,box,woodDark,-.4,.43,0,.52,.83,.61);
    const rightLeg=add(root,box,woodDark,.4,.43,0,.52,.83,.61);
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
      add(root,box,timber,-.85,1.65,-.8,.65,1.35,.65);
      const bow=add(root,bowGeometry,timber,1.25,1.3,.55);
      bow.rotation.y=Math.PI/2;
      add(root,box,cream,1.24,1.3,.55,.035,1.5,.04);
    }else{
      add(root,box,u.kind==='guardian'?gold:stoneDark,-1.2,1.35,.3,.2,1.6,1.3);
      const weapon=add(root,box,gold,1.14,1.55,.55,.17,u.kind==='guardian'?2.2:1.6,.2);
      weapon.rotation.z=-.22;
      add(root,box,timber,1.14,.62,.55,.48,.18,.3);
    }
    const hpBack=add(root,box,woodDark,0,3.8,0,1.8,.24,.1);
    const health=add(root,box,healthMaterial,0,3.8,.075,1.8,.2,.12);
    hpBack.visible=true;health.visible=true;
    body.castShadow=true;
    return {root,kind:u.kind,previousX:u.x,previousZ:u.z,leftLeg,rightLeg,health};
  }
  function shoot(u:Unit):void {
    if(projectiles.length>=55||u.kind!=='archer')return;
    let target:Unit|undefined,closest=Infinity;
    for(const enemy of war.units){
      if(enemy.owner===u.owner||enemy.hp<=0)continue;
      const d=dist(u.x,u.z,enemy.x,enemy.z);
      if(d<closest){closest=d;target=enemy;}
    }
    if(!target||closest>UNIT_STATS.archer.range+4)return;
    const sprite=add(world,missileGeometry,missileMaterial,u.x,2.2,u.z,.9,.9,.9);
    sprite.castShadow=false;
    projectiles.push({sprite,start:new THREE.Vector3(u.x,2.2,u.z),
      end:new THREE.Vector3(target.x,1.25,target.z),age:0,duration:.24});
  }
  function update(dt:number):void {
    const time=war.time;
    ring.scale.set(war.zone,war.zone,war.zone);
    storm.scale.set(war.zone,1,war.zone);
    const ringMat=ring.material as THREE.MeshBasicMaterial;
    ringMat.opacity=.69+.23*Math.sin(time*2.6);
    for(const f of war.factions){
      const v=fortresses[f.id];v.alive=f.alive;
      v.rubble.visible=!f.alive;
      v.towers.visible=f.alive;
      v.banner.visible=f.alive;
      if(!f.alive){v.root.children.forEach(ch=>{if(ch!==v.rubble)ch.visible=false;});continue;}
      for(let i=0;i<3;i++){
        const level=f[(['farm','mine','barracks'] as const)[i]];
        v.structures[i].scale.setScalar(.78+level*.13);
      }
      v.towers.scale.set(1,1+(f.fort-1)*.09,1);
      v.banner.rotation.y=Math.sin(time*1.7+f.id)*.12;
    }
    for(const p of war.outposts){
      const v=posts[p.id],color=p.owner===null?0xffd184:FACTION_COLORS[p.owner];
      (v.banner.material as THREE.MeshStandardMaterial).color.setHex(color);
      (v.crystal.material as THREE.MeshStandardMaterial).color.setHex(color);
      v.crystal.rotation.y+=dt*.55;
      v.crystal.position.y=5.25+Math.sin(time*2.1+p.id)*.32;
      v.progress.visible=p.contender!==null&&p.progress>1;
      if(p.contender!==null){
        (v.progress.material as THREE.MeshStandardMaterial).color.setHex(FACTION_COLORS[p.contender]);
        v.progress.scale.setScalar(3.1*(.5+p.progress/200));
      }
    }
    const active=new Set(war.units.map(u=>u.id));
    for(const [id,v] of models){
      if(!active.has(id)){
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
      const bob=moving?Math.abs(Math.sin(time*11+u.id))*.13:0;
      v.root.position.set(u.x,bob,u.z);
      const gait=moving?Math.sin(time*11+u.id)*.42:0;
      v.leftLeg.rotation.x=gait;v.rightLeg.rotation.x=-gait;
      v.root.scale.setScalar(u.kind==='guardian'?1.24:u.kind==='archer'?.91:1);
      const maxHp=UNIT_STATS[u.kind].hp,healthFrac=clamp(u.hp/maxHp,0,1);
      v.health.visible=healthFrac<.95;
      v.health.scale.x=1.8*healthFrac;
      v.health.position.x=-(1-healthFrac)*.9;
      const old=cooldowns.get(u.id)??u.cooldown;
      if(u.cooldown>old+.4)shoot(u);
      cooldowns.set(u.id,u.cooldown);
    }
    for(let i=projectiles.length-1;i>=0;i--){
      const p=projectiles[i];p.age+=dt;
      const t=clamp(p.age/p.duration,0,1);
      p.sprite.position.lerpVectors(p.start,p.end,t);
      p.sprite.position.y+=Math.sin(t*Math.PI)*2.1;
      if(t>=1){world.remove(p.sprite);projectiles.splice(i,1);}
    }
    clouds.forEach((cloud,i)=>{cloud.position.x=-175+i*32+Math.sin(time*.06+i)*9;});
  }
  const dispose=():void=>{
    scene.remove(world,ambient,sun,sun.target,fill);
    const geos=new Set<THREE.BufferGeometry>(),mats=new Set<THREE.Material>();
    world.traverse(o=>{
      if(o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh){
        geos.add(o.geometry);
        for(const m of Array.isArray(o.material)?o.material:[o.material])mats.add(m);
      }
    });
    geos.add(box);geos.add(cylinder);geos.add(sphere);geos.add(cone);
    geos.add(rock);geos.add(torus);geos.add(trunkGeo);geos.add(crownGeo);
    geos.add(missileGeometry);geos.add(bowGeometry);mats.add(healthMaterial);
    geos.forEach(g=>g.dispose());mats.add(missileMaterial);
    [stone,stoneDark,mortar,roof,timber,woodDark,cream,gold,meadow,leaves,leafLight,
      waterMat,roadMat,soilMat,ember,...teamMats,...bannerMats].forEach(m=>mats.add(m));
    mats.forEach(m=>m.dispose());
    sun.shadow.map?.dispose();
  };
  return {update,dispose};
}
