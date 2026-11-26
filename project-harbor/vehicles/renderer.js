import * as T from 'three';
import { GRID, LIMIT, ROAD, signalGreen } from './domain.js';
import { DISTRICTS, district } from './application.js';
import { CharacterGfx } from '../characters/infrastructure.ts';
import { modelYaw, playerLook, poseAt, seatedPose, wardrobeFor } from '../characters/domain.ts';
import { residentPose } from '../characters/application.ts';
const LOCALES = {숲:'forest', 도시:'city', 부촌:'rich', 사막:'desert', 빈민가:'slum', 군사기지:'base'};
const materialCache=new Map(),geometryCache=new Map();
function mat(color){if(!materialCache.has(color))materialCache.set(color,new T.MeshLambertMaterial({color}));return materialCache.get(color);}
function box(w,h,d,color,x=0,y=0,z=0){
  const key=[w,h,d].join(':');if(!geometryCache.has(key))geometryCache.set(key,new T.BoxGeometry(w,h,d));
  const m=new T.Mesh(geometryCache.get(key),mat(color));m.position.set(x,y,z);return m;
}
function cylinder(r,h,color,x,y,z){const key='c:'+r+':'+h;if(!geometryCache.has(key))geometryCache.set(key,new T.CylinderGeometry(r,r,h,10));const m=new T.Mesh(geometryCache.get(key),mat(color));m.position.set(x,y,z);return m;}
function wheel(r,w,x,z){const m=cylinder(r,w,0x222527,x,r,z);m.rotation.z=Math.PI/2;return m;}
function sidePoint(v,lateral,ahead){
  const yaw=v.yaw;
  return {
    x:v.x-Math.cos(yaw)*lateral+Math.sin(yaw)*ahead,
    z:v.z+Math.sin(yaw)*lateral+Math.cos(yaw)*ahead,
  };
}
function car(v){
  const g=new T.Group(),s=v.spec,l=s.length,w=s.width,bike=v.type==='bike',truck=v.type==='truck',jeep=v.type==='jeep',sport=v.type==='sport';
  const r=bike?.35:truck?.52:jeep?.45:.34;
  const paint=new T.MeshLambertMaterial({color:s.color});
  const panels=[],doors=[];
  function panel(a,b,c,x,y,z){const m=box(a,b,c,s.color,x,y,z);m.material=paint;panels.push(m);g.add(m);return m;}
  if(bike){
    panel(.55,.32,1.3,0,.65,0);panel(.52,.32,.62,0,.85,.25);
    g.add(box(.7,.07,.14,0x33383b,0,1.12,.69),box(.46,.13,.6,0x27292b,0,.88,-.42));
  }else{
    const bodyY=truck?.94:jeep?.77:.58;
    panel(w,.53,l,0,bodyY,0);
    panel(w*.96,.24,l*.28,0,bodyY+.32,l*.32);
    const roofZ=truck?l*.26:0,roofH=truck?1.55:jeep?1.12:sport?.61:.83,roofW=w*.84,roofL=truck?l*.37:l*.49;
    g.add(box(roofW,roofH,roofL,0x253a42,0,bodyY+.28+roofH/2,roofZ));
    panel(roofW*1.03,.13,roofL,0,bodyY+.3+roofH,roofZ);
    for(const sign of [-1,1]){
      const hinge=new T.Group();hinge.position.set(sign*w*.505,bodyY+.22,l*.15);
      const door=box(.09,.45,l*.30,s.color,0,0,-l*.15);door.material=paint;
      hinge.add(door);g.add(hinge);doors.push({hinge,sign});
    }
    if(truck){panel(w,.95,l*.5,0,1.52,-l*.23);g.add(box(w*.93,.07,l*.46,0x494b4a,0,2.02,-l*.23));}
    if(jeep)g.add(wheel(.42,.26,0,-l*.5));
    g.add(box(w*.87,.16,.15,0x292e2e,0,bodyY-.08,l*.51),box(w*.87,.16,.15,0x292e2e,0,bodyY-.08,-l*.51));
    for(const sign of [-1,1]){
      g.add(box(w*.23,.14,.06,0xffeed2,sign*w*.32,bodyY+.04,l*.505),box(w*.19,.13,.06,0xc83632,sign*w*.34,bodyY+.04,-l*.505));
    }
  }
  const tires=[];
  for(const z of [-l*.32,l*.32])for(const x of bike?[0]:[-w*.49,w*.49]){
    const m=wheel(r,bike?.19:.27,x,z);g.add(m);tires.push(m);
  }
  const smoke=new T.Group();
  for(let i=0;i<3;i++){const m=new T.Mesh(new T.SphereGeometry(.25+i*.1,7,5),new T.MeshBasicMaterial({color:0x4b4e50,transparent:true,opacity:.38-i*.08,depthWrite:false}));m.position.set(0,1.5+i*.5,l*.29);smoke.add(m);}
  smoke.visible=false;g.add(smoke);
  g.userData={paint,panels,tires,smoke,doors};return g;
}
export function createRenderer(host,world){
  const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.domElement.setAttribute('aria-label','Project Harbor 3D 게임 화면');host.append(renderer.domElement);
  const scene=new T.Scene();scene.background=new T.Color(0xa9bfca);scene.fog=new T.Fog(0xa9bfca,90,280);
  const camera=new T.PerspectiveCamera(65,1,.15,420);
  scene.add(new T.HemisphereLight(0xf2f5f9,0x756b50,2.2));const sun=new T.DirectionalLight(0xffe6bf,2);sun.position.set(-50,100,40);scene.add(sun);
  const gfx=new CharacterGfx();
  const player=gfx.create(playerLook());
  scene.add(player.root);
  for(const zone of DISTRICTS)scene.add(box(180,.2,270,zone.color,zone.x,-.14,zone.z));
  for(let p=-LIMIT;p<=LIMIT;p+=GRID){
    scene.add(box(ROAD,.08,LIMIT*2,0x393d3e,p,.01,0),box(LIMIT*2,.08,ROAD,0x393d3e,0,.015,p));
    for(let q=-LIMIT+4;q<LIMIT;q+=9){
      if(Math.abs(q-Math.round(q/GRID)*GRID)<ROAD/2)continue;
      scene.add(box(.12,.025,4,0xd3c18c,p,.065,q),box(4,.025,.12,0xd3c18c,q,.065,p));
    }
  }
  const signals=[];
  for(let x=-180;x<=180;x+=GRID)for(let z=-180;z<=180;z+=GRID){
    for(const axis of ['x','z']){
      const sx=x+(axis==='x'?-8:8),sz=z-8;
      scene.add(box(.17,4,.17,0x53595a,sx,2,sz));
      const lamp=box(.5,.76,.48,0x333333,sx,4.05,sz);
      const m=new T.MeshBasicMaterial({color:0xff4034});lamp.material=m;scene.add(lamp);
      signals.push({x,z,axis,m});
    }
  }
  for(const b of world.obstacles){
    if(b.kind==='tree'){
      scene.add(cylinder(.36,3.1,0x70533b,b.x,1.55,b.z));
      const crown=new T.Mesh(new T.ConeGeometry(2.4,5.6,8),mat(0x355a39));crown.position.set(b.x,4.7,b.z);scene.add(crown);
    }else if(b.kind==='rock'){
      const rock=new T.Mesh(new T.DodecahedronGeometry(1.5,0),mat(0x8e8069));rock.position.set(b.x,.7,b.z);rock.scale.y=.72;scene.add(rock);
    }else{
      const color=b.kind==='도시'?0x8e9697:b.kind==='부촌'?0xe0d7c4:b.kind==='군사기지'?0x686f55:0x9d8575;
      scene.add(box(b.w,b.h,b.d,color,b.x,b.h/2,b.z),box(b.w+.3,.24,b.d+.3,0x555859,b.x,b.h+.12,b.z));
      if(b.kind==='도시')for(let y=2;y<b.h-1;y+=3)for(let x=-8;x<=8;x+=5){
        scene.add(box(2.7,1.5,.09,0x354b56,b.x+x,y,b.z+b.d/2+.05));
        scene.add(box(2.7,1.5,.09,0x354b56,b.x+x,y,b.z-b.d/2-.05));
      }
      else scene.add(box(2.3,2.6,.12,0x49483e,b.x,1.3,b.z+b.d/2+.05));
    }
  }
  for(const d of world.decor){scene.add(cylinder(.14,5,0x575d60,d.x,2.5,d.z),box(1.2,.17,.45,0xe5ddbc,d.x,5,d.z));}
  const groups=new Map();
  const dynamicMaterials=new Set(signals.map(s=>s.m));
  for(const mesh of [...scene.children]){
    if(!mesh.isMesh||dynamicMaterials.has(mesh.material)||mesh.userData.keep)continue;
    const key=mesh.geometry.uuid+':'+mesh.material.uuid;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(mesh);
  }
  for(const meshes of groups.values()){
    if(meshes.length<3)continue;
    const batch=new T.InstancedMesh(meshes[0].geometry,meshes[0].material,meshes.length);
    meshes.forEach((mesh,i)=>{mesh.updateMatrix();batch.setMatrixAt(i,mesh.matrix);scene.remove(mesh);});
    batch.instanceMatrix.needsUpdate=true;batch.computeBoundingSphere();scene.add(batch);
  }
  const vehicles=new Map(world.vehicles.map(v=>{const m=car(v);scene.add(m);return [v.id,m];}));
  const people=new Map(),crowd=new Map(),riders=new Map();
  const look=new T.Vector3(),goal=new T.Vector3(),target=new T.Vector3(),baseColor=new T.Color(),dirty=new T.Color(0x494844);
  let initialized=false,lastMode=-1;
  function resize(){const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  function localeAt(x,z){return LOCALES[district(x,z).name]||'city';}
  function showRider(v,boardT){
    if(v.type!=='bike')return;
    let rider=riders.get(v.id);
    const asPlayer=world.player.vehicle===v;
    const kind=asPlayer?'player':'npc';
    if(!rider||rider.kind!==kind){
      if(rider)rider.rig.root.removeFromParent();
      const rig=gfx.create(asPlayer?playerLook():wardrobeFor(localeAt(v.x,v.z),v.id*13,'local'));
      vehicles.get(v.id).add(rig.root);
      rig.root.position.set(0,.62,.02);
      rig.root.rotation.set(0,0,0);
      rider={rig,kind};riders.set(v.id,rider);
    }
    const seated=seatedPose();
    if(Math.hypot(v.vx,v.vz)>1)seated.spineX+=Math.sin(world.time*8)*.04;
    gfx.apply(rider.rig,seated,{plant:false});
    const boardingThis=asPlayer&&boardT>=0&&boardT<0.88;
    rider.rig.root.visible=(v.driver||asPlayer)&&!boardingThis;
  }
  function draw(dt,mode,orbit,view){
    const motor=view.motor,boardT=view.boardT,exitT=view.exitT;
    for(const v of world.vehicles){
      const m=vehicles.get(v.id),u=m.userData; m.position.set(v.x,.08,v.z);m.rotation.y=v.yaw;
      m.rotation.z=v.type==='bike'?-v.steer*Math.min(Math.hypot(v.vx,v.vz)*.018,.37):v.steer*Math.min(Math.hypot(v.vx,v.vz)*.002,.065);
      u.paint.color.copy(baseColor.setHex(v.spec.color)).lerp(dirty,1-v.health/100);
      u.panels.forEach((p,i)=>{if(i===1)p.rotation.x=(1-v.health/100)*.16;});
      const elapsed=world.time-(v.doorAt??-100);
      const open=elapsed<.25?Math.max(0,elapsed/.25):elapsed<.8?1:elapsed<1.25?1-(elapsed-.8)/.45:0;
      for(const d of u.doors)d.hinge.rotation.y=-d.sign*open*.85;
      showRider(v,boardT);
      u.smoke.visible=v.health<32;u.smoke.rotation.y=world.time*.6;
      for(const tire of u.tires)tire.rotation.y+=Math.hypot(v.vx,v.vz)*dt*2.3;
    }
    for(const s of signals)s.m.color.setHex(signalGreen(s.axis,s.x,s.z,world.time)?0x39e57a:0xf04942);
    const p=world.player;
    const boarding=!!p.vehicle&&boardT>=0&&boardT<1;
    const exiting=!p.vehicle&&exitT>=0&&exitT<1;
    const pose=poseAt(motor.clip,motor.phase,motor.emphasis);
    if(boarding){
      const v=p.vehicle,t=boardT;
      const door=sidePoint(v,v.spec.width/2+.6,.1),seat=sidePoint(v,v.spec.width*.22,.05);
      const u=t<.4?t/.4:(t-.4)/.6;
      const from=t<.4?{x:p.boardFromX??p.x,z:p.boardFromZ??p.z}:door;
      const to=t<.4?door:seat;
      const x=from.x+(to.x-from.x)*u,z=from.z+(to.z-from.z)*u;
      const sit=t<.45?0:(t-.45)/.55;
      player.root.visible=t<.92;
      player.root.position.set(x,sit*.45,z);
      player.root.rotation.y=Math.atan2(to.x-x,to.z-z);
      gfx.apply(player,pose,{plant:t<.62,lift:0});
    }else if(exiting){
      const t=exitT,u=t*t*(3-2*t);
      const x=p.exitFromX+(p.x-p.exitFromX)*u,z=p.exitFromZ+(p.z-p.exitFromZ)*u;
      player.root.visible=true;
      player.root.position.set(x,(1-u)*.35,z);
      player.root.rotation.y=modelYaw(p.yaw,'drive');
      gfx.apply(player,pose,{plant:t>.35,lift:0});
    }else if(!p.vehicle){
      player.root.visible=true;
      player.root.position.set(p.x,motor.lift,p.z);
      player.root.rotation.y=modelYaw(p.yaw,'drive');
      gfx.apply(player,pose,{lift:motor.lift});
    }else player.root.visible=false;
    const activePeople=new Set(world.people);
    for(const [person,rig] of people)if(!activePeople.has(person)){rig.root.removeFromParent();gfx.drop(rig);people.delete(person);}
    for(const person of world.people){
      let rig=people.get(person);
      if(!rig){rig=gfx.create(wardrobeFor(localeAt(person.x,person.z),Math.round(person.fromX*10+person.fromZ),'local'));people.set(person,rig);scene.add(rig.root);}
      rig.root.position.set(person.x,0,person.z);
      rig.root.rotation.y=modelYaw(person.yaw,'drive');
      const clip=person.age<.45?'enter':'walk';
      const phase=person.age<.45?1-person.age/.45:(person.age*1.3)%1;
      gfx.apply(rig,poseAt(clip,phase,0));
    }
    const alive=new Set(view.residents.map(r=>r.id));
    for(const [id,rig] of crowd)if(!alive.has(id)){rig.root.removeFromParent();gfx.drop(rig);crowd.delete(id);}
    for(const resident of view.residents){
      let rig=crowd.get(resident.id);
      if(!rig){rig=gfx.create(resident.wardrobe);crowd.set(resident.id,rig);scene.add(rig.root);}
      rig.root.position.set(resident.x,0,resident.z);
      rig.root.rotation.y=modelYaw(resident.yaw,'drive');
      gfx.apply(rig,residentPose(resident));
      const dx=resident.x-camera.position.x,dz=resident.z-camera.position.z;
      rig.root.visible=!!globalThis.__harborDriveFrame||dx*dx+dz*dz>12;
    }
    const a=(p.vehicle?p.vehicle.yaw:0)+orbit, speed=p.vehicle?Math.hypot(p.vehicle.vx,p.vehicle.vz):0;
    const distance=mode===1?16:mode===2&&p.vehicle?-0.7:p.vehicle?8+speed*.055:5.5;
    const height=mode===1?9:mode===2&&p.vehicle?1.65:p.vehicle?4.2:2.65;
    goal.set(p.x-Math.sin(a)*distance,height,p.z-Math.cos(a)*distance);
    target.set(p.x+Math.sin(a)*(mode===2?14:3),1.15,p.z+Math.cos(a)*(mode===2?14:3));
    for(const b of world.obstacles){
      if(b.kind==='tree'||b.kind==='rock')continue;
      for(let i=1;i<=8;i++){
        const f=i/8,x=target.x+(goal.x-target.x)*f,z=target.z+(goal.z-target.z)*f,y=target.y+(goal.y-target.y)*f;
        if(y<b.h+.3&&Math.abs(x-b.x)<b.w/2+.3&&Math.abs(z-b.z)<b.d/2+.3){goal.lerp(target,1-(i-1)/8);goal.y=Math.max(goal.y,2);break;}
      }
    }
    const devFrame=globalThis.__harborDriveFrame;
    if(devFrame){camera.position.set(devFrame.x,devFrame.y,devFrame.z);camera.lookAt(devFrame.tx,devFrame.ty,devFrame.tz);}
    else{
      if(!initialized||lastMode!==mode){camera.position.copy(goal);look.copy(target);initialized=true;lastMode=mode;}
      else{const blend=1-Math.exp(-dt*7);camera.position.lerp(goal,blend);look.lerp(target,blend);}
      camera.lookAt(look);
    }
    renderer.render(scene,camera);
  }
  function dispose(){
    observer.disconnect();renderer.dispose();
    scene.traverse(obj=>{if(obj.isMesh&&!obj.userData.keep){obj.geometry.dispose();if(obj.material&&!obj.material.userData?.shared)obj.material.dispose();}});
    gfx.dispose();materialCache.clear();geometryCache.clear();renderer.domElement.remove();
  }
  return {draw,dispose};
}
