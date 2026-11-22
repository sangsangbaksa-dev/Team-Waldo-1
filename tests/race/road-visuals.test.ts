import {describe,expect,it} from 'vitest';
import {emissionStep,rainEmissionStep,sprayRate,wetRoadFinish} from '../../src/race/road-visuals';
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

describe('SPEED RUSH frame-rate independent rain',()=>{
  it.each([20,30,60,90,144])('keeps the same rain density at %i FPS',fps=>{
    let carry=0,count=0;
    for(let i=0;i<fps*3;i++){const next=rainEmissionStep(carry,0.75,'standard',1/fps);count+=next.count;carry=next.carry;}
    expect(count).toBe(4590);
  });
  it('spawns fewer rain drops on low quality without disabling weather',()=>{
    let low=0,high=0,lc=0,hc=0;
    for(let i=0;i<60;i++){
      const a=rainEmissionStep(lc,1,'low',1/60),b=rainEmissionStep(hc,1,'high',1/60);
      lc=a.carry;hc=b.carry;low+=a.count;high+=b.count;
    }
    expect(low).toBe(900);expect(high).toBe(2040);
  });
  it('rejects invalid weather values and long-frame catch-up floods',()=>{
    expect(rainEmissionStep(0,NaN,'high',1/60).count).toBe(0);
    expect(rainEmissionStep(0,-1,'high',1/60).count).toBe(0);
    expect(rainEmissionStep(0,1,'high',10).count).toBeLessThanOrEqual(204);
    expect(rainEmissionStep(0,1,'high',0).count).toBe(0);
  });
});
