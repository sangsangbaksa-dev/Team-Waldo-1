import { describe, expect, it } from 'vitest';
import { radioStep } from '../../src/outlaw/audio';

describe('OUTLAW procedural radio scheduling', () => {
  it('returns finite notes and BPM after long playback and station changes', () => {
    for(const station of [1,2,3]) for(const step of [0,1,15,16,1535,1536,10000]){
      const n=radioStep(station,step);
      expect([n.root,n.note,n.bpm,n.bar,n.beat].every(Number.isFinite)).toBe(true);
      expect(n.beat).toBeGreaterThanOrEqual(0);
      expect(n.beat).toBeLessThan(16);
      expect(n.bpm).toBeGreaterThan(60);
    }
  });
});
