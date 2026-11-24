import { describe, expect, it } from 'vitest';
// @ts-expect-error JavaScript domain module has no declaration file.
import { createDecoy, deployDecoy, tickDecoy, decoyTarget } from '../../src/room-tone/domain/decoy.mjs';
describe('recorder decoy', () => {
  it('has limited uses and cannot override detection or hiding inspection', () => {
    const d = createDecoy();
    expect(deployDecoy(d, -1, true)).toBe(false);
    expect(deployDecoy(d, 12, false)).toBe(false);
    expect(deployDecoy(d, 12, true)).toBe(true);
    expect(deployDecoy(d, 14, true)).toBe(false);
    expect(decoyTarget(d, false, false)).toBe(12);
    expect(decoyTarget(d, true, false)).toBeNull();
    expect(decoyTarget(d, false, true)).toBeNull();
    tickDecoy(d, 10);
    expect(decoyTarget(d, false, false)).toBeNull();
    expect(deployDecoy(d, 14, true)).toBe(true);
    tickDecoy(d, 10);
    expect(deployDecoy(d, 15, true)).toBe(false);
  });
});
