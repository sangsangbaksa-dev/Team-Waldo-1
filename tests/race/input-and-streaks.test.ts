import {describe,it,expect} from 'vitest';
import {safeDriveControl,newCar,stepCar} from '../../src/race/physics';
import {buildTrack} from '../../src/race/track';
import {speedStreakVisible} from '../../src/race/fx-buffers';
describe('SPEED RUSH invalid input and idle 3D rendering',()=>{
  it('normalizes invalid and out-of-range analog inputs',()=>{
    expect(safeDriveControl(NaN)).toBe(0);
    expect(safeDriveControl(Infinity)).toBe(0);
    expect(safeDriveControl(-3)).toBe(0);
    expect(safeDriveControl(5)).toBe(1);
    expect(safeDriveControl(-4,true)).toBe(-1);
    expect(safeDriveControl(4,true)).toBe(1);
  });
  it('keeps player physics finite with malformed touchpad/replay values',()=>{
    const track=buildTrack(),car=newCar(track,5,0);
    for(let i=0;i<120;i++)stepCar(car,{throttle:NaN,brake:Infinity,steer:-Infinity,drift:false,nitro:false},1/90,track);
    expect([car.x,car.z,car.h,car.vx,car.vz,car.vf,car.vl,car.total,car.steer].every(Number.isFinite)).toBe(true);
    expect(car.steer).toBe(0);
  });
  it('bounds absurd but finite steering without sudden wheel flips',()=>{
    const track=buildTrack(),car=newCar(track,5,0);
    stepCar(car,{throttle:999,brake:-999,steer:999,drift:false,nitro:false},1/90,track);
    expect(car.steer).toBeLessThanOrEqual(1);
    expect(car.vf).toBeGreaterThanOrEqual(0);
  });
  it('skips invisible streak geometry at idle but fades existing streaks',()=>{
    expect(speedStreakVisible(0,0)).toBe(false);
    expect(speedStreakVisible(15,0.005)).toBe(false);
    expect(speedStreakVisible(20,0.1)).toBe(true);
    expect(speedStreakVisible(27,0)).toBe(true);
    expect(speedStreakVisible(NaN,0)).toBe(false);
  });
});
