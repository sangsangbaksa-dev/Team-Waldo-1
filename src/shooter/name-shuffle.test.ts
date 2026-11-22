import { describe, expect, it, vi } from 'vitest';
import { makeRng } from './config';
import { shuffledBotNames } from './sim';

describe('ZERO ZONE cross-browser deterministic AI names', () => {
  const source = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  it('repeats the same seeded permutation without modifying the input', () => {
    const a = shuffledBotNames(source, makeRng(138));
    const b = shuffledBotNames(source, makeRng(138));
    const c = shuffledBotNames(source, makeRng(926));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect([...a].sort()).toEqual([...source].sort());
    expect(source).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  });
  it('uses exactly one random draw per Fisher–Yates position', () => {
    const random = vi.fn(() => 0.3);
    shuffledBotNames(source, random);
    expect(random).toHaveBeenCalledTimes(source.length - 1);
    expect(shuffledBotNames([], random)).toEqual([]);
    expect(shuffledBotNames(['single'], random)).toEqual(['single']);
  });
  it('keeps the first and last entries reachable', () => {
    expect(shuffledBotNames(['first', 'last'], () => 0)).toEqual(['last', 'first']);
    expect(shuffledBotNames(['first', 'last'], () => 0.99)).toEqual(['first', 'last']);
  });
});
