import { describe, expect, it } from 'vitest';
import { RtsSim } from '../../src/rts/sim';

describe('FRONTLINE 일꾼 자동 복귀', () => {
  it('이동 명령 뒤 쉬는 일꾼은 4초 뒤 채취로 돌아간다', () => {
    const s = new RtsSim(); s.record = false;
    const w = s.units.find(u => u.owner === 0 && u.kind === 'worker')!;
    s.apply(0, { k: 'move', ids: [w.id], x: w.x + 1, y: w.y });
    for (let i = 0; i < 400 && w.o.t !== 'gather'; i++) s.step();
    expect(w.o.t).toBe('gather');
  });
  it("'정지'로 세운 일꾼은 가만히 있는다", () => {
    const s = new RtsSim(); s.record = false;
    const w = s.units.find(u => u.owner === 0 && u.kind === 'worker')!;
    s.apply(0, { k: 'stop', ids: [w.id] });
    for (let i = 0; i < 300; i++) s.step();
    expect(w.o.t).toBe('idle');
  });
});
