import {describe,expect,it} from 'vitest';
import {emissionStep,sprayRate,wetRoadFinish} from '../../src/race/road-visuals';
describe('SPEED RUSH wet road visuals',()=>{
  it('does not add wet gloss on dry or low quality tracks',()=>{
    expect(wetRoadFinish(0,'high')).toBeNull();expect(wetRoadFinish(1,'low')).toBeNull();
    expect(wetRoadFinish(1,'high')!.specular).toBeGreaterThan(wetRoadFinish(0.3,'standard')!.specular);
  });
  it('does not emit while stopped or on dry tracks',()=>{
    expect(sprayRate(0,1,false)).toBe(0);expect(sprayRate(70,0,false)).toBe(0);
    expect(sprayRate(70,1,true)).toBeLessThan(sprayRate(70,1,false));
  });
  it.each([20,30,60,144])('maintains density at %i FPS',fps=>{
    let carry=0,count=0;for(let i=0;i<fps*3;i++){const e=emissionStep(carry,64,1/fps);count+=e.count;carry=e.carry;}
    expect(count).toBe(192);
  });
});
