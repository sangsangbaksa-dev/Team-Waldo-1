import { describe, expect, it } from 'vitest';
import { roundLabel } from '../../src/squad/round';

describe('squad match round labels', () => {
  it('labels regular rounds and draw-driven overtime consistently', () => {
    expect([1, 2, 3].map(roundLabel)).toEqual(['라운드 1', '라운드 2', '라운드 3']);
    expect(roundLabel(4)).toBe('연장전 1');
    expect(roundLabel(8)).toBe('연장전 5');
  });
});
