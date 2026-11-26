import { describe, expect, it } from 'vitest';
import { clearHolds, createHolds, driveInput, pressHold, releaseHold } from '../../src/race/controls';
import { groundKmh, kmh } from '../../src/race/physics';

describe('SPEED RUSH holds', () => {
  it('keeps a control down until every finger lets go', () => {
    const book = createHolds();
    pressHold(book, 1, 'left');
    pressHold(book, 2, 'left');
    expect(releaseHold(book, 1)).toBe(true);
    expect(book.down.left).toBe(true);
    expect(releaseHold(book, 1)).toBeNull();
    expect(releaseHold(book, 2)).toBe(false);
    expect(book.down.left).toBe(false);
  });

  it('moves a finger from one pedal to another without leaving the first stuck', () => {
    const book = createHolds();
    pressHold(book, 4, 'gas');
    pressHold(book, 4, 'brake');
    expect(book.down.gas).toBe(false);
    expect(book.down.brake).toBe(true);
    clearHolds(book);
    expect(book.down.brake).toBe(false);
    expect(book.owner.size).toBe(0);
  });

  it('lets the brake cancel throttle and opposing steer', () => {
    expect(driveInput({ throttle: true, brake: true, left: true, right: true, drift: true, nitro: false })).toEqual({
      throttle: 0, brake: 1, steer: 0, drift: true, nitro: false,
    });
  });

  it('counts sideways speed in the speed readout', () => {
    const car = { vf: 20, vl: 20 };
    expect(groundKmh(car)).toBeGreaterThan(kmh(car));
  });
});
