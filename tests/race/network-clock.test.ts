import {describe,expect,it} from 'vitest';
import {adjustPendingSince} from '../../src/race/network-clock';

describe('SPEED RUSH matchmaking suspension deadlines',()=>{
  it('does not extend waiting time under normal heartbeat cadence',()=>{
    expect(adjustPendingSince(1000,5000,5500)).toBe(1000);
    expect(adjustPendingSince(1000,5000,6500)).toBe(1000);
    expect(adjustPendingSince(1000,5000,7000)).toBe(1000);
  });
  it('subtracts only the hidden/suspended duration from the room timeout',()=>{
    const born=1000,previous=5500,now=125500;
    const next=adjustPendingSince(born,previous,now);
    expect(next).toBe(120500);
    expect(now-next).toBe(5000);
  });
  it('recovers from invalid and backwards timer samples without changing the clock',()=>{
    expect(adjustPendingSince(10,200,100)).toBe(10);
    expect(adjustPendingSince(10,NaN,9000)).toBe(10);
    expect(adjustPendingSince(10,10,Infinity)).toBe(10);
    expect(adjustPendingSince(10,10,50000,-1)).toBe(10);
  });
});
