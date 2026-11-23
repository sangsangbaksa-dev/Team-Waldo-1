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
  it('samples a mutable vehicle state without aliasing its previous position', () => {
    const recorder = new GhostRecorder();
    const vehicle = { x: 0, z: 0, h: 0, total: 0 };
    recorder.tick(0, vehicle);
    vehicle.x = 5; vehicle.total = 5;
    recorder.tick(0.05, vehicle);
    vehicle.x = 20; vehicle.total = 20;
    recorder.tick(0.2, vehicle);
    const ghost = recorder.finish(0.2, 1, vehicle);
    expect(ghostAt(ghost, 0.1)?.x).toBeCloseTo(10);
    expect(ghostAt(ghost, 0.15)?.x).toBeCloseTo(15);
    expect(ghostAt(ghost, 0.2)?.x).toBeCloseTo(20);
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
