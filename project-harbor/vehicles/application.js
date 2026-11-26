import { TYPES, GRID, LIMIT, LANE, clamp, forward, makeVehicle, stepVehicle, nearRoad, trafficInput, hitWall, collide, longitudinal } from './domain.js';
export const DISTRICTS=[
  {name:'숲',x:-180,z:-135,color:0x526d45},
  {name:'도시',x:0,z:-135,color:0x68736c},
  {name:'부촌',x:180,z:-135,color:0x708454},
  {name:'사막',x:-180,z:135,color:0xb7a071},
  {name:'빈민가',x:0,z:135,color:0x82766c},
  {name:'군사기지',x:180,z:135,color:0x85856c}
];
export const district=(x,z)=>DISTRICTS[(z>=0?3:0)+(x<-90?0:x>=90?2:1)];
export function createWorld() {
  const vehicles=[],obstacles=[],decor=[],people=[];
  let seed=20261126,id=0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const add=(type,x,z,yaw,driver=false)=>{
    const v=makeVehicle(++id,type,x,z,yaw,driver);vehicles.push(v);return v;
  };
  const types=Object.keys(TYPES);
  for(let x=-LIMIT;x<LIMIT;x+=GRID)for(let z=-LIMIT;z<LIMIT;z+=GRID){
    const zone=district(x+45,z+45).name;
    if(zone==='숲'||zone==='사막'){
      for(let k=0;k<9;k++){
        const px=x+14+random()*62,pz=z+14+random()*62;
        const w=zone==='숲'?1.3:2.5;
        obstacles.push({x:px,z:pz,w,d:w,h:zone==='숲'?4:1.2,kind:zone==='숲'?'tree':'rock'});
      }
    }else {
      for(let i=0;i<2;i++)for(let j=0;j<2;j++){
        const px=x+23+i*43,pz=z+23+j*43;
        const h=zone==='도시'?10+random()*28:zone==='군사기지'?5:3+random()*5;
        obstacles.push({x:px,z:pz,w:zone==='군사기지'?24:23,d:23,h,kind:zone});
      }
    }
    if(random()<0.85){
      const type=zone==='군사기지'?'jeep':zone==='부촌'?'sport':types[Math.floor(random()*4)];
      add(type,x+10.1,z+22,0);
    }
    if(zone==='도시'||zone==='빈민가'||zone==='부촌')decor.push({x:x+11,z:z+11});
  }
  for(let road=-180;road<=180;road+=90)for(const axis of ['x','z'])for(const dir of [-1,1]){
    const lane=road+(axis==='x'?dir:-dir)*LANE;
    const pos=-220+random()*20+((road+180)/90)*92;
    const yaw=axis==='z'?(dir>0?0:Math.PI):(dir>0?Math.PI/2:-Math.PI/2);
    const v=add(types[Math.floor(random()*types.length)],axis==='x'?pos:lane,axis==='z'?pos:lane,yaw,true);
    v.traffic={axis,road,dir,cruise:12+random()*7};
  }
  add('sedan',10,0,Math.PI/2);
  add('sport',-10,0,-Math.PI/2);
  add('bike',9,8,0);
  add('truck',-9,-13,Math.PI);
  add('jeep',9,-15,0);
  const CELL=32, cellOf=n=>Math.floor((n+LIMIT)/CELL), obstacleGrid=new Map();
  for(const b of obstacles){
    const x0=cellOf(b.x-b.w/2), x1=cellOf(b.x+b.w/2), z0=cellOf(b.z-b.d/2), z1=cellOf(b.z+b.d/2);
    for(let i=x0;i<=x1;i++)for(let j=z0;j<=z1;j++){
      const key=i+':'+j, list=obstacleGrid.get(key);
      if(list)list.push(b);else obstacleGrid.set(key,[b]);
    }
  }
  function obstaclesNear(x,z){
    const i=cellOf(x), j=cellOf(z), found=[], seen=new Set();
    for(let a=i-1;a<=i+1;a++)for(let b=j-1;b<=j+1;b++){
      const list=obstacleGrid.get(a+':'+b); if(!list)continue;
      for(const obstacle of list)if(!seen.has(obstacle)){seen.add(obstacle);found.push(obstacle);}
    }
    return found;
  }
  add('sedan',3.1,22,0);
  return {vehicles,obstacles,decor,people,obstaclesNear,seek:null,player:{x:0,z:11,yaw:0,vehicle:null},time:0,notice:'앞의 세단 근처에서 E를 누르면 다가가 탑니다.',noticeUntil:6};
}
const ENTER_GAP=6, SEEK_GAP=16;
export function nearestVehicle(world,range=ENTER_GAP) {
  const p=world.player;
  let best=null,d=range;
  for(const v of world.vehicles){const n=Math.hypot(p.x-v.x,p.z-v.z)-v.spec.width/2;if(n<d){best=v;d=n;}}
  return best;
}
function clearPoint(world,x,z,except) {
  if(Math.abs(x)>LIMIT-2||Math.abs(z)>LIMIT-2)return false;
  return !world.obstacles.some(b=>Math.abs(x-b.x)<b.w/2+0.45&&Math.abs(z-b.z)<b.d/2+0.45)
    && !world.vehicles.some(v=>v!==except&&Math.hypot(x-v.x,z-v.z)<v.spec.width/2+0.55);
}
function exitPoint(world,v) {
  const f=forward(v.yaw),side={x:f.z,z:-f.x};
  for(const sign of [-1,1])for(const extra of [0.8,1.7,3]){
    const d=v.spec.width/2+extra,x=v.x+side.x*d*sign,z=v.z+side.z*d*sign;
    if(clearPoint(world,x,z,v))return {x,z};
  }
  return null;
}
function notice(world,message){world.notice=message;world.noticeUntil=world.time+3;}
function board(world,target){
  const p=world.player;
  if(Math.hypot(target.vx,target.vz)>7){notice(world,'너무 빠른 차량입니다.');return;}
  if(target.driver){
    const point=exitPoint(world,target);if(!point){notice(world,'운전자가 나올 공간이 없습니다.');return;}
    world.people.push({x:target.x,z:target.z,fromX:target.x,fromZ:target.z,toX:point.x,toZ:point.z,age:0,yaw:target.yaw});
    if(world.people.length>40)world.people.shift();
    target.driver=false;target.traffic=null;notice(world,'운전자를 끌어내리고 차량을 탈취했습니다.');
  } else notice(world,target.spec.name+' 탑승');
  world.seek=null;target.doorAt=world.time;p.vehicle=target;p.x=target.x;p.z=target.z;
}
export function interact(world) {
  const p=world.player,v=p.vehicle;
  if(v){
    if(Math.abs(longitudinal(v))>3){notice(world,'속도를 줄인 뒤 내리세요.');return;}
    const point=exitPoint(world,v);if(!point){notice(world,'내릴 공간이 없습니다.');return;}
    v.doorAt=world.time;Object.assign(p,point,{vehicle:null});notice(world,'차량에서 내렸습니다.');return;
  }
  const target=nearestVehicle(world,ENTER_GAP);
  if(target){board(world,target);return;}
  const far=nearestVehicle(world,SEEK_GAP);
  if(!far){notice(world,'가까운 차량이 없습니다.');return;}
  world.seek=far;
  notice(world,far.spec.name+'으로 다가갑니다.');
}
export function update(world,input,dt) {
  world.time+=dt;
  const p=world.player;
  if(!p.vehicle && world.seek){
    const target=world.seek;
    if(input.moveX||input.moveZ)world.seek=null;
    else {
      const gap=Math.hypot(target.x-p.x,target.z-p.z)-target.spec.width/2;
      if(gap<ENTER_GAP)board(world,target);
      else {
        const dx=target.x-p.x,dz=target.z-p.z,n=Math.max(1,Math.hypot(dx,dz));
        p.yaw=Math.atan2(dx,dz);
        const x=clamp(p.x+dx/n*6*dt,-LIMIT+1,LIMIT-1),z=clamp(p.z+dz/n*6*dt,-LIMIT+1,LIMIT-1);
        if(clearPoint(world,x,p.z,target))p.x=x;
        if(clearPoint(world,p.x,z,target))p.z=z;
      }
    }
  }
  if(!p.vehicle){
    const dx=input.moveX||0,dz=input.moveZ||0,n=Math.max(1,Math.hypot(dx,dz));
    if(dx||dz)p.yaw=Math.atan2(dx,dz);
    const speed=input.run?9:5.3;
    const x=clamp(p.x+dx/n*speed*dt,-LIMIT+1,LIMIT-1);
    const z=clamp(p.z+dz/n*speed*dt,-LIMIT+1,LIMIT-1);
    if(clearPoint(world,x,p.z,null))p.x=x;
    if(clearPoint(world,p.x,z,null))p.z=z;
  }
  for(const v of world.vehicles){
    const control=v===p.vehicle?input:v.traffic&&v.driver?trafficInput(v,world.vehicles,world.time):{throttle:0,steer:0,handbrake:true};
    stepVehicle(v,control,dt,!nearRoad(v.x,v.z));
    for(const b of world.obstaclesNear(v.x,v.z)){if(Math.abs(v.x-b.x)<b.w/2+5&&Math.abs(v.z-b.z)<b.d/2+5)hitWall(v,b);}
    for(const axis of ['x','z']){
      if(Math.abs(v[axis])>LIMIT-1){
        if(v.traffic&&v.traffic.axis===axis){
          v[axis]=-Math.sign(v[axis])*(LIMIT-2);
        }else{v[axis]=clamp(v[axis],-LIMIT+1,LIMIT-1);v[axis==='x'?'vx':'vz']*=-0.22;}
      }
    }
  }
  for(let i=0;i<world.vehicles.length;i++)for(let j=i+1;j<world.vehicles.length;j++){
    const a=world.vehicles[i],b=world.vehicles[j];if(Math.abs(a.x-b.x)<9&&Math.abs(a.z-b.z)<9)collide(a,b);
  }
  if(p.vehicle){p.x=p.vehicle.x;p.z=p.vehicle.z;p.yaw=p.vehicle.yaw;}
  for(const person of world.people){
    person.age+=dt;
    if(person.age<0.45){const t=person.age/0.45;person.x=person.fromX+(person.toX-person.fromX)*t;person.z=person.fromZ+(person.toZ-person.fromZ)*t;}
    else if(person.age<6){const dx=person.toX-person.fromX,dz=person.toZ-person.fromZ,n=Math.max(0.1,Math.hypot(dx,dz));
      const x=person.x+dx/n*3.8*dt,z=person.z+dz/n*3.8*dt;
      if(clearPoint(world,x,z,null)){person.x=x;person.z=z;}person.yaw=Math.atan2(dx,dz);}
  }
  world.people=world.people.filter(person=>person.age<25);
}
