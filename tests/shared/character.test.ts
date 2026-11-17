import { describe, expect, it } from 'vitest';
import { calmState, computePose, lookFor, blankPose } from '../../src/shared/character';

describe('공용 캐릭터 포즈', () => {
  const s = () => calmState();
  it('가만히 서면 다리가 곧다', () => { const p = computePose(s()); expect(p.thighL).toBeCloseTo(0); expect(p.shinR).toBeCloseTo(0); expect(p.rootPitch).toBe(0); });
  it('걸으면 좌우 다리가 반대로 흔들린다', () => { const st = { ...s(), speed: 3, walk: 1 }, p = computePose(st); expect(Math.sign(p.thighL)).toBe(-Math.sign(p.thighR)); });
  it('겨누면 팔이 앞으로 든다', () => { expect(computePose({ ...s(), aim: 1 }).armR).toBeGreaterThan(1.3); });
  it('웅크리면 몸이 낮아지고 무릎이 굽는다', () => { const p = computePose({ ...s(), crouch: 1 }); expect(p.scaleY).toBeLessThan(1); expect(p.shinL).toBeLessThan(-1); });
  it('앉으면 허벅지가 앞으로, 정강이가 아래로', () => { const p = computePose({ ...s(), seat: 1, drive: 1 }); expect(p.thighL).toBeGreaterThan(1.4); expect(p.armR).toBeGreaterThan(1); });
  it('죽으면 뒤로 눕는다', () => { expect(computePose({ ...s(), dead: 1 }).rootPitch).toBeGreaterThan(1.4); });
  it('맞으면 몸이 휘청이고 곧 돌아온다', () => { expect(computePose({ ...s(), hit: 0.5 }).torsoLean).toBeGreaterThan(0.1); expect(computePose({ ...s(), hit: 0 }).torsoLean).toBeCloseTo(0, 1); });
  it('같은 시드는 같은 겉모습', () => { expect(lookFor(7)).toEqual(lookFor(7)); expect(lookFor(7, 0xff0000).team).toBe(0xff0000); });
  it('out 객체를 재사용한다', () => { const o = blankPose(); expect(computePose(s(), o)).toBe(o); });
});
