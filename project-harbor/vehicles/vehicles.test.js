import test from 'node:test';
import assert from 'node:assert/strict';
import { makeVehicle, stepVehicle, collide, hitWall, signalGreen, trafficInput } from './domain.js';
import { createWorld, interact, update } from './application.js';
const input={throttle:1,steer:0,handbrake:false,moveX:0,moveZ:0};
test('sport accelerates faster than truck',()=>{
  const a=makeVehicle(1,'sport',0,0,0),b=makeVehicle(2,'truck',0,0,0);
  for(let i=0;i<180;i++){stepVehicle(a,input,1/60);stepVehicle(b,input,1/60);}
  assert.ok(a.vz>b.vz*2);
});
test('impact damages both cars and resolves overlap',()=>{
  const a=makeVehicle(1,'sedan',0,0,0),b=makeVehicle(2,'sedan',0,3,Math.PI);
  a.vz=20;b.vz=-10;assert.ok(collide(a,b));assert.ok(a.health<100&&b.health<100);assert.ok(a.z<0&&b.z>3);
});
test('wall collision damages vehicle and prevents penetration',()=>{
  const a=makeVehicle(1,'sedan',0,0,0);a.vz=22;
  hitWall(a,{x:0,z:2,w:5,d:2});assert.ok(a.health<100);assert.ok(a.vz<=0);assert.ok(a.z<0);
});
test('signal phases and red-light braking',()=>{
  assert.ok(signalGreen('x',0,0,0));assert.ok(!signalGreen('z',0,0,0));
  const a=makeVehicle(1,'sedan',-12,3.1,Math.PI/2,true);a.traffic={axis:'x',road:0,dir:1,cruise:14};a.vx=12;
  assert.ok(trafficInput(a,[a],14).throttle<0);
  const open=makeVehicle(3,'sedan',-12,3.1,Math.PI/2,true);open.traffic={axis:'x',road:0,dir:1,cruise:14};open.vx=10;
  const clear=trafficInput(open,[open],0);
  const blocked=trafficInput(open,[open],0,{x:0,z:3.1,panic:false});
  assert.ok(blocked.throttle<clear.throttle);
  assert.equal(blocked.horn,1);
  const scared=trafficInput(open,[open],0,{x:0,z:3.1,panic:true});
  assert.ok(scared.throttle<=blocked.throttle);
});
test('a car within approach range is reached and entered',()=>{
  const w=createWorld();
  const v=w.vehicles.find(car=>car.type==='sedan'&&car.z===22);
  assert.ok(v);
  for(const car of w.vehicles)if(car!==v){car.x=220;car.z=220;}
  w.player.x=v.x;w.player.z=v.z+10;
  interact(w);
  assert.equal(w.player.vehicle,null);
  assert.equal(w.seek,v);
  for(let i=0;i<240&&!w.player.vehicle;i++)update(w,{throttle:0,steer:0,handbrake:false,moveX:0,moveZ:0},1/60);
  assert.equal(w.player.vehicle,v);
});
test('occupied vehicle theft and safe exit',()=>{
  const w=createWorld(),v=w.vehicles.find(v=>v.driver);
  w.player.x=v.x;w.player.z=v.z;interact(w);
  assert.equal(w.player.vehicle,v);assert.equal(v.driver,false);assert.equal(v.traffic,null);assert.equal(w.people.length,1);
  interact(w);assert.equal(w.player.vehicle,null);
});
test('60 seconds of fixed steps stay finite',()=>{
  const w=createWorld();
  for(let i=0;i<3600;i++)update(w,{...input,throttle:0},1/60);
  assert.ok(w.vehicles.every(v=>Number.isFinite(v.x+v.z+v.health)&&v.health>=0&&v.health<=100));
});
