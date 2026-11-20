import { describe, expect, it } from 'vitest';
import { findPath, navFor, type Nav } from './nav';
import { addBox, moveBox, type Box, type GameMap } from './world';

function grid(w = 9): Nav {
  return { half: w / 2, w, block: new Uint8Array(w * w), g: new Float32Array(w * w), from: new Int32Array(w * w), mark: new Uint32Array(w * w), stamp: 0 };
}

function world(): GameMap {
  return { half: 32, boxes: [], grid: new Map<number, number[]>() } as unknown as GameMap;
}

const vehicle: Box = { x0: 1, x1: 3, z0: 1, z1: 3, y0: 0, y1: 2, kind: 'vehicle', tex: 0 };

describe('ZERO ZONE spatial navigation', () => {
  it('finds a detour repeatedly with the stamped search arrays', () => {
    const nav = grid();
    for (let z = 1; z < 8; z++) nav.block[z * nav.w + 4] = 1;
    const first = findPath(nav, -3, 0, 3, 0);
    expect(first).not.toBeNull();
    expect(first!.length).toBeGreaterThan(2);
    expect(first!.slice(-2)).toEqual([3, 0]);
    expect(findPath(nav, -3, 0, 3, 0)).toEqual(first);
    expect(findPath(nav, 3, 0, -3, 0)?.slice(-2)).toEqual([-3, 0]);
  });

  it('returns null when separated by a solid wall', () => {
    const nav = grid();
    for (let z = 0; z < nav.w; z++) nav.block[z * nav.w + 4] = 1;
    expect(findPath(nav, -3, 0, 3, 0)).toBeNull();
    expect(findPath(nav, -3, 0, -2, 0)).not.toBeNull();
  });

  it('removes old collision cells when a vehicle moves', () => {
    const map = world();
    addBox(map, { ...vehicle });
    const oldKeys = [...map.grid.keys()];
    moveBox(map, 0, { x0: 17, x1: 19, z0: 17, z1: 19 });
    expect(oldKeys.every(k => !map.grid.has(k))).toBe(true);
    expect([...map.grid.values()].flat()).toEqual([0]);
    moveBox(map, 0, { y0: 999, y1: 1000 });
    expect(map.grid.size).toBe(0);
    moveBox(map, 0, { y0: 0, y1: 2 });
    expect([...map.grid.values()].flat()).toEqual([0]);
  });

  it('does not bake moving vehicles into static navigation', () => {
    const map = world();
    addBox(map, { ...vehicle });
    expect(navFor(map).block.some(v => v !== 0)).toBe(false);
  });
});
