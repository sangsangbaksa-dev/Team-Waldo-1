import * as T from 'three';
import { GRID, LIMIT, ROAD, signalGreen } from './domain.js';
import { DISTRICTS } from './application.js';
const materialCache=new Map(),geometryCache=new Map();
function mat(color){if(!materialCache.has(color))materialCache.set(color,new T.MeshLambertMaterial({color}));return materialCache.get(color);}
function box(w,h,d,color,x=0,y=0,z=0){
  const key=[w,h,d].join(':');if(!geometryCache.has(key))geometryCache.set(key,new T.BoxGeometry(w,h,d));
  const m=new T.Mesh(geometryCache.get(key),mat(color));m.position.set(x,y,z);return m;
}
function cylinder(r,h,color,x,y,z){const key='c:'+r+':'+h;if(!geometryCache.has(key))geometryCache.set(key,new T.CylinderGeometry(r,r,h,10));const m=new T.Mesh(geometryCache.get(key),mat(color));m.position.set(x,y,z);return m;}
function wheel(r,w,x,z){const m=cylinder(r,w,0x222527,x,r,z);m.rotation.z=Math.PI/2;return m;}
function human(color){
  const g=new T.Group();
  g.add(box(.48,.65,.29,color,0,1.15,0),box(.32,.35,.32,0xb88c71,0,1.65,0));
  const legs=[box(.18,.65,.2,0x303a43,-.14,.48,0),box(.18,.65,.2,0x303a43,.14,.48,0)];
  const arms=[box(.15,.55,.18,color,-.34,1.12,0),box(.15,.55,.18,color,.34,1.12,0)];
  g.add(...legs,...arms);g.userData={legs,arms};return g;
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
  const occupant=human(0x9b8b78);occupant.scale.setScalar(.8);occupant.position.set(bike?0:-w*.22,bike?.55:.18,bike?-.05:0);occupant.visible=bike;g.add(occupant);
  const smoke=new T.Group();
  for(let i=0;i<3;i++){const m=new T.Mesh(new T.SphereGeometry(.25+i*.1,7,5),new T.MeshBasicMaterial({color:0x4b4e50,transparent:true,opacity:.38-i*.08,depthWrite:false}));m.position.set(0,1.5+i*.5,l*.29);smoke.add(m);}
  smoke.visible=false;g.add(smoke);
  g.userData={paint,panels,tires,occupant,smoke,doors};return g;
}
export function createRenderer(host,world){
  const coarse=matchMedia('(pointer:coarse)').matches;
  const renderer=new T.WebGLRenderer({antialias:!coarse,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,coarse?1:1.25));renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.domElement.setAttribute('aria-label','Project Harbor 3D 게임 화면');host.append(renderer.domElement);
  const scene=new T.Scene();scene.background=new T.Color(0xa9bfca);scene.fog=new T.Fog(0xa9bfca,90,280);
  const camera=new T.PerspectiveCamera(65,1,.15,420);
  scene.add(new T.HemisphereLight(0xf2f5f9,0x756b50,2.2));const sun=new T.DirectionalLight(0xffe6bf,2);sun.position.set(-50,100,40);scene.add(sun);
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
      const sx=x+(axis==='x'?-8:8),sz=z+(axis==='z'?8:-8);
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
      if(b.kind==='도시')for(let y=2;y<b.h-1;y+=4){
        scene.add(box(b.w*.72,1.15,.08,0x354b56,b.x,y,b.z+b.d/2+.05));
        scene.add(box(b.w*.72,1.15,.08,0x354b56,b.x,y,b.z-b.d/2-.05));
      }
      else scene.add(box(2.3,2.6,.12,0x49483e,b.x,1.3,b.z+b.d/2+.05));
    }
  }
  for(const d of world.decor){scene.add(cylinder(.14,5,0x575d60,d.x,2.5,d.z),box(1.2,.17,.45,0xe5ddbc,d.x,5,d.z));}
  // Batch repeated static geometry into instanced draws; signals remain independently colored.
  const groups=new Map();
  const dynamicMaterials=new Set(signals.map(s=>s.m));
  for(const mesh of [...scene.children]){
    if(!mesh.isMesh||dynamicMaterials.has(mesh.material))continue;
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
  const player=human(0x415d74);scene.add(player);const people=new Map();
  const look=new T.Vector3(),goal=new T.Vector3(),target=new T.Vector3(),baseColor=new T.Color(),dirty=new T.Color(0x494844);
  let initialized=false,lastMode=-1;
  function resize(){const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  function animatePerson(m,t,moving){const a=moving?Math.sin(t*10)*.48:0;m.userData.legs[0].rotation.x=a;m.userData.legs[1].rotation.x=-a;m.userData.arms[0].rotation.x=-a;m.userData.arms[1].rotation.x=a;}
  function draw(dt,mode,orbit,moving){
    for(const v of world.vehicles){
      const m=vehicles.get(v.id),u=m.userData; m.position.set(v.x,.08,v.z);m.rotation.y=v.yaw;
      m.rotation.z=v.type==='bike'?-v.steer*Math.min(Math.hypot(v.vx,v.vz)*.018,.37):v.steer*Math.min(Math.hypot(v.vx,v.vz)*.002,.065);
      u.paint.color.copy(baseColor.setHex(v.spec.color)).lerp(dirty,1-v.health/100);
      u.panels.forEach((p,i)=>{if(i===1)p.rotation.x=(1-v.health/100)*.16;});
      const elapsed=world.time-(v.doorAt??-100);
      const open=elapsed<.25?Math.max(0,elapsed/.25):elapsed<.8?1:elapsed<1.25?1-(elapsed-.8)/.45:0;
      for(const d of u.doors)d.hinge.rotation.y=-d.sign*open*.85;
      u.occupant.visible=v.type==='bike'&&(v.driver||world.player.vehicle===v);
      u.smoke.visible=v.health<32;u.smoke.rotation.y=world.time*.6;
      for(const tire of u.tires)tire.rotation.x+=Math.hypot(v.vx,v.vz)*dt*2.3;
    }
    for(const s of signals)s.m.color.setHex(signalGreen(s.axis,s.x,s.z,world.time)?0x39e57a:0xf04942);
    const p=world.player;player.visible=!p.vehicle;player.position.set(p.x,.04,p.z);player.rotation.y=p.yaw;animatePerson(player,world.time,moving);
    const active=new Set(world.people);
    for(const [person,m] of people)if(!active.has(person)){scene.remove(m);people.delete(person);}
    for(const person of world.people){let m=people.get(person);if(!m){m=human(0x9b8b78);people.set(person,m);scene.add(m);}m.position.set(person.x,.04,person.z);m.rotation.y=person.yaw;animatePerson(m,world.time,person.age>.45&&person.age<6);}
    const a=(p.vehicle?p.vehicle.yaw:0)+orbit, speed=p.vehicle?Math.hypot(p.vehicle.vx,p.vehicle.vz):0;
    const distance=mode===1?16:mode===2&&p.vehicle?-0.7:p.vehicle?8+speed*.055:7;
    const height=mode===1?9:mode===2&&p.vehicle?1.65:p.vehicle?4.2:3.8;
    goal.set(p.x-Math.sin(a)*distance,height,p.z-Math.cos(a)*distance);
    target.set(p.x+Math.sin(a)*(mode===2?14:3),1.15,p.z+Math.cos(a)*(mode===2?14:3));
    for(const b of world.obstacles){
      if(b.kind==='tree'||b.kind==='rock'||Math.abs(b.x-p.x)>48||Math.abs(b.z-p.z)>48)continue;
      for(let i=1;i<=8;i++){
        const f=i/8,x=target.x+(goal.x-target.x)*f,z=target.z+(goal.z-target.z)*f,y=target.y+(goal.y-target.y)*f;
        if(y<b.h+.3&&Math.abs(x-b.x)<b.w/2+.3&&Math.abs(z-b.z)<b.d/2+.3){goal.lerp(target,1-(i-1)/8);goal.y=Math.max(goal.y,2);break;}
      }
    }
    if(!initialized||lastMode!==mode){camera.position.copy(goal);look.copy(target);initialized=true;lastMode=mode;}
    else{const blend=1-Math.exp(-dt*7);camera.position.lerp(goal,blend);look.lerp(target,blend);}
    camera.lookAt(look);renderer.render(scene,camera);
  }
  function dispose(){
    observer.disconnect();
    const geometries=new Set(),materials=new Set();
    scene.traverse(obj=>{
      if(!obj.isMesh)return;
      const gs=Array.isArray(obj.geometry)?obj.geometry:[obj.geometry];
      const ms=Array.isArray(obj.material)?obj.material:[obj.material];
      for(const geometry of gs)if(geometry)geometries.add(geometry);
      for(const material of ms)if(material)materials.add(material);
    });
    for(const geometry of geometries)geometry.dispose();
    for(const material of materials)material.dispose();
    materialCache.clear();geometryCache.clear();
    renderer.dispose();renderer.domElement.remove();
  }
  return {draw,dispose};
}
