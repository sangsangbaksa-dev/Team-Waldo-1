import { describe, expect, it } from 'vitest';
import { GhostRecorder, ghostAt, sanitizeGhost } from '../../src/race/ghost';
const p = (x: number, h = 0) => ({ x, z: 0, h, total: x });
describe('SPEED RUSH ghost sampling', () => {
  it('interpolates missed time grid slots', () => {
    const r = new GhostRecorder();
    r.tick(0,p(0)); r.tick(0.35,p(35));
    const g = sanitizeGhost(r.finish(0.35,1,p(35)))!;
    expect(g).not.toBeNull(); expect(ghostAt(g,0.1)?.x).toBeCloseTo(10);
    expect(ghostAt(g,0.25)?.x).toBeCloseTo(25);
    expect(ghostAt(g,0.35)?.x).toBeCloseTo(35);
  });
  it('chooses the short rotation across the angle seam', () => {
    const r = new GhostRecorder(); r.tick(0,p(0,3.1)); r.tick(0.22,p(22,-3.1));
    const g = r.finish(0.22,1,p(22,-3.1));
    expect(Math.abs(ghostAt(g,0.1)!.h)).toBeGreaterThan(3);
  });
  it('accepts floating-point finish times just above the last regular sample', () => {
    const r = new GhostRecorder(); r.tick(0,p(0)); r.tick(0.30000000000000004,p(30));
    expect(sanitizeGhost(r.finish(0.30000000000000004,1,p(30)))).not.toBeNull();
  });
});
