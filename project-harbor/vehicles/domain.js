export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const GRID = 90, LIMIT = 270, LANE = 3.1, ROAD = 15;
export const TYPES = Object.freeze({
  sedan: {name:'세단', max:43, accel:7.8, brake:14, steer:0.62, grip:7, mass:1450, length:4.6, width:1.85, color:0x527c99},
  sport: {name:'스포츠카', max:66, accel:12.8, brake:19, steer:0.7, grip:8.5, mass:1180, length:4.4, width:1.95, color:0xd34b3f},
  truck: {name:'트럭', max:30, accel:4.1, brake:8.5, steer:0.44, grip:5, mass:4200, length:7.2, width:2.5, color:0xb4a18b},
  bike: {name:'오토바이', max:54, accel:11.3, brake:15, steer:0.88, grip:9, mass:240, length:2.3, width:0.78, color:0xd3a74b},
  jeep: {name:'군용 지프', max:38, accel:6.6, brake:12, steer:0.58, grip:6.5, mass:2300, length:4.7, width:2.15, color:0x66714e}
});
export const forward = a => ({x:Math.sin(a), z:Math.cos(a)});
export const angleDelta = (a,b) => Math.atan2(Math.sin(a-b),Math.cos(a-b));
export const radius = v => Math.hypot(v.spec.length,v.spec.width)*0.5;
export function makeVehicle(id,type,x,z,yaw,driver=false) {
  return {id,type,spec:TYPES[type],x,z,yaw,vx:0,vz:0,health:100,driver,steer:0,impact:0,traffic:null};
}
export function longitudinal(v) {
  return v.vx*Math.sin(v.yaw)+v.vz*Math.cos(v.yaw);
}
export function stepVehicle(v,input,dt,offroad=false) {
  const s=v.spec, f=forward(v.yaw), side={x:f.z,z:-f.x};
  let speed=longitudinal(v), lateral=v.vx*side.x+v.vz*side.z;
  const health=clamp(v.health/100,0,1);
  const throttle=health>0 ? clamp(input.throttle,-1,1) : 0;
  const grip=s.grip*(offroad?(v.type==='jeep'?0.85:0.53):1)*(input.handbrake?0.19:1);
  const cap=s.max*(0.4+0.6*health)*(offroad?(v.type==='jeep'?0.86:0.55):1);
  const opposite=throttle*speed<0 && Math.abs(speed)>0.7;
  const acceleration=opposite?s.brake:s.accel*(0.55+health*0.45);
  speed+=throttle*acceleration*dt;
  speed*=Math.exp(-(0.10+Math.abs(speed)*0.002+(input.handbrake?1.65:0))*dt);
  if(v.health<=0) speed*=Math.exp(-2*dt);
  speed=clamp(speed,-s.max*0.27,cap);
  v.steer+=(clamp(input.steer,-1,1)-v.steer)*(1-Math.exp(-9*dt));
  const wheelbase=s.length*0.66;
  v.yaw+=speed/wheelbase*Math.tan(v.steer*s.steer/(1+Math.abs(speed)*0.065))*dt;
  v.yaw=Math.atan2(Math.sin(v.yaw),Math.cos(v.yaw));
  lateral*=Math.exp(-grip*dt);
  // Rotate the old velocity into the new heading; preserve inertia during a slide.
  const nf=forward(v.yaw), ns={x:nf.z,z:-nf.x};
  const oldX=f.x*speed+side.x*lateral, oldZ=f.z*speed+side.z*lateral;
  const blend=1-Math.exp(-grip*dt);
  v.vx=oldX*(1-blend)+nf.x*speed*blend;
  v.vz=oldZ*(1-blend)+nf.z*speed*blend;
  // ns is the local lateral axis; retain lateral momentum in the previous world direction.
  v.vx+=ns.x*lateral*blend; v.vz+=ns.z*lateral*blend;
  v.x+=v.vx*dt; v.z+=v.vz*dt;
  v.impact=Math.max(0,v.impact-dt*2);
}
export function damage(v,impact) {
  if(impact>2){v.health=clamp(v.health-(impact-2)*1.65,0,100);v.impact=Math.min(1,impact/12);}
}
export function hitWall(v,b) {
  const r=radius(v)*0.82;
  const px=clamp(v.x,b.x-b.w/2,b.x+b.w/2), pz=clamp(v.z,b.z-b.d/2,b.z+b.d/2);
  let dx=v.x-px,dz=v.z-pz,dist=Math.hypot(dx,dz);
  if(dist>=r)return;
  let nx,nz,depth;
  if(dist>1e-6){nx=dx/dist;nz=dz/dist;depth=r-dist;}
  else {const a=b.w/2-Math.abs(v.x-b.x), c=b.d/2-Math.abs(v.z-b.z);
    if(a<c){nx=v.x>=b.x?1:-1;nz=0;depth=r+a;}else{nx=0;nz=v.z>=b.z?1:-1;depth=r+c;}}
  v.x+=nx*depth;v.z+=nz*depth;
  const closing=v.vx*nx+v.vz*nz;
  if(closing<0){v.vx-=1.18*closing*nx;v.vz-=1.18*closing*nz;damage(v,-closing);}
}
export function collide(a,b) {
  let dx=b.x-a.x,dz=b.z-a.z,dist=Math.hypot(dx,dz);
  const min=(radius(a)+radius(b))*0.81;
  if(dist>=min)return false;
  if(dist<1e-6){dx=1;dz=0;dist=1e-6;}
  const nx=dx/dist,nz=dz/dist,ia=1/a.spec.mass,ib=1/b.spec.mass,sum=ia+ib;
  const depth=min-dist;a.x-=nx*depth*ia/sum;a.z-=nz*depth*ia/sum;
  b.x+=nx*depth*ib/sum;b.z+=nz*depth*ib/sum;
  const closing=(a.vx-b.vx)*nx+(a.vz-b.vz)*nz;
  if(closing>0){const j=1.2*closing/sum;a.vx-=j*ia*nx;a.vz-=j*ia*nz;b.vx+=j*ib*nx;b.vz+=j*ib*nz;
    damage(a,j*ia);damage(b,j*ib);}
  return true;
}
export const nearRoad=(x,z)=>Math.min(Math.abs(x-Math.round(x/GRID)*GRID),Math.abs(z-Math.round(z/GRID)*GRID))<ROAD/2;
export function signalGreen(axis,x,z,time) {
  const phase=((time+(Math.round(x/GRID)+Math.round(z/GRID))*2.3)%24+24)%24;
  return axis==='x'?phase<10:phase>=12&&phase<22;
}
export function trafficInput(v,vehicles,time) {
  const t=v.traffic, axis=t.axis, cross=axis==='x'?'z':'x', dir=t.dir;
  const p=v[axis], next=dir>0?Math.ceil((p+0.01)/GRID)*GRID:Math.floor((p-0.01)/GRID)*GRID;
  const stopDistance=(next-p)*dir-ROAD*0.5-2;
  let target=Math.min(v.spec.max*0.55,t.cruise);
  if(stopDistance>=-1 && stopDistance<32 && !signalGreen(axis,axis==='x'?next:t.road,axis==='z'?next:t.road,time)){
    target=Math.min(target,Math.sqrt(Math.max(0,stopDistance)*2*4.5));
  }
  for(const other of vehicles){if(other===v)continue;const gap=(other[axis]-p)*dir;
    if(gap>0&&gap<32&&Math.abs(other[cross]-v[cross])<2.8){
      const free=gap-(other.spec.length+v.spec.length)*0.5-3;
      target=Math.min(target,Math.max(0,Math.sqrt(Math.max(0,free)*7)));
    }}
  const heading=axis==='z'?(dir>0?0:Math.PI):(dir>0?Math.PI/2:-Math.PI/2);
  const lane=t.road+(axis==='z'?-dir:dir)*LANE;
  const correction=clamp((lane-v[cross])*0.11,-0.35,0.35)*(axis==='x'?-dir:dir);
  const error=angleDelta(heading+correction,v.yaw);
  const speed=longitudinal(v);
  return {throttle:clamp((target-speed)*0.55,-1,1),steer:clamp(error*2.7,-1,1),handbrake:target<0.15&&Math.abs(speed)<0.7};
}
