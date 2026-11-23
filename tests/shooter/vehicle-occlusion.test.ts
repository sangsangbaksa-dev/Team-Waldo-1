import { describe, expect, it } from 'vitest';
import { Match, type Vehicle } from '../../src/shooter/sim';
import { emptyTerrain } from '../../src/shooter/terrain';
import { addBox, rayWorld } from '../../src/shooter/world';

function carRange(withWall: boolean): { m: Match; car: Vehicle } {
  const m = new Match({ seed: 1, mode: 'br', difficulty: 'normal', humans: [{ name: 'Shooter' }], fill: 1, vehicles: false, bombs: false });
  m.map.boxes = []; m.map.grid.clear(); m.map.terrain = emptyTerrain();
  m.vehicles = [];
  if (withWall) addBox(m.map, { x0: 10, x1: 10.2, z0: -2, z1: 2, y0: 0, y1: 3, kind: 'wall', tex: 0 });
  const car: Vehicle = {
    id: 0, kind: 'car', x: 11.5, z: 0, yaw: 0, speed: 0, hp: 100, max: 100,
    driver: -1, wreck: false, moving: false, w: 2, d: 1, h: 1.5, c: 0,
    v: 0, box: m.map.boxes.length, lastBy: -1, soundT: 0, hits: new Map(), remote: false,
  };
  addBox(m.map, { x0: 10.5, x1: 12.5, z0: -0.5, z1: 0.5, y0: 0, y1: 1.5, kind: 'vehicle', tex: 0 });
  m.vehicles.push(car);
  return { m, car };
}

describe('ZERO ZONE vehicle bullet cover', () => {
  it('does not damage a parked vehicle just behind a thin bulletproof wall', () => {
    const { m, car } = carRange(true), hit = { boxIndex: -1 };
    expect(rayWorld(m.map, 0, 1, 0, 1, 0, 0, 40, hit)).toBe(10);
    expect(hit.boxIndex).toBe(0);
    const ends: number[] = [];
    m.bullet(0, 'rifle', 0, 1, 0, 0, 0, ends, false);
    expect(car.hp).toBe(100);
    expect(ends[0]).toBeCloseTo(10, 6);
  });
  it('damages the same car when the wall is absent', () => {
    const { m, car } = carRange(false), hit = { boxIndex: -1 };
    expect(rayWorld(m.map, 0, 1, 0, 1, 0, 0, 40, hit)).toBe(10.5);
    expect(hit.boxIndex).toBe(car.box);
    m.bullet(0, 'rifle', 0, 1, 0, 0, 0, [], false);
    expect(car.hp).toBeLessThan(100);
  });
  it('still blocks shots through destroyed parked cars', () => {
    const { m, car } = carRange(false);
    car.wreck = true;
    const ends: number[] = [];
    m.bullet(0, 'rifle', 0, 1, 0, 0, 0, ends, false);
    expect(ends[0]).toBeCloseTo(10.5, 6);
  });
});
