import { describe, expect, it } from 'vitest';
import { findPath, walkable, type Nav } from '../../src/shooter/nav';
import { MinPriorityQueue } from '../../src/shared/min-priority-queue';
const grid = (): Nav => ({ half: 3, w: 6, block: new Uint8Array(36), g: new Float32Array(36), from: new Int32Array(36), mark: new Uint32Array(36), stamp: 0 });
describe('bot navigation', () => {
  it('rejects nonfinite and out-of-bounds segments', () => {
    const nav = grid(); expect(walkable(nav, 0, 0, Infinity, 0)).toBe(false);
    expect(walkable(nav, 0, 0, 3, 0)).toBe(false);
    expect(findPath(nav, NaN, 0, 1, 1)).toBeNull();
  });
  it('checks blocked zero-length segments and diagonal corners', () => {
    const nav = grid(); nav.block[3 * 6 + 4] = 1;
    expect(walkable(nav, 1.5, 0.5, 1.5, 0.5)).toBe(false);
    expect(walkable(nav, 0.5, 0.5, 1.5, 1.5)).toBe(false);
    expect(walkable(nav, 0.5, 0.5, 0.5, 1.5)).toBe(true);
  });
  it('returns a usable waypoint for the same cell and resets wrapped stamps', () => {
    const nav = grid(); expect(findPath(nav, 0.1, 0.1, 0.8, 0.8)).toEqual([0.5, 0.5]);
    nav.stamp = 0xfffffffe; nav.mark.fill(2);
    const path = findPath(nav, -2.5, -2.5, 2.5, 2.5);
    expect(path?.slice(-2)).toEqual([2.5, 2.5]); expect(nav.stamp).toBe(2);
  });
  it('never smooths through a blocked diagonal corner', () => {
    const nav = grid(); nav.block[3 * 6 + 4] = 1;
    const path = findPath(nav, 0.5, 0.5, 1.5, 1.5)!;
    expect(path.length).toBeGreaterThan(2);
    let x = 0.5, z = 0.5;
    for (let i = 0; i < path.length; i += 2) { expect(walkable(nav, x, z, path[i], path[i + 1])).toBe(true); x = path[i]; z = path[i + 1]; }
  });
});
it('pops priorities in ascending order and handles empty queues', () => {
  const heap = new MinPriorityQueue();
  for (const n of [7, 2, 6, 3, 1, 4, 5]) heap.push(n, n);
  expect(Array.from({ length: 7 }, () => heap.pop())).toEqual([1, 2, 3, 4, 5, 6, 7]);
  expect(heap.pop()).toBeUndefined();
});
