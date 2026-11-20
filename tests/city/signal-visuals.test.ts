import {describe,it,expect} from 'vitest';
import {signalPhase} from '../../src/city/signal-visuals';
describe('visual traffic cycle',()=>{
  it('alternates on a stable ten-second clock',()=>{expect([0,9.99,10,19.99,20,30].map(signalPhase)).toEqual([0,0,1,1,0,1]);});
});
