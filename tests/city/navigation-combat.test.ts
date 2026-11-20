import { describe, expect, it } from 'vitest';
import { addSolid, clearLine, emptyMap, findPath, navBlocked, rectFree, removeSolid, solidAt, type Solid } from '../../src/city/map';
import { updateBullets } from '../../src/city/actors';
import { World } from '../../src/city/world';

const wall = (x: number, y: number, w = 40, h = 40): Solid => ({
  x, y, w, h, height: 40, wall: '#888', roof: '#999', struct: 0, alive: true,
});

describe('LAST CITY spatial grid', () => {
  it('rejects overlapping footprints and frees a demolished footprint', () => {
    const map = emptyMap();
    const id = addSolid(map, wall(200, 200));
    expect(rectFree(map, 200, 200, 40, 40)).toBe(false);
    expect(rectFree(map, 244, 200, 40, 40)).toBe(true);
    expect(rectFree(map, 243, 200, 40, 40)).toBe(false);
    removeSolid(map, id);
    expect(rectFree(map, 200, 200, 40, 40)).toBe(true);
    expect(solidAt(map, 220, 220)).toBeNull();
  });

  it('does not wrap negative grid columns into adjacent rows', () => {
    const map = emptyMap();
    const id = addSolid(map, wall(-20, 200));
    expect(map.grid.filter(cell => cell.includes(id))).toHaveLength(1);
    expect(solidAt(map, 10, 220)).toBe(map.solids[id]);
    removeSolid(map, id);
    expect(map.grid.some(cell => cell.includes(id))).toBe(false);
  });

  it('returns a reachable waypoint when a blocked goal resolves to the start cell', () => {
    const map = emptyMap();
    addSolid(map, wall(200, 200));
    expect(findPath(map, 180, 180, 220, 220)).toEqual([180, 180]);
    expect(findPath(map, 180, 180, 185, 185)).toEqual([185, 185]);
  });

  it('rejects non-finite positions and invalid footprints', () => {
    const map = emptyMap();
    expect(solidAt(map, NaN, 20)).toBeNull();
    expect(navBlocked(map, Infinity, 20)).toBe(true);
    expect(clearLine(map, 180, 180, NaN, 200)).toBe(false);
    expect(findPath(map, NaN, 180, 200, 200)).toBeNull();
    expect(rectFree(map, 200, 200, 0, 40)).toBe(false);
    expect(rectFree(map, NaN, 200, 40, 40)).toBe(false);
  });
});

describe('LAST CITY piercing projectiles', () => {
  it('damages each vehicle once while allowing a railgun projectile to continue', () => {
    const world = new World({ seed: 42, difficulty: 'd3', klass: 'warlord', tutorial: true });
    world.map = emptyMap();
    world.actors.length = 0;
    world.vehicles.length = 0;
    const first = world.spawnVehicle('sedan', 500, 500, 0);
    const second = world.spawnVehicle('sedan', 560, 500, 0);
    first.f = second.f = -1;
    const firstHp = first.hp, secondHp = second.hp;
    world.bullets.push({ x: 490, y: 500, px: 490, py: 500, vx: 200, vy: 0, life: 2, dmg: 10, f: 0, src: 0, w: 'railgun', boss: true });
    for (let i = 0; i < 20; i++) updateBullets(world, 0.02);
    expect(first.hp).toBeCloseTo(firstHp - 15);
    expect(second.hp).toBeCloseTo(secondHp - 15);
    expect(world.bullets).toHaveLength(1);
  });
});
