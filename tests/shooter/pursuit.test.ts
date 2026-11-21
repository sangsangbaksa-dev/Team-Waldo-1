import { describe, expect, it } from 'vitest';
import { pursuitPoint } from '../../src/shooter/bot';

describe('봇 추적', () => {
  it('마지막 목격 지점의 서로 다른 측면을 노리고 가까우면 간격을 줄인다', () => {
    expect(pursuitPoint(0, 0, 20, 0, 1)).toEqual({ x: 20, z: 6 });
    expect(pursuitPoint(0, 0, 20, 0, -1)).toEqual({ x: 20, z: -6 });
    expect(pursuitPoint(0, 0, 1, 0, 1).z).toBeCloseTo(0.3);
    expect(pursuitPoint(1, 2, 1, 2, 1)).toEqual({ x: 1, z: 2 });
  });
});
