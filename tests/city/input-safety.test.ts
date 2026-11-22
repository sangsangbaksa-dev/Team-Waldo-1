import {describe,it,expect} from 'vitest';
import {safeMoveAxis,safeAimAngle} from '../../src/city/input-safety';
import {World} from '../../src/city/world';
import {emptyMap} from '../../src/city/map';
const sandbox=()=>{const w=new World({seed:7,difficulty:'d4',klass:'warlord',tutorial:true});w.map=emptyMap();w.vehicles=[];return w;};
describe('LAST CITY external input integrity',()=>{
  it('bounds directional axes and retains heading for invalid or coincident aim',()=>{
    expect(safeMoveAxis(NaN)).toBe(0);expect(safeMoveAxis(Infinity)).toBe(0);
    expect(safeMoveAxis(-5)).toBe(-1);expect(safeMoveAxis(3)).toBe(1);
    expect(safeAimAngle(NaN,0,20,20,1.2)).toBe(1.2);
    expect(safeAimAngle(20,20,20,20,1.2)).toBe(1.2);
  });
  it('protects the boss from invalid movement and aim data',()=>{
    const w=sandbox(),boss=w.boss(0)!;
    w.input={mx:NaN,my:Infinity,ax:NaN,ay:Infinity,fire:false,dash:false,brake:false};
    w.step(1/30);
    expect([boss.x,boss.y,boss.vx,boss.vy,boss.ang].every(Number.isFinite)).toBe(true);
    expect(boss.vx).toBe(0);expect(boss.vy).toBe(0);
  });
  it('prevents invalid vehicle input from contaminating physics and driver state',()=>{
    const w=sandbox(),boss=w.boss(0)!,car=w.spawnVehicle('sedan',boss.x,boss.y,0);
    w.toggleVehicle(0);expect(boss.inVeh).toBe(car.id);
    w.input={mx:NaN,my:Infinity,ax:NaN,ay:Infinity,fire:false,dash:false,brake:false};
    w.step(1/30);
    expect([car.x,car.y,car.ang,car.vx,car.vy,boss.x,boss.y,boss.ang].every(Number.isFinite)).toBe(true);
    expect(car.throttle).toBe(0);
  });
  it('does not auto-enter a shop for malformed joystick input',()=>{
    const w=sandbox(),shop=w.businesses.find(z=>z.kind==='store'&&z.owner<0)!,boss=w.boss(0)!;
    boss.x=shop.x;boss.y=shop.y;w.input.mx=NaN;w.input.my=NaN;
    w.autoEnter(1/30);expect(w.inside).toBeNull();
  });
});
