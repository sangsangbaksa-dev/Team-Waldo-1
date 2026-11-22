import {describe,it,expect} from 'vitest';
import {FxScheduler,skidSegmentCount} from '../../src/race/fx-scheduling';
describe('SPEED RUSH frame-rate invariant speed effects',()=>{
  it.each([20,30,60,144])('emits the same sparks per second at %i FPS',fps=>{
    const f=new FxScheduler();let count=0;
    for(let i=0;i<fps*3;i++)count+=f.take('nitro',54,1/fps);
    expect(count).toBe(162);
  });
  it('does not dump a backlog after boost ends',()=>{
    const f=new FxScheduler();f.take('nitro',54,1/60);
    f.take('nitro',0,1/60);expect(f.take('nitro',54,1/60)).toBe(0);
  });
  it('caps particles after a long frame without corrupting future frames',()=>{
    const f=new FxScheduler();
    expect(f.take('wall',200,0.5,10)).toBe(10);
    expect(f.take('wall',200,1/60,10)).toBeGreaterThanOrEqual(3);
  });
  it('isolates each effect channel and rejects invalid frame data',()=>{
    const f=new FxScheduler();
    expect(f.take('tireL',60,NaN)).toBe(0);
    expect(f.take('tireL',60,1/60)).toBe(1);
    expect(f.take('tireR',0,1/60)).toBe(0);
    expect(f.take('wall',Infinity,1/60)).toBe(0);
  });
  it('continues skidmarks at low FPS without drawing across teleports',()=>{
    expect(skidSegmentCount(5)).toBe(2);
    expect(skidSegmentCount(8.5)).toBe(3);
    expect(skidSegmentCount(100)).toBe(0);
    expect(skidSegmentCount(0.1)).toBe(0);
  });
});
