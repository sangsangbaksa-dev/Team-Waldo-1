import {describe,expect,it} from 'vitest';
import {aiInput,newCar,type CarInput} from '../../src/race/physics';
import {buildTrack} from '../../src/race/track';
import {compareRacers,createRace,placeOf,standings,updateRace} from '../../src/race/race';

const track=buildTrack();
const idle={throttle:0,brake:0,steer:0,drift:false,nitro:false};
describe('SPEED RUSH stable rankings and reusable AI control buffers',()=>{
  it('keeps the same AI buffer reference and recomputes every field',()=>{
    const state=createRace(track),racer=state.racers[1];
    const scratch:CarInput={throttle:1,brake:1,steer:1,drift:true,nitro:true};
    const first=aiInput(racer.car,track,racer.ai,1,scratch);
    expect(first).toBe(scratch);
    const second=aiInput(racer.car,track,racer.ai,.7,scratch);
    expect(second).toBe(first);
    expect(scratch).toEqual(aiInput(racer.car,track,racer.ai,.7));
  });
  it('does not share AI buffers between different cars',()=>{
    const race=createRace(track);
    updateRace(race,1/90,idle);
    expect(race.racers[1].aiControl).toBeDefined();
    expect(race.racers[2].aiControl).toBeDefined();
    expect(race.racers[1].aiControl).not.toBe(race.racers[2].aiControl);
    const stored=race.racers[1].aiControl;
    for(let i=0;i<120;i++)updateRace(race,1/90,idle);
    // Countdown does not simulate AI until the racing light; subsequent step creates it.
    if(stored)expect(race.racers[1].aiControl).toBe(stored);
  });
  it('matches sorted order for underway, finished and tied racecars',()=>{
    const r=createRace(track);
    const check=()=>{const ordered=standings(r);for(let i=0;i<ordered.length;i++)expect(placeOf(r,ordered[i])).toBe(i+1);};
    check();r.racers[1].car.total+=100;check();
    r.racers[2].finishTime=90;check();
    r.racers[3].finishTime=90;check();
    r.racers[1].finishTime=91;check();
    expect(compareRacers(r.racers[2],r.racers[3])).toBe(0);
  });
  it('returns no position for a car that is not part of the race',()=>{
    const r=createRace(track),other=createRace(track).racers[0];
    expect(placeOf(r,other)).toBe(0);
    expect(newCar(track,0,0).x).toBeCloseTo(track.x[0]);
  });
});
